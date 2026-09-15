import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { Prisma, ShopifyWebhookReceiptEsito, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProfileCacheService } from '../../auth/auth-profile-cache.service';
import { SupabaseService } from '../../auth/supabase.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { PlatformAdminService } from '../../common/platform-admin/platform-admin.service';
import { ShopifyConnectionService } from '../../shopify/shopify-connection.service';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ShopifySyncService } from '../../shopify/shopify-sync.service';
import { ShopifyTrasportoException } from '../../shopify/shopify-trasporto.util';
import { ShopifyWebhookCodaService } from '../../shopify/shopify-webhook-coda.service';
import { CorsiaWebhookSuperataException } from '../../shopify/shopify-webhook-corsia.util';
import { ShopifyWebhooksController } from '../../shopify/shopify-webhooks.controller';
import { TenantBackupExportService } from '../../tenant/tenant-backup/tenant-backup-export.service';
import { TenantBackupImportService } from '../../tenant/tenant-backup/tenant-backup-import.service';
import { readStreamToBuffer } from '../fixtures/tenant-backup.fixture';
import { archivioImmaginiFinto } from './archivio-immagini-finto';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * LA CODA DEI WEBHOOK SHOPIFY su database vero (docs/30 §7.1.2, decisioni D1–D7 e le
 * sei conferme del proprietario del 15/09/2026).
 *
 * Le prove obbligatorie, nell'ordine del mandato:
 *
 * ```text
 *   A1   conferma SOLO dopo il commit della ricevuta; l'elaborazione non la trattiene
 *   A2   salvataggio fallito → nessun 200, nessuna ricevuta
 *   A3   consegne duplicate, anche concorrenti → una ricevuta, una elaborazione
 *   A4   arresto PRIMA degli effetti → si riprende, effetti una volta
 *   A5   arresto DOPO gli effetti, prima della chiusura → ripetizione senza doppioni
 *        (prodotto importato dal pull vero, quantità dalla riconciliazione vera)
 *   A6   vecchio lavoratore superato: la guardia nella transazione lo ferma, niente scrive
 *   A7   ordine fra topic correlati: chi attende un ritentativo trattiene i correlati,
 *        non le risorse indipendenti; risorsa non risolvibile = correlata a tutto
 *   A8   risorsa FALLITA: blocca solo sé stessa e i propri correlati; «Riprova» riparte da lei
 *   A9   ripristino da backup: le ricevute da applicare tornano SOSPESE, e non ripartono da sole
 *   A10  isolamento tenant/negozio: associazione cambiata → scartata, nessun effetto;
 *        l'altro tenant non ne è toccato
 *   A11  pulizia delle concluse oltre 30 giorni (D7): pendenti, fallite e sospese restano;
 *        deduplicazione, ordine per risorsa e backup intatti
 *   +    sincronizzazione spenta → scartata, senza «Riprova»; ritentativi solo per natura
 * ```
 *
 * ⚠️ Il lavoratore qui è chiamato DIRETTAMENTE (`lavoraCorsia`): nessun timer, nessun
 *    `setImmediate` lasciato correre fra una prova e l'altra. La sveglia dopo il `200` è
 *    provata a parte, nel controller (spec unitaria) e in A1 con la corsa vera.
 */
describe('Coda webhook Shopify — ricevute durevoli, corsia per negozio, ordine per risorsa', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let connessioneVera: ShopifyConnectionService;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;
  let exporter: TenantBackupExportService;
  let importer: TenantBackupImportService;
  let shopId: string;

  const DOMINIO = 'coda.myshopify.com';
  const DOMINIO_B = 'coda-b.myshopify.com';
  const LEASE_MS = 5 * 60_000;
  const config = {
    webhookScanIntervalMs: 0,
    webhookLaneLeaseMs: LEASE_MS,
    normalizeShopDomain: (d: string) => d.trim().toLowerCase(),
  };

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
    connessioneVera = new ShopifyConnectionService(prisma as never, {
      shopifyApiKey: '',
      shopifyApiSecret: '',
    } as never);
    const configNest = new ConfigService({ PLATFORM_ADMIN_EMAILS: '' });
    const storage = new SupabaseService(configNest);
    exporter = new TenantBackupExportService(prisma as never, storage, configNest);
    importer = new TenantBackupImportService(
      prisma as never,
      storage,
      configNest,
      new PlatformAdminService(configNest),
      new AuthProfileCacheService(),
    );
  });

  /**
   * ⛔ Gli stati sync di QUESTA prova (A5 li crea con la riconciliazione vera) si tolgono
   *    per nome, prima e dopo: `shopify_inventory_sync_states` non ha chiavi esterne nel
   *    database e il `TRUNCATE … CASCADE` della fixture non la raggiunge (docs/DA-FARE
   *    §21-ter). Senza, A9 esportava una riga con una variante che non c'era più.
   *    Contenimento dichiarato, limitato ai tenant della fixture; la correzione (le FK)
   *    resta la voce aperta.
   */
  function cancellaStatiSyncDellaProva(): Promise<unknown> {
    return prisma.shopifyInventorySyncState.deleteMany({
      where: { tenantId: { in: [IDS.tenantA, IDS.tenantB] } },
    });
  }

  afterAll(async () => {
    if (prisma) {
      await cancellaStatiSyncDellaProva().catch(() => undefined);
      await svuota(prisma).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await cancellaStatiSyncDellaProva();
    await svuota(prisma);
    await creaDataset(prisma);
    negozio = new NegozioSimulato(DOMINIO, 996000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/996001' },
    });
    shopId = riga.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId,
        autoSyncEnabled: true,
        scopes: ['read_products', 'write_products', 'write_inventory'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products', 'write_inventory'],
      },
    });
    await prisma.location.update({
      where: { id: IDS.locA1 },
      data: { shopifyLocationId: '996100' },
    });
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  /** Il finto OAuth: come quello vero, trova il tenant dal dominio della connessione. */
  const oauth = () => ({
    resolveTenantByShopDomain: async (shopDomain: string) => {
      const conn = await prisma.shopifyConnection.findFirst({
        where: { shopDomain: config.normalizeShopDomain(shopDomain) },
        select: { tenantId: true },
      });
      if (!conn) {
        throw new NotFoundException('Tenant non trovato per questo shop Shopify');
      }
      return conn.tenantId;
    },
  });

  type Gestore = (tenantId: string, topic: string, payload: unknown) => Promise<void>;

  /** Una coda con un elaboratore a scelta; `prismaDellaCoda` per far fallire il salvataggio. */
  function creaCoda(gestore: Gestore, prismaDellaCoda: unknown = prisma) {
    const sync = {
      handleWebhook: vi.fn((tenantId: string, topic: string, payload: unknown) =>
        gestore(tenantId, topic, payload),
      ),
    };
    const coda = new ShopifyWebhookCodaService(
      prismaDellaCoda as never,
      config as never,
      oauth() as never,
      connessioneVera,
      sync as never,
    );
    return { coda, sync };
  }

  let progressivo = 0;
  function consegna(topic: string, payload: Record<string, unknown>, id?: string) {
    progressivo += 1;
    return {
      shopDomain: DOMINIO,
      webhookId: id ?? `consegna-${progressivo}-${Date.now()}`,
      topic,
      payload,
      triggeredAt: new Date(),
      apiVersion: '2026-07',
    };
  }

  const ricevuta = (id: string) =>
    prisma.shopifyWebhookReceipt.findUniqueOrThrow({ where: { id } });

  const corsia = () =>
    prisma.shopifyWebhookLane.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });

  /** Una promessa che si sblocca da fuori: l'elaboratore «tenuto fermo». */
  function barriera() {
    let sblocca: () => void = () => undefined;
    const attesa = new Promise<void>((resolve) => (sblocca = resolve));
    return { attesa, sblocca: () => sblocca() };
  }

  const dormi = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ── A1 · la conferma arriva dopo il commit, e non aspetta l'elaborazione ─

  describe('A1 · conferma solo dopo il commit della ricevuta', () => {
    it('il 200 del controller arriva con la ricevuta già durevole, mentre l elaborazione è ancora ferma; poi la sveglia la porta a elaborata', async () => {
      const fermo = barriera();
      const { coda, sync } = creaCoda(async () => fermo.attesa);
      const controller = new ShopifyWebhooksController(
        { verifyHmac: vi.fn() } as never,
        coda,
      );
      const corpo = Buffer.from(JSON.stringify({ id: 5001 }));

      const risposta = controller.handle(
        { rawBody: corpo } as never,
        'hmac',
        'orders/create',
        DOMINIO,
        'consegna-a1',
        '2026-09-15T18:00:00Z',
        '2026-07',
      );
      const esito = await Promise.race([
        risposta.then(() => 'risposto' as const),
        dormi(2_000).then(() => 'ancora in attesa' as const),
      ]);
      expect(esito).toBe('risposto');

      // La ricevuta è nel database PRIMA che l'elaboratore abbia finito.
      const salvata = await prisma.shopifyWebhookReceipt.findUniqueOrThrow({
        where: { shopDomain_webhookId: { shopDomain: DOMINIO, webhookId: 'consegna-a1' } },
      });
      expect(salvata).toMatchObject({
        tenantId: IDS.tenantA,
        shopId,
        topic: 'orders/create',
        risorsa: 'ordine:5001',
        apiVersion: '2026-07',
        tentativi: 0,
      });
      expect([ShopifyWebhookReceiptEsito.in_coda, ShopifyWebhookReceiptEsito.in_lavorazione]).toContain(
        salvata.esito,
      );
      expect(salvata.processedAt).toBeNull();

      // La sveglia dopo il 200 ha avviato il lavoratore: è lui a essere fermo sull'elaboratore.
      await vi.waitFor(() => expect(sync.handleWebhook).toHaveBeenCalledTimes(1));
      fermo.sblocca();
      await vi.waitFor(async () =>
        expect((await ricevuta(salvata.id)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata),
      );
      const finale = await ricevuta(salvata.id);
      expect(finale.tentativi).toBe(1);
      expect(finale.processedAt).not.toBeNull();
      expect(sync.handleWebhook).toHaveBeenCalledWith(IDS.tenantA, 'orders/create', { id: 5001 }, expect.anything());
      // La data dell'ultimo evento ACCOLTO è scritta all'accoglienza.
      const conn = await prisma.shopifyConnection.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });
      expect(conn.lastWebhookEventAt).not.toBeNull();
      // E la corsia è stata rilasciata.
      expect(await corsia()).toMatchObject({ claimedAt: null, claimedBy: null, claimVersion: 1 });
    });
  });

  // ── A2 · salvataggio fallito: niente 200 ─────────────────────────────────

  describe('A2 · salvataggio fallito → nessuna conferma', () => {
    it('se l inserimento della ricevuta fallisce, la richiesta esce con errore, non c è ricevuta e l elaboratore non parte', async () => {
      const prismaGuasto = new Proxy(prisma, {
        get(bersaglio, proprieta, ricevente) {
          if (proprieta === 'shopifyWebhookReceipt') {
            const delegato = Reflect.get(bersaglio, proprieta, ricevente) as object;
            return new Proxy(delegato, {
              get(d, p) {
                if (p === 'create') {
                  return () =>
                    Promise.reject(
                      new Prisma.PrismaClientInitializationError('database giù', 'test', 'P1001'),
                    );
                }
                return Reflect.get(d, p);
              },
            });
          }
          const valore = Reflect.get(bersaglio, proprieta, ricevente) as unknown;
          return typeof valore === 'function' ? (valore as (...a: unknown[]) => unknown).bind(bersaglio) : valore;
        },
      });
      const { coda, sync } = creaCoda(async () => undefined, prismaGuasto);
      const controller = new ShopifyWebhooksController({ verifyHmac: vi.fn() } as never, coda);
      const sveglia = vi.spyOn(coda, 'sveglia');

      await expect(
        controller.handle(
          { rawBody: Buffer.from('{"id":5002}') } as never,
          'hmac',
          'orders/create',
          DOMINIO,
          'consegna-a2',
          undefined,
          undefined,
        ),
      ).rejects.toThrow('database giù');

      expect(await prisma.shopifyWebhookReceipt.count()).toBe(0);
      expect(sveglia).not.toHaveBeenCalled();
      expect(sync.handleWebhook).not.toHaveBeenCalled();
      // E la data dell'ultimo evento NON è stata scritta: non è stato accolto niente.
      const conn = await prisma.shopifyConnection.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });
      expect(conn.lastWebhookEventAt).toBeNull();
    });
  });

  // ── A3 · consegne duplicate ──────────────────────────────────────────────

  describe('A3 · consegne duplicate', () => {
    it('lo stesso X-Shopify-Webhook-Id due volte, anche in concorrenza: una ricevuta, una elaborazione, 200 a entrambe', async () => {
      const { coda, sync } = creaCoda(async () => undefined);
      const stessa = consegna('orders/create', { id: 5003 }, 'consegna-a3');

      const [prima, seconda] = await Promise.all([coda.accogli(stessa), coda.accogli(stessa)]);
      expect([prima.doppione, seconda.doppione].sort()).toEqual([false, true]);
      expect(prima.ricevutaId).toBe(seconda.ricevutaId);
      expect(await prisma.shopifyWebhookReceipt.count()).toBe(1);

      // Una terza consegna, dopo l'elaborazione: sempre la stessa ricevuta, niente da rifare.
      await coda.lavoraCorsia(IDS.tenantA);
      expect(sync.handleWebhook).toHaveBeenCalledTimes(1);
      const terza = await coda.accogli(stessa);
      expect(terza.doppione).toBe(true);
      await coda.lavoraCorsia(IDS.tenantA);
      expect(sync.handleWebhook).toHaveBeenCalledTimes(1);
      expect((await ricevuta(prima.ricevutaId)).tentativi).toBe(1);
    });
  });

  // ── A4 / A5 · arresto prima e dopo gli effetti ───────────────────────────

  describe('A4 · arresto PRIMA degli effetti', () => {
    it('una ricevuta lasciata in_lavorazione da un processo morto (lease scaduta) si riprende: effetti UNA volta', async () => {
      const { coda: morta } = creaCoda(async () => undefined);
      const accolta = await morta.accogli(consegna('orders/create', { id: 5004 }));
      // Il processo morto: corsia rivendicata, ricevuta presa, poi più niente.
      await prisma.$executeRaw`INSERT INTO "shopify_webhook_lanes" ("tenant_id", "claimed_by", "claimed_at", "claim_version")
        VALUES (${IDS.tenantA}::uuid, 'processo-morto', now() - interval '10 minutes', 7)`;
      await prisma.shopifyWebhookReceipt.update({
        where: { id: accolta.ricevutaId },
        data: { esito: ShopifyWebhookReceiptEsito.in_lavorazione, lavorataDaVersione: 7 },
      });

      const { coda: viva, sync } = creaCoda(async () => undefined);
      await viva.lavoraCorsia(IDS.tenantA);

      expect(sync.handleWebhook).toHaveBeenCalledTimes(1);
      expect(await ricevuta(accolta.ricevutaId)).toMatchObject({
        esito: ShopifyWebhookReceiptEsito.elaborata,
        tentativi: 1,
        lavorataDaVersione: null,
      });
      expect((await corsia()).claimVersion).toBe(8);
    });

    it('con la lease ANCORA VIVA la corsia non si rivendica: la ricevuta aspetta, nessuna doppia elaborazione', async () => {
      const { coda: altra } = creaCoda(async () => undefined);
      const accolta = await altra.accogli(consegna('orders/create', { id: 5005 }));
      await prisma.$executeRaw`INSERT INTO "shopify_webhook_lanes" ("tenant_id", "claimed_by", "claimed_at", "claim_version")
        VALUES (${IDS.tenantA}::uuid, 'altro-processo-vivo', now() - interval '1 minute', 3)`;

      const { coda, sync } = creaCoda(async () => undefined);
      await coda.lavoraCorsia(IDS.tenantA);

      expect(sync.handleWebhook).not.toHaveBeenCalled();
      expect((await ricevuta(accolta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_coda);
      expect(await corsia()).toMatchObject({ claimedBy: 'altro-processo-vivo', claimVersion: 3 });
    });
  });

  describe('A5 · arresto DOPO gli effetti, prima della chiusura', () => {
    function creaPull() {
      return new ShopifyProductPullService(
        prisma as never,
        negozio.oauth() as never,
        { requestedScopes: ['read_products', 'write_products'] } as never,
        negozio.admin() as never,
        {
          healStaleErrorStatus: vi.fn(),
          touchSync: vi.fn(),
          recordApiFailure: vi.fn(),
          markSynced: vi.fn(),
          markError: vi.fn(),
        } as never,
        negozio.enrichment() as never,
        storico,
        registro,
        archivioImmaginiFinto() as never,
      );
    }

    function creaSyncVero(pull: ShopifyProductPullService | null) {
      const riconciliazione = new ShopifyInventoryReconciliationService(prisma as never);
      const push = new ShopifyInventoryPushService(
        prisma as never,
        negozio.oauth() as never,
        negozio.admin() as never,
        negozio.graphql() as never,
        { touchSync: vi.fn() } as never,
        riconciliazione,
        storico,
        registro,
      );
      return new ShopifySyncService(
        prisma as never,
        connessioneVera,
        pull as never,
        null as never,
        riconciliazione,
        push,
        storico,
        null as never,
      );
    }

    /** Simula la morte del processo DOPO gli effetti: la ricevuta resta presa da una versione superata. */
    async function riportaComeInterrotta(ricevutaId: string): Promise<void> {
      const lane = await corsia();
      await prisma.shopifyWebhookReceipt.update({
        where: { id: ricevutaId },
        data: {
          esito: ShopifyWebhookReceiptEsito.in_lavorazione,
          lavorataDaVersione: lane.claimVersion,
          processedAt: null,
        },
      });
      await prisma.$executeRaw`UPDATE "shopify_webhook_lanes" SET "claimed_by" = 'morto', "claimed_at" = now() - interval '10 minutes' WHERE "tenant_id" = ${IDS.tenantA}::uuid`;
    }

    it('prodotto: il webhook ripetuto dal pull VERO non crea un secondo articolo né una seconda variante', async () => {
      const sync = creaSyncVero(creaPull());
      const coda = new ShopifyWebhookCodaService(
        prisma as never,
        config as never,
        oauth() as never,
        connessioneVera,
        sync,
      );
      const remoto = negozio.semina({
        title: 'Maglia coda',
        vendor: 'F',
        product_type: 'T',
        tags: 'collaudo',
        opzioni: [{ name: 'Taglia', values: ['M'] }],
        varianti: [{ sku: 'CODA-M', barcode: '9960000000011', price: '10.00', valori: ['M'] }],
      });
      const accolta = await coda.accogli(consegna('products/update', negozio.webhook(remoto.id)));
      await coda.lavoraCorsia(IDS.tenantA);
      expect((await ricevuta(accolta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      const prodottiPrima = await prisma.product.findMany({
        where: { tenantId: IDS.tenantA, shopifyProductId: String(remoto.id) },
        include: { variants: true },
      });
      expect(prodottiPrima).toHaveLength(1);
      expect(prodottiPrima[0]!.variants).toHaveLength(1);

      await riportaComeInterrotta(accolta.ricevutaId);
      await coda.lavoraCorsia(IDS.tenantA);

      const dopo = await ricevuta(accolta.ricevutaId);
      expect(dopo.esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      expect(dopo.tentativi).toBe(2);
      const prodottiDopo = await prisma.product.findMany({
        where: { tenantId: IDS.tenantA, shopifyProductId: String(remoto.id) },
        include: { variants: true },
      });
      expect(prodottiDopo).toHaveLength(1);
      expect(prodottiDopo[0]!.variants.map((v) => v.id)).toEqual(prodottiPrima[0]!.variants.map((v) => v.id));
    });

    it('quantità: la riconciliazione VERA ripetuta lascia uno stato sync solo, con gli stessi valori', async () => {
      const pull = creaPull();
      const sync = creaSyncVero(pull);
      const coda = new ShopifyWebhookCodaService(
        prisma as never,
        config as never,
        oauth() as never,
        connessioneVera,
        sync,
      );
      const remoto = negozio.semina({
        title: 'Cappello coda',
        vendor: 'F',
        product_type: 'T',
        tags: 'collaudo',
        opzioni: [{ name: 'Taglia', values: ['U'] }],
        varianti: [{ sku: 'CODA-U', barcode: '9960000000028', price: '10.00', valori: ['U'] }],
      });
      await pull.importProductFromWebhook(IDS.tenantA, negozio.webhook(remoto.id) as never);
      const variante = await prisma.productVariant.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, sku: 'CODA-U' },
      });
      await prisma.inventoryLevel.create({
        data: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA1, onHand: 4, committed: 0, available: 4 },
      });
      const accolta = await coda.accogli(
        consegna('inventory_levels/update', {
          inventory_item_id: Number(variante.shopifyInventoryItemId),
          location_id: 996100,
          available: 4,
        }),
      );
      await coda.lavoraCorsia(IDS.tenantA);
      expect((await ricevuta(accolta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      const statiPrima = await prisma.shopifyInventorySyncState.findMany({ where: { tenantId: IDS.tenantA } });
      expect(statiPrima).toHaveLength(1);
      expect(statiPrima[0]).toMatchObject({ lastObservedShopifyAvailable: 4, mismatchDetected: false });

      await riportaComeInterrotta(accolta.ricevutaId);
      await coda.lavoraCorsia(IDS.tenantA);

      expect((await ricevuta(accolta.ricevutaId)).tentativi).toBe(2);
      const statiDopo = await prisma.shopifyInventorySyncState.findMany({ where: { tenantId: IDS.tenantA } });
      expect(statiDopo).toHaveLength(1);
      expect(statiDopo[0]).toMatchObject({ id: statiPrima[0]!.id, lastObservedShopifyAvailable: 4, mismatchDetected: false });
      expect(
        await prisma.inventoryLevel.findUniqueOrThrow({
          where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
        }),
      ).toMatchObject({ onHand: 4, committed: 0, available: 4 });
    });
  });

  // ── A6 · vecchio lavoratore superato ─────────────────────────────────────

  describe('A6 · vecchio lavoratore superato', () => {
    it('il lavoratore lento, superato mentre era fermo, viene bloccato dalla guardia dentro la transazione: nessuna seconda scrittura, la ricevuta resta di chi l ha finita', async () => {
      const syncVero = new ShopifySyncService(
        prisma as never,
        connessioneVera,
        null as never,
        null as never,
        null as never,
        null as never,
        storico,
        null as never,
      );
      const fermo = barriera();
      // Il lavoratore LENTO: aspetta prima di applicare, poi usa il servizio vero con la SUA guardia.
      const lento = new ShopifyWebhookCodaService(
        prisma as never,
        config as never,
        oauth() as never,
        connessioneVera,
        {
          handleWebhook: async (tenantId: string, topic: string, payload: unknown, guardia: unknown) => {
            await fermo.attesa;
            return syncVero.handleWebhook(tenantId, topic, payload, guardia as never);
          },
        } as never,
      );
      const accolta = await lento.accogli(
        consegna('customers/create', { id: 700, email: 'cliente@example.com', first_name: 'Anna', last_name: 'Bi' }),
      );
      const corsaLenta = lento.lavoraCorsia(IDS.tenantA);
      await vi.waitFor(async () =>
        expect((await ricevuta(accolta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_lavorazione),
      );
      expect((await corsia()).claimVersion).toBe(1);

      // La lease «scade» (il tempo passa), e un altro lavoratore rivendica e finisce il lavoro.
      await prisma.$executeRaw`UPDATE "shopify_webhook_lanes" SET "claimed_at" = now() - interval '10 minutes' WHERE "tenant_id" = ${IDS.tenantA}::uuid`;
      const nuovo = new ShopifyWebhookCodaService(
        prisma as never,
        config as never,
        oauth() as never,
        connessioneVera,
        syncVero,
      );
      await nuovo.lavoraCorsia(IDS.tenantA);
      expect((await corsia()).claimVersion).toBe(2);
      expect(await ricevuta(accolta.ricevutaId)).toMatchObject({
        esito: ShopifyWebhookReceiptEsito.elaborata,
        tentativi: 1,
      });
      const clientiDopoIlNuovo = await prisma.customer.findMany({ where: { tenantId: IDS.tenantA } });
      expect(clientiDopoIlNuovo).toHaveLength(1);
      const partyPrima = await prisma.party.findUniqueOrThrow({ where: { id: clientiDopoIlNuovo[0]!.partyId } });

      // Il lento riparte: la guardia nella transazione del cliente lo ferma, e il suo
      // tentativo di chiudere la ricevuta non scrive.
      fermo.sblocca();
      await corsaLenta;
      expect(await ricevuta(accolta.ricevutaId)).toMatchObject({
        esito: ShopifyWebhookReceiptEsito.elaborata,
        tentativi: 1,
        lavorataDaVersione: null,
      });
      const clientiDopo = await prisma.customer.findMany({ where: { tenantId: IDS.tenantA } });
      expect(clientiDopo).toHaveLength(1);
      const partyDopo = await prisma.party.findUniqueOrThrow({ where: { id: clientiDopo[0]!.partyId } });
      expect(partyDopo.updatedAt.getTime()).toBe(partyPrima.updatedAt.getTime());
      // La corsia è del nuovo (versione 2) e rilasciata; il lento non l'ha toccata.
      expect(await corsia()).toMatchObject({ claimVersion: 2, claimedAt: null });
    });

    it('il lavoratore superato non fa NEMMENO la lettura remota: l arricchimento del prodotto parte una volta sola (quella del nuovo)', async () => {
      const pull = new ShopifyProductPullService(
        prisma as never,
        negozio.oauth() as never,
        { requestedScopes: ['read_products', 'write_products'] } as never,
        negozio.admin() as never,
        { healStaleErrorStatus: vi.fn(), touchSync: vi.fn(), recordApiFailure: vi.fn(), markSynced: vi.fn(), markError: vi.fn() } as never,
        negozio.enrichment() as never,
        storico,
        registro,
        archivioImmaginiFinto() as never,
      );
      const syncVero = new ShopifySyncService(
        prisma as never,
        connessioneVera,
        pull as never,
        null as never,
        null as never,
        null as never,
        storico,
        null as never,
      );
      const remoto = negozio.semina({
        title: 'Felpa coda',
        vendor: 'F',
        product_type: 'T',
        tags: 'collaudo',
        opzioni: [{ name: 'Taglia', values: ['L'] }],
        varianti: [{ sku: 'CODA-L', barcode: '9960000000035', price: '10.00', valori: ['L'] }],
      });
      const fermo = barriera();
      const lento = new ShopifyWebhookCodaService(
        prisma as never,
        config as never,
        oauth() as never,
        connessioneVera,
        {
          handleWebhook: async (tenantId: string, topic: string, payload: unknown, guardia: unknown) => {
            await fermo.attesa;
            return syncVero.handleWebhook(tenantId, topic, payload, guardia as never);
          },
        } as never,
      );
      const accolta = await lento.accogli(consegna('products/update', negozio.webhook(remoto.id)));
      const corsaLenta = lento.lavoraCorsia(IDS.tenantA);
      await vi.waitFor(async () =>
        expect((await ricevuta(accolta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_lavorazione),
      );
      await prisma.$executeRaw`UPDATE "shopify_webhook_lanes" SET "claimed_at" = now() - interval '10 minutes' WHERE "tenant_id" = ${IDS.tenantA}::uuid`;
      negozio.azzeraChiamate();
      const nuovo = new ShopifyWebhookCodaService(prisma as never, config as never, oauth() as never, connessioneVera, syncVero);
      await nuovo.lavoraCorsia(IDS.tenantA);
      expect(negozio.chiamate.get('enrichProduct') ?? 0).toBe(1);
      expect((await ricevuta(accolta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);

      fermo.sblocca();
      await corsaLenta;
      // ⛔ Prima: la lettura partiva lo stesso (costava una chiamata, non un effetto). Ora no.
      expect(negozio.chiamate.get('enrichProduct') ?? 0).toBe(1);
      expect(await prisma.product.count({ where: { tenantId: IDS.tenantA, shopifyProductId: String(remoto.id) } })).toBe(1);
    });

    it('la guardia da sola: superata la corsia, assicura() lancia e una chiusura fenced non scrive', async () => {
      const { coda } = creaCoda(async () => undefined);
      const accolta = await coda.accogli(consegna('orders/create', { id: 5006 }));
      await coda.lavoraCorsia(IDS.tenantA);
      const versione = (await corsia()).claimVersion;
      // Un'altra assegnazione, dopo.
      await prisma.$executeRaw`UPDATE "shopify_webhook_lanes" SET "claim_version" = "claim_version" + 1 WHERE "tenant_id" = ${IDS.tenantA}::uuid`;
      const { guardiaDellaCorsia } = await import('../../shopify/shopify-webhook-corsia.util');
      const guardia = guardiaDellaCorsia(IDS.tenantA, versione);
      await expect(guardia.assicura(prisma)).rejects.toBeInstanceOf(CorsiaWebhookSuperataException);
      await expect(prisma.$transaction((tx) => guardia.assicura(tx))).rejects.toBeInstanceOf(
        CorsiaWebhookSuperataException,
      );
      expect((await ricevuta(accolta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
    });
  });

  // ── A7 · ordine fra topic correlati, risorse indipendenti ────────────────

  describe('A7 · ordine per risorsa', () => {
    it('chi attende un ritentativo trattiene i propri correlati (tutti i topic dello stesso ordine), non le risorse indipendenti; poi si riparte in ordine', async () => {
      const chiamate: string[] = [];
      let fallisciCreate5001 = true;
      const { coda } = creaCoda(async (_t, topic, payload) => {
        const p = payload as Record<string, unknown>;
        chiamate.push(`${topic}:${String(p['id'] ?? (p['fulfillment_order'] as Record<string, unknown> | undefined)?.['order_id'])}`);
        if (topic === 'orders/create' && p['id'] === 5001 && fallisciCreate5001) {
          fallisciCreate5001 = false;
          throw new ShopifyTrasportoException('timeout', false, 'Shopify non ha risposto');
        }
      });
      const r1 = await coda.accogli(consegna('orders/create', { id: 5001 }));
      const r2 = await coda.accogli(
        consegna('fulfillment_orders/order_routing_complete', { fulfillment_order: { id: 9, order_id: 5001 } }),
      );
      const r3 = await coda.accogli(consegna('orders/create', { id: 5002 }));
      const r4 = await coda.accogli(consegna('products/update', { id: 42 }));

      await coda.lavoraCorsia(IDS.tenantA);

      // 5001 è fallita in modo transitorio → in coda con attesa; il suo correlato aspetta;
      // l'ordine 5002 e il prodotto 42 sono passati.
      expect(chiamate).toEqual(['orders/create:5001', 'orders/create:5002', 'products/update:42']);
      const f1 = await ricevuta(r1.ricevutaId);
      expect(f1).toMatchObject({ esito: ShopifyWebhookReceiptEsito.in_coda, tentativi: 1 });
      expect(f1.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
      expect(f1.ultimoErrore).toBe('Shopify non ha risposto');
      expect((await ricevuta(r2.ricevutaId))).toMatchObject({ esito: ShopifyWebhookReceiptEsito.in_coda, tentativi: 0 });
      expect((await ricevuta(r3.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      expect((await ricevuta(r4.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);

      // Un secondo giro PRIMA dell'attesa: niente cambia (nessun ritentativo anticipato).
      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate).toHaveLength(3);

      // Passa il tempo (la scansione trova la ricevuta pronta): prima 5001, poi il suo correlato.
      await prisma.shopifyWebhookReceipt.update({ where: { id: r1.ricevutaId }, data: { nextAttemptAt: new Date() } });
      await coda.scansione();
      expect(chiamate).toEqual([
        'orders/create:5001',
        'orders/create:5002',
        'products/update:42',
        'orders/create:5001',
        'fulfillment_orders/order_routing_complete:5001',
      ]);
      expect(await ricevuta(r1.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 2, ultimoErrore: null });
      expect(await ricevuta(r2.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 1 });
    });

    it('una risorsa NON risolvibile è correlata a tutto: aspetta ciò che la precede e ferma ciò che la segue', async () => {
      const chiamate: string[] = [];
      let fallisci = true;
      const { coda } = creaCoda(async (_t, topic, payload) => {
        chiamate.push(`${topic}:${JSON.stringify(payload)}`);
        if (topic === 'orders/create' && fallisci) {
          fallisci = false;
          throw new ShopifyTrasportoException('rete', false, 'Shopify non è raggiungibile');
        }
      });
      const r1 = await coda.accogli(consegna('orders/create', { id: 5001 }));
      // `fulfillment_orders/moved` senza ordine risolvibile: risorsa null.
      const r2 = await coda.accogli(consegna('fulfillment_orders/moved', { moved_fulfillment_order: { id: 9 } }));
      const r3 = await coda.accogli(consegna('products/update', { id: 42 }));
      expect((await ricevuta(r2.ricevutaId)).risorsa).toBeNull();

      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate).toEqual(['orders/create:{"id":5001}']);
      expect((await ricevuta(r2.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_coda);
      expect((await ricevuta(r3.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_coda);

      await prisma.shopifyWebhookReceipt.update({ where: { id: r1.ricevutaId }, data: { nextAttemptAt: new Date() } });
      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate.slice(1)).toEqual([
        'orders/create:{"id":5001}',
        'fulfillment_orders/moved:{"moved_fulfillment_order":{"id":9}}',
        'products/update:{"id":42}',
      ]);
    });

    it('⛔ due consegne della stessa risorsa nello STESSO millisecondo si elaborano nell ordine di ARRIVO, non per uuid', async () => {
      const chiamate: string[] = [];
      const { coda } = creaCoda(async (_t, topic) => {
        chiamate.push(topic);
      });
      const stessoIstante = new Date('2026-09-15T18:00:00.000Z');
      // Inserite direttamente, con gli id in ordine INVERSO a quello di arrivo.
      const base = { tenantId: IDS.tenantA, shopId, shopDomain: DOMINIO, risorsa: 'ordine:5001', receivedAt: stessoIstante, payload: { id: 5001 } };
      const prima = await prisma.shopifyWebhookReceipt.create({
        data: { ...base, id: 'ffffffff-0000-4000-8000-000000000001', webhookId: 'arrivo-1', topic: 'orders/create' },
      });
      const seconda = await prisma.shopifyWebhookReceipt.create({
        data: { ...base, id: '00000000-0000-4000-8000-000000000002', webhookId: 'arrivo-2', topic: 'orders/updated' },
      });
      expect(prima.arrivo < seconda.arrivo).toBe(true);
      expect(prima.id > seconda.id).toBe(true);

      await coda.lavoraCorsia(IDS.tenantA);

      // Prima della correzione l'ordine seguiva l'uuid: qui sarebbe stato orders/updated, orders/create.
      expect(chiamate).toEqual(['orders/create', 'orders/updated']);
    });

    it('i ritentativi seguono la NATURA dell errore: un 4xx è permanente e va subito in fallita; un esito incerto pure', async () => {
      const { coda, sync } = creaCoda(async () => {
        throw new NotFoundException('Ordine non trovato');
      });
      const r1 = await coda.accogli(consegna('orders/create', { id: 5001 }));
      await coda.lavoraCorsia(IDS.tenantA);
      expect(await ricevuta(r1.ricevutaId)).toMatchObject({
        esito: ShopifyWebhookReceiptEsito.fallita,
        tentativi: 1,
        ultimoErrore: 'Ordine non trovato',
      });
      expect((await ricevuta(r1.ricevutaId)).processedAt).not.toBeNull();
      expect(sync.handleWebhook).toHaveBeenCalledTimes(1);

      const { coda: incerta, sync: syncIncerta } = creaCoda(async () => {
        throw new ShopifyTrasportoException('timeout', true, 'Shopify non ha risposto: esito incerto');
      });
      const r2 = await incerta.accogli(consegna('products/update', { id: 43 }));
      await incerta.lavoraCorsia(IDS.tenantA);
      expect((await ricevuta(r2.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.fallita);
      expect(syncIncerta.handleWebhook).toHaveBeenCalledTimes(1);
      // Il fallimento DEFINITIVO di un prodotto lascia l'avviso sulla connessione (come prima della coda).
      const conn = await prisma.shopifyConnection.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });
      expect(conn.lastErrorCode).toBe('product_webhook_failed');
    });

    it('dopo il sesto tentativo concluso (1 + 5 ritentativi) la ricevuta è fallita', async () => {
      const { coda, sync } = creaCoda(async () => {
        throw new ShopifyTrasportoException('server', false, 'Shopify ha risposto con un errore temporaneo');
      });
      const r1 = await coda.accogli(consegna('orders/create', { id: 5001 }));
      for (let giro = 1; giro <= 6; giro += 1) {
        await coda.lavoraCorsia(IDS.tenantA);
        const stato = await ricevuta(r1.ricevutaId);
        expect(stato.tentativi).toBe(giro);
        if (giro < 6) {
          expect(stato.esito).toBe(ShopifyWebhookReceiptEsito.in_coda);
          await prisma.shopifyWebhookReceipt.update({ where: { id: r1.ricevutaId }, data: { nextAttemptAt: new Date() } });
        } else {
          expect(stato.esito).toBe(ShopifyWebhookReceiptEsito.fallita);
        }
      }
      await coda.lavoraCorsia(IDS.tenantA);
      expect(sync.handleWebhook).toHaveBeenCalledTimes(6);
    });
  });

  // ── A8 · risorsa fallita, «Riprova» ──────────────────────────────────────

  describe('A8 · risorsa fallita', () => {
    it('una fallita blocca solo i propri correlati; le altre passano; «Riprova» riparte dalla STESSA ricevuta e poi sblocca i correlati', async () => {
      let fallisci = true;
      const chiamate: string[] = [];
      const { coda } = creaCoda(async (_t, topic, payload) => {
        const id = String((payload as Record<string, unknown>)['id']);
        chiamate.push(`${topic}:${id}`);
        if (id === '5001' && fallisci) {
          throw new NotFoundException('Ordine non trovato');
        }
      });
      const r1 = await coda.accogli(consegna('orders/create', { id: 5001 }));
      const r2 = await coda.accogli(consegna('orders/updated', { id: 5001 }));
      const r3 = await coda.accogli(consegna('orders/create', { id: 5002 }));
      await coda.lavoraCorsia(IDS.tenantA);

      expect(chiamate).toEqual(['orders/create:5001', 'orders/create:5002']);
      expect((await ricevuta(r1.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.fallita);
      expect((await ricevuta(r2.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_coda);
      expect((await ricevuta(r3.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);

      // Nessun superamento automatico: anche a scansioni ripetute la più giovane aspetta.
      await coda.scansione();
      expect(chiamate).toHaveLength(2);

      // L'elenco per l'operatore la mostra; una consegna di un ALTRO negozio no.
      const elenco = await coda.elencoNonApplicate(IDS.tenantA);
      expect(elenco.map((e) => [e.id, e.esito, e.tentativi])).toEqual([[r1.ricevutaId, 'fallita', 1]]);

      // «Riprova»: stessa ricevuta, tentativi conservati, poi il correlato.
      fallisci = false;
      const svegliaSpy = vi.spyOn(coda, 'sveglia').mockImplementation(() => undefined);
      await expect(coda.riprova(IDS.tenantA, r1.ricevutaId)).resolves.toEqual({ inCoda: true });
      expect(svegliaSpy).toHaveBeenCalledWith(IDS.tenantA);
      expect(await ricevuta(r1.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.in_coda, tentativi: 1 });
      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate.slice(2)).toEqual(['orders/create:5001', 'orders/updated:5001']);
      expect(await ricevuta(r1.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 2 });
      expect(await ricevuta(r2.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 1 });
      // «Riprova» NON ha azzerato gli errori della connessione.
      const conn = await prisma.shopifyConnection.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });
      expect(conn.lastErrorCode).toBe('webhook_sync_failed');
    });

    it('«Riprova» rifiuta ciò che non è riprovabile: elaborata, scartata per sync spenta (D2), altro tenant', async () => {
      const { coda } = creaCoda(async () => undefined);
      const ok = await coda.accogli(consegna('orders/create', { id: 5001 }));
      await coda.lavoraCorsia(IDS.tenantA);
      await expect(coda.riprova(IDS.tenantA, ok.ricevutaId)).rejects.toThrow(/non è in uno stato/);

      await prisma.shopifyConnection.update({ where: { tenantId: IDS.tenantA }, data: { autoSyncEnabled: false } });
      const spenta = await coda.accogli(consegna('orders/create', { id: 5002 }));
      await coda.lavoraCorsia(IDS.tenantA);
      expect(await ricevuta(spenta.ricevutaId)).toMatchObject({
        esito: ShopifyWebhookReceiptEsito.scartata_sync_spenta,
        tentativi: 0,
      });
      await expect(coda.riprova(IDS.tenantA, spenta.ricevutaId)).rejects.toThrow(/non si riprova/);
      // Riattivata la sincronizzazione: NIENTE riparte da solo (D2).
      await prisma.shopifyConnection.update({ where: { tenantId: IDS.tenantA }, data: { autoSyncEnabled: true } });
      await coda.scansione();
      expect((await ricevuta(spenta.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.scartata_sync_spenta);

      await expect(coda.riprova(IDS.tenantB, ok.ricevutaId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── A9 · ripristino da backup ────────────────────────────────────────────

  describe('A9 · ripristino da backup', () => {
    it('le ricevute da applicare (in coda, in lavorazione al momento del backup, fallite) tornano SOSPESE; le concluse com erano; nessuna ripartenza automatica; «Riprova» le riprende con le verifiche', async () => {
      const chiamate: string[] = [];
      let fallisci = true;
      const { coda } = creaCoda(async (_t, topic, payload) => {
        chiamate.push(`${topic}:${String((payload as Record<string, unknown>)['id'])}`);
        if (topic === 'orders/cancelled' && fallisci) {
          throw new NotFoundException('non trovato');
        }
      });
      const elaborata = await coda.accogli(consegna('orders/create', { id: 5001 }));
      const fallita = await coda.accogli(consegna('orders/cancelled', { id: 5002 }));
      await coda.lavoraCorsia(IDS.tenantA);
      const inCoda = await coda.accogli(consegna('products/update', { id: 42 }));
      const inLavorazione = await coda.accogli(consegna('customers/update', { id: 7 }));
      await prisma.shopifyWebhookReceipt.update({
        where: { id: inLavorazione.ricevutaId },
        data: { esito: ShopifyWebhookReceiptEsito.in_lavorazione, lavorataDaVersione: 1 },
      });
      expect((await ricevuta(elaborata.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      expect((await ricevuta(fallita.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.fallita);

      const zip = await readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
      await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, zip);

      const esiti = Object.fromEntries(
        (await prisma.shopifyWebhookReceipt.findMany({ where: { tenantId: IDS.tenantA } })).map((r) => [r.id, r]),
      );
      expect(esiti[elaborata.ricevutaId]).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 1 });
      expect(esiti[fallita.ricevutaId]).toMatchObject({ esito: ShopifyWebhookReceiptEsito.sospesa_dopo_ripristino, tentativi: 1 });
      expect(esiti[inCoda.ricevutaId]).toMatchObject({ esito: ShopifyWebhookReceiptEsito.sospesa_dopo_ripristino, tentativi: 0 });
      expect(esiti[inLavorazione.ricevutaId]).toMatchObject({
        esito: ShopifyWebhookReceiptEsito.sospesa_dopo_ripristino,
        lavorataDaVersione: null,
      });
      // Il payload è tornato: la ricevuta è recuperabile per intero.
      expect(esiti[inCoda.ricevutaId]!.payload).toEqual({ id: 42 });

      // Nessuna ripartenza automatica: né la scansione né la corsia le toccano.
      chiamate.length = 0;
      await coda.scansione();
      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate).toEqual([]);

      // «Riprova» le riprende, una per una, con le verifiche di collegamento e sincronizzazione.
      fallisci = false;
      vi.spyOn(coda, 'sveglia').mockImplementation(() => undefined);
      await coda.riprova(IDS.tenantA, fallita.ricevutaId);
      await coda.riprova(IDS.tenantA, inCoda.ricevutaId);
      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate).toEqual(['orders/cancelled:5002', 'products/update:42']);
      expect((await ricevuta(fallita.ricevutaId))).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 2 });
      expect((await ricevuta(inLavorazione.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.sospesa_dopo_ripristino);
    }, 120_000);
  });

  // ── A10 · isolamento tenant / negozio ────────────────────────────────────

  describe('A10 · isolamento tenant e negozio', () => {
    it('un associazione cambiata fra accoglienza ed elaborazione → scartata, nessun effetto, non riprovabile; il tenant B lavora per conto suo', async () => {
      // Il tenant B ha il proprio negozio.
      const negozioB = await prisma.shopifyShop.create({
        data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/996002' },
      });
      await prisma.shopifyConnection.create({
        data: {
          tenantId: IDS.tenantB,
          status: 'connected',
          shopDomain: DOMINIO_B,
          shopId: negozioB.id,
          autoSyncEnabled: true,
          scopes: ['read_products'],
        },
      });
      const chiamate: string[] = [];
      const { coda } = creaCoda(async (tenantId, topic, payload) => {
        chiamate.push(`${tenantId.slice(0, 2)}:${topic}:${String((payload as Record<string, unknown>)['id'])}`);
      });
      const perA = await coda.accogli(consegna('orders/create', { id: 5001 }));
      const perB = await coda.accogli({ ...consegna('orders/create', { id: 6001 }), shopDomain: DOMINIO_B });
      expect((await ricevuta(perB.ricevutaId))).toMatchObject({ tenantId: IDS.tenantB, shopId: negozioB.id });

      // Nel frattempo il tenant A si ricollega a un ALTRO negozio.
      const altroNegozio = await prisma.shopifyShop.create({
        data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/996003' },
      });
      await prisma.shopifyConnection.update({
        where: { tenantId: IDS.tenantA },
        data: { shopDomain: 'coda-nuovo.myshopify.com', shopId: altroNegozio.id },
      });
      await prisma.shopifyCredential.update({
        where: { tenantId: IDS.tenantA },
        data: { shopDomain: 'coda-nuovo.myshopify.com' },
      });

      await coda.lavoraCorsia(IDS.tenantA);
      await coda.lavoraCorsia(IDS.tenantB);

      expect(chiamate).toEqual(['0b:orders/create:6001']);
      const scartata = await ricevuta(perA.ricevutaId);
      expect(scartata).toMatchObject({
        esito: ShopifyWebhookReceiptEsito.scartata_associazione_cambiata,
        tenantId: IDS.tenantA,
        shopId,
        shopDomain: DOMINIO,
        tentativi: 0,
      });
      expect(scartata.ultimoErrore).toMatch(/non è più collegato/);
      expect((await ricevuta(perB.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      // Non si sposta e non si riprova.
      await expect(coda.riprova(IDS.tenantA, perA.ricevutaId)).rejects.toThrow(/non è più collegato/);
      expect((await ricevuta(perA.ricevutaId)).tenantId).toBe(IDS.tenantA);
      // L'elenco del tenant B non vede le ricevute di A, e viceversa.
      expect(await coda.elencoNonApplicate(IDS.tenantB)).toEqual([]);
      expect((await coda.elencoNonApplicate(IDS.tenantA)).map((e) => e.id)).toEqual([perA.ricevutaId]);
    });

    it('le corsie sono per tenant: una corsia rivendicata da un altro processo per A non ferma B', async () => {
      const negozioB = await prisma.shopifyShop.create({
        data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/996002' },
      });
      await prisma.shopifyConnection.create({
        data: { tenantId: IDS.tenantB, status: 'connected', shopDomain: DOMINIO_B, shopId: negozioB.id, autoSyncEnabled: true, scopes: [] },
      });
      const { coda, sync } = creaCoda(async () => undefined);
      await coda.accogli(consegna('orders/create', { id: 5001 }));
      const perB = await coda.accogli({ ...consegna('orders/create', { id: 6001 }), shopDomain: DOMINIO_B });
      await prisma.$executeRaw`INSERT INTO "shopify_webhook_lanes" ("tenant_id", "claimed_by", "claimed_at", "claim_version")
        VALUES (${IDS.tenantA}::uuid, 'altro-processo', now(), 1)`;

      await coda.scansione();

      expect(sync.handleWebhook).toHaveBeenCalledTimes(1);
      expect(sync.handleWebhook).toHaveBeenCalledWith(IDS.tenantB, 'orders/create', { id: 6001 }, expect.anything());
      expect((await ricevuta(perB.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
    });

    it('A11 · la pulizia toglie SOLO le concluse da oltre 30 giorni; pendenti, fallite e sospese restano; dedup, ordine e backup non ne risentono', async () => {
      const chiamate: string[] = [];
      const { coda } = creaCoda(async (_t, topic, payload) => {
        const id = String((payload as Record<string, unknown>)['id']);
        chiamate.push(`${topic}:${id}`);
        if (id === '5001') {
          throw new NotFoundException('non trovato');
        }
      });
      const vecchia = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const recente = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      // Una fallita VECCHIA che blocca la sua risorsa, e un correlato in coda.
      const fallita = await coda.accogli(consegna('orders/create', { id: 5001 }, 'id-fallita'));
      const correlata = await coda.accogli(consegna('orders/updated', { id: 5001 }, 'id-correlata'));
      // Due elaborate: una vecchia, una recente. Una scartata vecchia. Una sospesa vecchia.
      const elaborataVecchia = await coda.accogli(consegna('products/update', { id: 42 }, 'id-vecchia'));
      const elaborataRecente = await coda.accogli(consegna('products/update', { id: 43 }, 'id-recente'));
      await coda.lavoraCorsia(IDS.tenantA);
      await prisma.shopifyConnection.update({ where: { tenantId: IDS.tenantA }, data: { autoSyncEnabled: false } });
      const scartata = await coda.accogli(consegna('customers/update', { id: 7 }, 'id-scartata'));
      await coda.lavoraCorsia(IDS.tenantA);
      await prisma.shopifyConnection.update({ where: { tenantId: IDS.tenantA }, data: { autoSyncEnabled: true } });
      const sospesa = await coda.accogli(consegna('orders/create', { id: 5009 }, 'id-sospesa'));
      await prisma.shopifyWebhookReceipt.update({
        where: { id: sospesa.ricevutaId },
        data: { esito: ShopifyWebhookReceiptEsito.sospesa_dopo_ripristino, processedAt: vecchia },
      });
      for (const [id, data] of [
        [fallita.ricevutaId, vecchia],
        [elaborataVecchia.ricevutaId, vecchia],
        [elaborataRecente.ricevutaId, recente],
        [scartata.ricevutaId, vecchia],
      ] as const) {
        await prisma.shopifyWebhookReceipt.update({ where: { id }, data: { processedAt: data, receivedAt: data } });
      }
      await prisma.shopifyWebhookReceipt.update({ where: { id: correlata.ricevutaId }, data: { receivedAt: vecchia } });
      expect(await prisma.shopifyWebhookReceipt.count({ where: { tenantId: IDS.tenantA } })).toBe(6);

      // La pulizia: un valore sotto i 30 giorni non abbassa la soglia.
      const esito = await coda.puliziaConcluse(IDS.tenantA, 1);
      expect(esito).toEqual({ eliminate: 2, conservate: 4 });
      const restanti = await prisma.shopifyWebhookReceipt.findMany({ where: { tenantId: IDS.tenantA }, orderBy: { receivedAt: 'asc' } });
      expect(restanti.map((r) => r.webhookId).sort()).toEqual(['id-correlata', 'id-fallita', 'id-recente', 'id-sospesa']);

      // Ordine per risorsa intatto: la fallita blocca ancora il suo correlato — anche con lo
      // STESSO received_at, perché l'ordine è quello di ARRIVO assegnato dal database
      // (⛔ con l'uuid come spareggio qui l'esito era casuale: riprodotto il 15/09).
      const [f, c] = await Promise.all([ricevuta(fallita.ricevutaId), ricevuta(correlata.ricevutaId)]);
      expect(f.receivedAt.getTime()).toBe(c.receivedAt.getTime());
      expect(f.arrivo < c.arrivo).toBe(true);
      chiamate.length = 0;
      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate).toEqual([]);
      expect((await ricevuta(correlata.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_coda);

      // Deduplicazione: le conservate sono ancora doppioni; una consegna con l'id di una
      // ricevuta TOLTA torna nuova — e si rielabora, in modo ripetibile (A5), non due volte.
      expect((await coda.accogli(consegna('products/update', { id: 43 }, 'id-recente'))).doppione).toBe(true);
      const riaccolta = await coda.accogli(consegna('products/update', { id: 42 }, 'id-vecchia'));
      expect(riaccolta.doppione).toBe(false);
      await coda.lavoraCorsia(IDS.tenantA);
      expect(chiamate).toEqual(['products/update:42']);

      // Il backup dopo la pulizia esporta e ripristina ciò che resta; le da applicare tornano sospese.
      const zip = await readStreamToBuffer((await exporter.createExportStream(IDS.tenantA)).stream);
      await importer.importFromZipBuffer(IDS.tenantA, IDS.utenteA1, zip);
      const dopo = await prisma.shopifyWebhookReceipt.findMany({ where: { tenantId: IDS.tenantA } });
      expect(dopo.map((r) => [r.webhookId, r.esito]).sort()).toEqual([
        ['id-correlata', 'sospesa_dopo_ripristino'],
        ['id-fallita', 'sospesa_dopo_ripristino'],
        ['id-recente', 'elaborata'],
        ['id-sospesa', 'sospesa_dopo_ripristino'],
        ['id-vecchia', 'elaborata'],
      ]);
    }, 120_000);

    it('un topic non trattato è accolto e scartato subito, senza toccare la data dell ultimo evento', async () => {
      const { coda, sync } = creaCoda(async () => undefined);
      const r = await coda.accogli(consegna('customers/data_request', { id: 1 }));
      expect(await ricevuta(r.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.scartata_topic });
      await coda.lavoraCorsia(IDS.tenantA);
      expect(sync.handleWebhook).not.toHaveBeenCalled();
      const conn = await prisma.shopifyConnection.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });
      expect(conn.lastWebhookEventAt).toBeNull();
    });
  });
});
