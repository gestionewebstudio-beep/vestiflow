import { ShopifySyncStatus, ShopifyWebhookReceiptEsito, type PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyConnectionService } from '../../shopify/shopify-connection.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { NotificaDaRinviareException } from '../../shopify/shopify-notifica-rinviata.exception';
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
 *   S1  CORRETTO (D8b) · prodotto `syncing`: il webhook si RINVIA con le attese approvate;
 *       S1a push vivo che termina → applicata dopo, una volta; S1b push morto → fallita
 *       visibile col motivo, articolo non resettato (D9a); S1c correlate in ordine, altre
 *       risorse continuano; S1d «Riprova» dopo lo sblocco → nessun doppione
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

    /** La ricevuta di un webhook `products/update` per il remoto dato. */
    async function notifica(coda: ShopifyWebhookCodaService, remotoId: number, id: string) {
      return coda.accogli({
        shopDomain: DOMINIO,
        webhookId: id,
        topic: 'products/update',
        payload: negozio.webhook(remotoId),
        triggeredAt: new Date(),
        apiVersion: '2026-07',
      });
    }
    const ricevuta = (id: string) => prisma.shopifyWebhookReceipt.findUniqueOrThrow({ where: { id } });
    const pronta = (id: string) => prisma.shopifyWebhookReceipt.update({ where: { id }, data: { nextAttemptAt: new Date() } });

    it('S1 · CORRETTO (D8b): il webhook del prodotto `syncing` è RINVIATO con le attese approvate, non «elaborato senza effetti»; l articolo non si tocca', async () => {
      const { id, remotoId } = await pubblicatoPoiMortoInSyncing();
      negozio.modifica(remotoId, { title: 'Titolo cambiato sul negozio' });
      const coda = creaCoda(creaPull());
      const accolta = await notifica(coda, remotoId, 'syncing-1');
      await coda.lavoraCorsia(IDS.tenantA);

      const r = await ricevuta(accolta.ricevutaId);
      expect(r.esito).toBe(ShopifyWebhookReceiptEsito.in_coda);
      expect(r.tentativi).toBe(1);
      expect(r.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
      expect(r.ultimoErrore).toContain('risulta in sincronizzazione verso Shopify');
      expect(r.ultimoErrore).toContain('pubblica sul negozio i dati locali');
      const dopo = await locale(id);
      expect(dopo.shopifyTitle).not.toBe('Titolo cambiato sul negozio');
      expect(dopo.shopifySyncStatus).toBe(ShopifySyncStatus.syncing); // ⛔ nessun reset
      expect(dopo.shopifyLastError).toBeNull();
    });

    it('S1a · push VIVO che termina: la notifica arrivata durante la pubblicazione si applica DOPO, una volta sola', async () => {
      const id = await articolo('VIVO-1');
      const apri = negozio.bloccaProssima('listProductVariantsWithIdentity');
      const push = creaPush().pushProduct(IDS.tenantA, id);
      await attendi(() => negozio.contaProdottiConIdentita(id) === 1);
      const remoto = negozio.prodottoPerIdentita(id)!;
      negozio.modifica(remoto.id, { title: 'Titolo dal negozio durante il push' });
      const coda = creaCoda(creaPull());
      const accolta = await notifica(coda, remoto.id, 'vivo-1');
      // Adotta (claim aperto) e rinvia: il prodotto è `syncing`.
      await coda.lavoraCorsia(IDS.tenantA);
      expect(await ricevuta(accolta.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.in_coda, tentativi: 1 });
      expect((await locale(id)).shopifyProductId).toBe(String(remoto.id));

      apri();
      expect((await push).pushed).toBe(true);
      expect((await locale(id)).shopifySyncStatus).not.toBe(ShopifySyncStatus.syncing);
      // Il push ha riscritto il titolo remoto con quello locale (è il suo mestiere); la
      // notifica rinviata porta il payload di ALLORA e si applica una volta: stato pieno.
      await pronta(accolta.ricevutaId);
      await coda.scansione();
      expect(await ricevuta(accolta.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 2 });
      expect((await locale(id)).shopifyTitle).toBe('Titolo dal negozio durante il push');
      await coda.scansione();
      expect((await ricevuta(accolta.ricevutaId)).tentativi).toBe(2);
      expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    });

    it('S1b · push MORTO: nessuna perdita silenziosa — dopo i sei tentativi la ricevuta è FALLITA col motivo e «Riprova», l articolo resta syncing', async () => {
      const { id, remotoId } = await pubblicatoPoiMortoInSyncing();
      negozio.modifica(remotoId, { title: 'Titolo cambiato sul negozio' });
      const coda = creaCoda(creaPull());
      const accolta = await notifica(coda, remotoId, 'morto-1');
      for (let giro = 1; giro <= 6; giro += 1) {
        await coda.lavoraCorsia(IDS.tenantA);
        const r = await ricevuta(accolta.ricevutaId);
        expect(r.tentativi).toBe(giro);
        if (giro < 6) {
          expect(r.esito).toBe(ShopifyWebhookReceiptEsito.in_coda);
          await pronta(accolta.ricevutaId);
        } else {
          expect(r.esito).toBe(ShopifyWebhookReceiptEsito.fallita);
          expect(r.ultimoErrore).toContain('«Sincronizza con Shopify»');
        }
      }
      // Visibile all'operatore, con «Riprova»; l'articolo NON è stato resettato (D9a).
      const elenco = await coda.elencoNonApplicate(IDS.tenantA);
      expect(elenco.map((e) => [e.id, e.esito])).toEqual([[accolta.ricevutaId, 'fallita']]);
      const dopo = await locale(id);
      expect(dopo.shopifySyncStatus).toBe(ShopifySyncStatus.syncing);
      expect(dopo.shopifyLastError).toBeNull();
      const conn = await prisma.shopifyConnection.findUniqueOrThrow({ where: { tenantId: IDS.tenantA } });
      expect(conn.lastErrorCode).toBe('webhook_rinviato_esaurito');
    });

    it('S1c · più notifiche correlate: l ordine resta quello di arrivo, e le altre risorse continuano', async () => {
      const { remotoId } = await pubblicatoPoiMortoInSyncing();
      const chiamate: string[] = [];
      const coda = creaCoda(creaPull());
      // Una seconda risorsa indipendente, elaborata da un gestore finto che registra l'ordine.
      const pull = creaPull();
      const originale = pull.importProductFromWebhook.bind(pull);
      vi.spyOn(pull, 'importProductFromWebhook').mockImplementation(async (t, payload, g) => {
        chiamate.push(String((payload as Record<string, unknown>)['id']));
        return originale(t, payload, g);
      });
      const codaSpia = creaCoda(pull);
      const r1 = await notifica(codaSpia, remotoId, 'corr-1');
      negozio.modifica(remotoId, { title: 'Secondo titolo' });
      const r2 = await notifica(codaSpia, remotoId, 'corr-2');
      const altro = negozio.semina({
        title: 'Altro articolo',
        vendor: 'F',
        product_type: 'T',
        tags: 'collaudo',
        opzioni: [{ name: 'Taglia', values: ['U'] }],
        varianti: [{ sku: 'ALTRO-U', barcode: '9970000000019', price: '5.00', valori: ['U'] }],
      });
      const r3 = await notifica(codaSpia, altro.id, 'altro-1');
      await codaSpia.lavoraCorsia(IDS.tenantA);

      // r1 rinviata; r2 (stessa risorsa) NON tentata; r3 (altra risorsa) elaborata.
      expect(chiamate).toEqual([String(remotoId), String(altro.id)]);
      expect((await ricevuta(r1.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.in_coda);
      expect((await ricevuta(r2.ricevutaId))).toMatchObject({ esito: ShopifyWebhookReceiptEsito.in_coda, tentativi: 0 });
      expect((await ricevuta(r3.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.elaborata);
      expect(await prisma.product.count({ where: { tenantId: IDS.tenantA, shopifyProductId: String(altro.id) } })).toBe(1);
      void coda;
    });

    it('S1d · «Riprova» dopo lo sblocco (un push nuovo): nessun doppione di effetti, i correlati seguono in ordine', async () => {
      const { id, remotoId } = await pubblicatoPoiMortoInSyncing();
      const coda = creaCoda(creaPull());
      negozio.modifica(remotoId, { title: 'Titolo A' });
      const r1 = await notifica(coda, remotoId, 'ripr-1');
      negozio.modifica(remotoId, { title: 'Titolo B' });
      const r2 = await notifica(coda, remotoId, 'ripr-2');
      for (let giro = 1; giro <= 6; giro += 1) {
        await coda.lavoraCorsia(IDS.tenantA);
        if (giro < 6) await pronta(r1.ricevutaId);
      }
      expect((await ricevuta(r1.ricevutaId)).esito).toBe(ShopifyWebhookReceiptEsito.fallita);
      expect((await ricevuta(r2.ricevutaId))).toMatchObject({ esito: ShopifyWebhookReceiptEsito.in_coda, tentativi: 0 });

      // Lo sblocco: un push nuovo (S2) — che SCRIVE sul negozio: qui riporta il titolo locale.
      expect((await creaPush().pushProduct(IDS.tenantA, id)).pushed).toBe(true);
      expect((await locale(id)).shopifySyncStatus).not.toBe(ShopifySyncStatus.syncing);
      vi.spyOn(coda, 'sveglia').mockImplementation(() => undefined);
      await coda.riprova(IDS.tenantA, r1.ricevutaId);
      await coda.lavoraCorsia(IDS.tenantA);
      expect(await ricevuta(r1.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 7 });
      expect(await ricevuta(r2.ricevutaId)).toMatchObject({ esito: ShopifyWebhookReceiptEsito.elaborata, tentativi: 1 });
      // Stato pieno, in ordine: vale l'ultimo (B); un solo articolo, una sola variante.
      const dopo = await prisma.product.findUniqueOrThrow({ where: { id }, include: { variants: true } });
      expect(dopo.shopifyTitle).toBe('Titolo B');
      expect(dopo.variants).toHaveLength(1);
      expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
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

      // Adottato, poi RINVIATO perché `syncing` (D8b): l'adozione è già persistita.
      await expect(
        creaPull().importProductFromWebhook(IDS.tenantA, negozio.webhook(remoto.id)),
      ).rejects.toBeInstanceOf(NotificaDaRinviareException);

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
