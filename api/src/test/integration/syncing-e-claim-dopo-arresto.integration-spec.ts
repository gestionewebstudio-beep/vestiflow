import { ShopifySyncStatus, ShopifyWebhookReceiptEsito, type PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyConnectionService } from '../../shopify/shopify-connection.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { ShopifySyncService } from '../../shopify/shopify-sync.service';
import { ShopifyWebhookCodaService } from '../../shopify/shopify-webhook-coda.service';
import { archivioImmaginiFinto } from './archivio-immagini-finto';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * DOPO UN ARRESTO del processo: il prodotto rimasto `syncing` e il claim di creazione
 * rimasto aperto (docs/30 §7.3 e §7.2-ter, 15/09/2026 notte).
 *
 * ⚠️ Le prove marcate «RIPRODUZIONE» fissano il comportamento ATTUALE, difetto compreso:
 *    sono verdi e dicono che cosa succede oggi, non che cosa è giusto. Quelle marcate
 *    «CORRETTO» sono la correzione fatta con le regole già approvate.
 *
 * ```text
 *   S1  RIPRODUZIONE · prodotto `syncing` da un push morto: il webhook dello stesso prodotto
 *       viene SCARTATO in silenzio — ricevuta «elaborata», nessun effetto, per sempre
 *   S2  RIPRODUZIONE · lo stesso prodotto: un push nuovo (altro processo) lo lavora e lo chiude;
 *       il claim non c'entra (prodotto già collegato)
 *   C1  CORRETTO · webhook adotta la creazione mentre il push è fermo, poi il push MUORE:
 *       il claim non resta aperto per sempre — l'adozione lo chiude (fenced), e il push vivo
 *       che riprende conclude lo stesso, senza doppione
 * ```
 */
describe('Syncing e claim dopo un arresto', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;
  let connessioneVera: ShopifyConnectionService;
  let shopId: string;
  const DOMINIO = 'arresto.myshopify.com';
  const config = {
    webhookScanIntervalMs: 0,
    webhookLaneLeaseMs: 5 * 60_000,
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
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    negozio = new NegozioSimulato(DOMINIO, 997000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/997001' },
    });
    shopId = riga.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId,
        autoSyncEnabled: true,
        scopes: ['read_products', 'write_products'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products'],
      },
    });
  });

  /** Un'ISTANZA del push = un processo: `pushInFlight` è suo, il claim è nel database. */
  function creaPush(): ShopifyProductPushService {
    return new ShopifyProductPushService(
      prisma as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      { markSynced: vi.fn(), markError: vi.fn(), touchSync: vi.fn() } as never,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as never,
      { buildMetafields: vi.fn().mockResolvedValue([]) } as never,
      negozio.graphql() as never,
      storico,
      registro,
    );
  }

  function creaPull(): ShopifyProductPullService {
    return new ShopifyProductPullService(
      prisma as never,
      negozio.oauth() as never,
      { requestedScopes: ['read_products'] } as never,
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

  function creaCoda(pull: ShopifyProductPullService): ShopifyWebhookCodaService {
    const sync = new ShopifySyncService(
      prisma as never,
      connessioneVera,
      pull as never,
      null as never,
      null as never,
      null as never,
      storico,
      null as never,
    );
    return new ShopifyWebhookCodaService(
      prisma as never,
      config as never,
      {
        resolveTenantByShopDomain: async (d: string) => {
          const c = await prisma.shopifyConnection.findFirst({ where: { shopDomain: d } });
          if (!c) throw new NotFoundException('negozio ignoto');
          return c.tenantId;
        },
      } as never,
      connessioneVera,
      sync,
    );
  }

  async function articolo(codice = 'ARR-1'): Promise<string> {
    const creato = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: `Articolo ${codice}`,
        articleCode: codice,
        shopifySyncEnabled: true,
        options: [{ name: 'Taglia', values: ['M'] }],
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: `${codice}-M`,
              optionValues: [{ name: 'Taglia', value: 'M' }],
              sellingPriceMinor: 2990,
              shopifyPriceMinor: 2990,
            },
          ],
        },
      },
      select: { id: true },
    });
    return creato.id;
  }

  const locale = (id: string) => prisma.product.findUniqueOrThrow({ where: { id } });
  const attendi = async (cond: () => boolean, ms = 5_000) => {
    const fine = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > fine) throw new Error('attesa scaduta');
      await new Promise((r) => setTimeout(r, 10));
    }
  };

  // ── S · il prodotto rimasto `syncing` ─────────────────────────────────────

  describe('prodotto rimasto `syncing` da un push morto', () => {
    /** Pubblica davvero, poi «uccide» il processo lasciando il prodotto `syncing` come lo lascia `markProductSyncing`. */
    async function pubblicatoPoiMortoInSyncing(): Promise<{ id: string; remotoId: number }> {
      const id = await articolo();
      const esito = await creaPush().pushProduct(IDS.tenantA, id);
      expect(esito.pushed).toBe(true);
      const remotoId = negozio.prodottoPerIdentita(id)!.id;
      // Il processo successivo ha avviato un push (`enqueuePush` → `markProductSyncing`) ed è morto.
      await prisma.product.update({
        where: { id },
        data: { shopifySyncStatus: ShopifySyncStatus.syncing, shopifyLastError: null },
      });
      return { id, remotoId };
    }

    it('S1 · RIPRODUZIONE: il webhook del prodotto `syncing` è scartato in silenzio — ricevuta elaborata, titolo remoto non applicato, anche molto dopo', async () => {
      const { id, remotoId } = await pubblicatoPoiMortoInSyncing();
      // Su Shopify il titolo cambia; il webhook arriva.
      negozio.prodotto(remotoId)!.title = 'Titolo cambiato sul negozio';
      const coda = creaCoda(creaPull());
      const accolta = await coda.accogli({
        shopDomain: DOMINIO,
        webhookId: 'syncing-1',
        topic: 'products/update',
        payload: negozio.webhook(remotoId),
        triggeredAt: new Date(),
        apiVersion: '2026-07',
      });
      await coda.lavoraCorsia(IDS.tenantA);

      const ricevuta = await prisma.shopifyWebhookReceipt.findUniqueOrThrow({ where: { id: accolta.ricevutaId } });
      // ⛔ IL DIFETTO: «elaborata» senza effetto. Il titolo remoto non è arrivato e nessuno lo dice.
      expect(ricevuta.esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      const dopo = await locale(id);
      expect(dopo.shopifyTitle).not.toBe('Titolo cambiato sul negozio');
      expect(dopo.shopifySyncStatus).toBe(ShopifySyncStatus.syncing);
      // Non c'è nessun «tempo» dopo il quale cambi: un secondo webhook, ore dopo, fa lo stesso.
      const seconda = await coda.accogli({
        shopDomain: DOMINIO,
        webhookId: 'syncing-2',
        topic: 'products/update',
        payload: negozio.webhook(remotoId),
        triggeredAt: new Date(),
        apiVersion: '2026-07',
      });
      await coda.lavoraCorsia(IDS.tenantA);
      expect((await prisma.shopifyWebhookReceipt.findUniqueOrThrow({ where: { id: seconda.ricevutaId } })).esito).toBe(
        ShopifyWebhookReceiptEsito.elaborata,
      );
      expect((await locale(id)).shopifyTitle).not.toBe('Titolo cambiato sul negozio');
    });

    it('S2 · RIPRODUZIONE: un push NUOVO (altro processo) del prodotto `syncing` lo lavora e lo chiude: il lucchetto è solo in memoria', async () => {
      const { id } = await pubblicatoPoiMortoInSyncing();
      const esito = await creaPush().pushProduct(IDS.tenantA, id);
      expect(esito.pushed).toBe(true);
      expect((await locale(id)).shopifySyncStatus).not.toBe(ShopifySyncStatus.syncing);
    });
  });

  // ── C · il claim dopo un'adozione da webhook ──────────────────────────────

  describe('claim di creazione dopo un adozione da webhook', () => {
    it('C1 · CORRETTO: il webhook adotta mentre il push è fermo; l adozione CHIUDE il claim (creazione conclusa); il push che riprende conclude senza doppione', async () => {
      const id = await articolo('ARR-2');
      const apri = negozio.bloccaProssima('listProductVariantsWithIdentity');
      const push = creaPush().pushProduct(IDS.tenantA, id);
      await attendi(() => negozio.contaProdottiConIdentita(id) === 1);
      const remoto = negozio.prodottoPerIdentita(id)!;
      expect((await locale(id)).shopifyCreateClaimId).not.toBeNull();

      const esitoWebhook = await creaPull().importProductFromWebhook(IDS.tenantA, negozio.webhook(remoto.id));
      expect(esitoWebhook).toBe('skipped'); // adottato, poi saltato perché `syncing`

      // ⛔ Qui c'era «il claim resta del push»: se il push muore adesso, resta aperto per
      //    sempre su un prodotto già collegato — un residuo che nessun percorso chiude.
      //    L'adozione è la conclusione della creazione: chiude il claim con la stessa
      //    versione (fenced); il push vivo ricontrolla la sola versione, e conclude.
      const adottato = await locale(id);
      expect(adottato.shopifyProductId).toBe(String(remoto.id));
      expect(adottato.shopifyCreateClaimId).toBeNull();
      expect(adottato.shopifyCreateClaimShopId).toBeNull();
      expect(adottato.shopifyCreateClaimedAt).toBeNull();
      expect(adottato.shopifyCreateClaimVersion).toBe(1); // la versione resta: è la storia del tentativo

      apri();
      const esitoPush = await push;
      expect(esitoPush.pushed).toBe(true);
      expect(negozio.contaProdottiConIdentita(id)).toBe(1);
      const fine = await locale(id);
      expect(fine.shopifyCreateClaimId).toBeNull();
      expect(fine.shopifySyncStatus).not.toBe(ShopifySyncStatus.syncing);
      // E il prodotto non è più «candidato» per il riconoscimento dei webhook: è collegato.
      expect(
        await prisma.product.count({ where: { tenantId: IDS.tenantA, shopifyProductId: null, shopifyCreateClaimVersion: { gt: 0 } } }),
      ).toBe(0);
    });
  });
});
