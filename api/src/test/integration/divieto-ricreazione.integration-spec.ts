import { CatalogOrigin, ShopifyCatalogLinkKind, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * B5-B6 · **il divieto di ricreazione**, dal servizio di import reale.
 *
 * ⛔ **La domanda si fa allo STORICO, non alla colonna-cache** (`docs/24` §8.5.4).
 *    Il difetto che questo blocco chiude è descritto in §11.8: un GID mai visto
 *    e un GID eliminato definitivamente producono lo stesso `existing === null`,
 *    e il secondo veniva reimportato.
 *
 * ⚠️ **Tre casi, e non vanno confusi:**
 *
 * ```text
 *   mai collegato                       →  si importa
 *   collegamento chiuso, anagrafica viva →  non si crea un doppione
 *   anagrafica eliminata definitivamente →  non si ricrea (§11.8)
 * ```
 *
 * ⛔ **Nessuna regola di RIPRESA**: riagganciare un collegamento chiuso a
 *    un'anagrafica viva è un'azione esplicita e autorizzata (§8.5.2), e qui non
 *    accade — si dice soltanto «non creare».
 */
describe('Divieto di ricreazione all import (B5-B6)', () => {
  let prisma: PrismaClient;
  let storico: ShopifyLinkHistoryService;
  let shopId: string;

  const GID_ESCLUSO = 890001;
  const GID_NUOVO = 890002;
  const GID_ESCLUSO_2 = 890003;

  function remoto(id: number, varianti: readonly number[] = [990101, 990102]) {
    return {
      id,
      title: `Prodotto ${id}`,
      body_html: '<p>x</p>',
      handle: `p-${id}`,
      status: 'active',
      vendor: 'F',
      product_type: 'T',
      tags: '',
      images: [],
      options: [{ name: 'Taglia', values: ['M', 'L'], position: 1 }],
      variants: varianti.map((v, i) => ({
        id: v,
        sku: `SKU-${v}`,
        title: i === 0 ? 'M' : 'L',
        price: '10.00',
        compare_at_price: null,
        barcode: null,
        inventory_item_id: v + 1000,
        option1: i === 0 ? 'M' : 'L',
        option2: null,
        option3: null,
      })),
    };
  }

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    // ⚠️ Il registro non ha FK verso `tenants` e sopravvive a `svuota`: si azzera a parte.
    await prisma.platformAuditLog.deleteMany({});
    const negozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/9980001' },
    });
    shopId = negozio.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: 'prova.myshopify.com',
        shopId,
        // ⚠️ `pullCatalog` esige `read_products`: senza, si ferma prima di
        //    arrivare alla guardia e la prova non proverebbe niente.
        scopes: ['read_products'],
      },
    });
  });

  /** Il servizio di import vero: solo le risposte Shopify sono simulate. */
  function creaImport(
    prodottiRemoti: readonly ReturnType<typeof remoto>[],
    /** Per iniettare un guasto: uno storico che cade, o un registro che non scrive. */
    opzioni: { readonly storico?: unknown; readonly registro?: unknown } = {},
  ) {
    const service = new ShopifyProductPullService(
      prisma as never,
      {
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ shopDomain: 'prova.myshopify.com', accessToken: 'token' }),
      } as never,
      { requestedScopes: ['read_products'] } as never,
      { listAllProducts: vi.fn().mockResolvedValue(prodottiRemoti) } as never,
      {
        healStaleErrorStatus: vi.fn(),
        touchSync: vi.fn(),
        recordApiFailure: vi.fn(),
        markSynced: vi.fn(),
        markError: vi.fn(),
      } as never,
      {
        enrichProduct: vi.fn().mockResolvedValue({
          variantPurchasePriceMinor: new Map<number, number>(),
          collections: [],
          metafields: [],
        }),
      } as never,
      (opzioni.storico ?? storico) as never,
      // §10.3 · il registro VERO: ogni rifiuto qui sotto deve lasciarvi una riga.
      (opzioni.registro ?? new PlatformAuditService(prisma as never, prisma as never)) as never,
    );
    return service;
  }

  /** Le righe di registro del tenant A, nell'ordine in cui sono state scritte. */
  async function registro() {
    return prisma.platformAuditLog.findMany({
      where: { tenantId: IDS.tenantA },
      orderBy: { createdAt: 'asc' },
      select: {
        operation: true,
        outcome: true,
        actor: true,
        actorName: true,
        shopGid: true,
        entityId: true,
        entityLabel: true,
        remoteGid: true,
        detail: true,
        correlationId: true,
      },
    });
  }

  /**
   * Chiude i periodi attivi del tenant, come farebbe uno scollegamento.
   *
   * ⚠️ **Le figlie per prime**: un periodo variante attivo esige il padre
   *    attivo (`shopify_variant_links_padre_attivo_fkey`), e l'ordine inverso
   *    viene rifiutato con `23503`.
   */
  async function chiudiPeriodi(): Promise<void> {
    for (const tabella of ['shopify_variant_links', 'shopify_product_links']) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${tabella}"
            SET status = 'unlinked', close_reason = 'operator',
                closed_at = GREATEST(now(), linked_at), updated_at = now()
          WHERE tenant_id = $1::uuid AND status = 'active'`,
        IDS.tenantA,
      );
    }
  }

  /** Importa un prodotto e poi lo elimina definitivamente, storico compreso. */
  async function importaEdElimina(gid: number, varianti?: readonly number[]): Promise<string> {
    await creaImport([remoto(gid, varianti)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(gid, varianti) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(gid) },
    });
    await prisma.$transaction(async (tx) => {
      await storico.sganciaProdotto(tx, { tenantId: IDS.tenantA, productId: prodotto.id });
      await tx.inventoryLevel.deleteMany({ where: { variant: { productId: prodotto.id } } });
      await tx.productVariant.deleteMany({ where: { productId: prodotto.id } });
      await tx.product.delete({ where: { id: prodotto.id } });
    });
    return prodotto.id;
  }

  // ── 1 · prodotto eliminato: nessuna ricreazione ──────────────────────────

  it('B6a · un prodotto ELIMINATO definitivamente non viene reimportato', async () => {
    await importaEdElimina(GID_ESCLUSO);
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(0);

    const esito = await creaImport([remoto(GID_ESCLUSO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_ESCLUSO) as never,
    );

    expect(esito).toBe('skipped');
    // ⛔ Nessun articolo ricreato: è il difetto di §11.8, chiuso.
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(0);

    // ⭐ §10.3 · il rifiuto è nel REGISTRO, non solo nel log: una riga sola,
    //    `rifiutata`, attore `webhook` senza nome, il negozio, il GID remoto, e
    //    la regola per nome. Nessun `tentativo` prima: non c'era un'operazione
    //    in volo, c'era una decisione.
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'import_prodotto_rifiutato',
      outcome: 'rifiutata',
      actor: 'webhook',
      actorName: null,
      shopGid: 'gid://shopify/Shop/9980001',
      entityId: null,
      remoteGid: `gid://shopify/Product/${GID_ESCLUSO}`,
    });
    expect(righe[0]!.detail).toMatch(/^eliminato_definitivamente: /);
    expect(righe[0]!.entityLabel).toBe(remoto(GID_ESCLUSO).title);
    // ⭐ E l'identità resta com'era: nessun periodo riaperto, nessun riaggancio.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow();
    expect(identita.localDeletedAt).not.toBeNull();
    expect(identita.productId).toBeNull();
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(0);
  });

  it('B6b · ripetuto NON cambia esito, e non lascia residui', async () => {
    await importaEdElimina(GID_ESCLUSO);

    for (let giro = 0; giro < 3; giro += 1) {
      const esito = await creaImport([remoto(GID_ESCLUSO)]).importProductFromWebhook(
        IDS.tenantA,
        remoto(GID_ESCLUSO) as never,
      );
      expect(esito).toBe('skipped');
    }

    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
  });

  // ── 2 · il lotto prosegue, e il motivo è registrato ──────────────────────

  it('B6c · nel LOTTO l articolo escluso non ferma gli altri, e il motivo è registrato', async () => {
    await importaEdElimina(GID_ESCLUSO);
    // ⭐ DUE esclusi nello stesso lotto: la correlazione deve legarli.
    await importaEdElimina(GID_ESCLUSO_2, [990301, 990302]);
    const avvisi: string[] = [];
    const warnOriginale = console.warn;

    // ⚠️ Il motivo passa dal logger di Nest: si cattura per verificare che sia
    //    scritto davvero e che nomini il GID escluso.
    const service = creaImport([
      remoto(GID_ESCLUSO),
      remoto(GID_ESCLUSO_2, [990301, 990302]),
      remoto(GID_NUOVO, [990201, 990202]),
    ]);
    const logger = (service as unknown as { logger: { warn: (m: string) => void } }).logger;
    const warnServizio = logger.warn.bind(logger);
    logger.warn = (messaggio: string) => {
      avvisi.push(messaggio);
      warnServizio(messaggio);
    };

    try {
      const risultato = await service.pullCatalog(IDS.tenantA);

      // ⭐ 1 · Il lotto prosegue: l'altro articolo è entrato, i due esclusi no.
      expect(risultato.imported).toBe(1);
      expect(risultato.skipped).toBe(2);
      expect(risultato.failed).toHaveLength(0);
      expect(
        await prisma.product.count({
          where: { tenantId: IDS.tenantA, shopifyProductId: String(GID_NUOVO) },
        }),
      ).toBe(1);
      // ⛔ E l'escluso non è rientrato.
      expect(
        await prisma.product.count({
          where: { tenantId: IDS.tenantA, shopifyProductId: String(GID_ESCLUSO) },
        }),
      ).toBe(0);

      // ⭐ 2 · Il MOTIVO è registrato, e nomina l'articolo e la ragione.
      const motivo = avvisi.find((a) => a.includes('Import Shopify saltato'));
      expect(motivo).toBeDefined();
      expect(motivo).toContain(`gid://shopify/Product/${GID_ESCLUSO}`);
      expect(motivo).toMatch(/eliminato definitivamente/i);

      // ⭐ 3 · E il registro lo conserva, con l'attore del LOTTO: `pull` — una riga
      //        per escluso, e la STESSA correlazione per tutte e due: è quella
      //        nata all'ingresso del lotto, non un identificativo per riga.
      const righe = await registro();
      expect(righe).toHaveLength(2);
      for (const riga of righe) {
        expect(riga).toMatchObject({
          operation: 'import_prodotto_rifiutato',
          outcome: 'rifiutata',
          actor: 'pull',
          actorName: null,
        });
        expect(riga.detail).toMatch(/^eliminato_definitivamente: /);
      }
      expect(righe.map((r) => r.remoteGid).sort()).toEqual(
        [`gid://shopify/Product/${GID_ESCLUSO}`, `gid://shopify/Product/${GID_ESCLUSO_2}`].sort(),
      );
      expect(new Set(righe.map((r) => r.correlationId)).size).toBe(1);
    } finally {
      logger.warn = warnServizio;
      console.warn = warnOriginale;
    }
  });

  // ── 3 · variante eliminata: non ricreata, il resto prosegue ──────────────

  it('B6d · una VARIANTE eliminata non si ricrea, e il prodotto si aggiorna lo stesso', async () => {
    // Import normale, poi si elimina la sola variante `990102`.
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    const daEliminare = prodotto.variants.find((v) => v.shopifyVariantId === '990102')!;
    await prisma.$transaction(async (tx) => {
      await storico.sganciaVariante(tx, { tenantId: IDS.tenantA, variantId: daEliminare.id });
      await tx.inventoryLevel.deleteMany({ where: { variantId: daEliminare.id } });
      await tx.productVariant.delete({ where: { id: daEliminare.id } });
    });

    // ⚠️ Shopify continua a mandarle entrambe: la eliminata non deve tornare.
    const conNomeNuovo = { ...remoto(GID_NUOVO), title: 'Titolo aggiornato' };
    const esito = await creaImport([conNomeNuovo]).importProductFromWebhook(
      IDS.tenantA,
      conNomeNuovo as never,
    );

    expect(esito).toBe('updated');
    const dopo = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    // ⛔ 1 · La variante eliminata NON è tornata.
    expect(dopo.variants).toHaveLength(1);
    expect(dopo.variants[0]!.shopifyVariantId).toBe('990101');

    // ⭐ 2 · **Gli aggiornamenti consentiti sono avvenuti lo stesso**: il
    //        rifiuto è per variante, non per prodotto.
    expect(dopo.shopifyTitle).toBe('Titolo aggiornato');
    // ⭐ 3 · E la variante rimasta è stata aggiornata come sempre.
    expect(dopo.variants[0]!.shopifyInventoryItemId).toBe('991101');

    // ⭐ 4 · §10.3 · il rifiuto della VARIANTE è nel registro, agganciato al
    //        prodotto che la ospita, e ha commesso insieme al suo aggiornamento.
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'import_variante_rifiutata',
      outcome: 'rifiutata',
      actor: 'webhook',
      entityId: prodotto.id,
      remoteGid: 'gid://shopify/ProductVariant/990102',
    });
    expect(righe[0]!.detail).toMatch(/^eliminato_definitivamente: /);
    expect(righe[0]!.entityLabel).toContain('Titolo aggiornato');
  });

  // ── 3-bis · il registro: sopravvive al rollback, e cade se non si scrive ──

  it('B6i · il rifiuto è REGISTRATO e poi l import CADE: la traccia resta, i dati no, e nessuna dichiarazione falsa', async () => {
    // Import normale, poi la variante `990102` viene eliminata (come B6d).
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    const daEliminare = prodotto.variants.find((v) => v.shopifyVariantId === '990102')!;
    await prisma.$transaction(async (tx) => {
      await storico.sganciaVariante(tx, { tenantId: IDS.tenantA, variantId: daEliminare.id });
      await tx.inventoryLevel.deleteMany({ where: { variantId: daEliminare.id } });
      await tx.productVariant.delete({ where: { id: daEliminare.id } });
    });

    // ⛔ Lo storico cade DOPO il rifiuto: `registraProdotto` lancia una volta.
    //    Nell'import la sequenza è: aggiornamento prodotto → guardia variante
    //    (rifiuto, registrato) → immagini → storico (qui cade) → ROLLBACK.
    let guasti = 1;
    const storicoGuasto = new Proxy(storico, {
      get(bersaglio, proprieta, ricevente) {
        if (proprieta === 'registraProdotto' && guasti > 0) {
          return async () => {
            guasti -= 1;
            throw new Error('guasto iniettato DOPO il rifiuto');
          };
        }
        return Reflect.get(bersaglio, proprieta, ricevente);
      },
    });
    const service = creaImport([remoto(GID_NUOVO)], { storico: storicoGuasto });
    const conNomeNuovo = { ...remoto(GID_NUOVO), title: 'Titolo della consegna ritentata' };
    await expect(
      service.importProductFromWebhook(IDS.tenantA, conNomeNuovo as never),
    ).rejects.toThrow(/guasto iniettato/);

    // ⭐ 1 · DATI APPLICATIVI: rollback intero — il titolo non è cambiato, la
    //        variante non è tornata — e l'import DICE di essere fallito.
    const dopo = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto.id },
      include: { variants: true },
    });
    expect(dopo.shopifyTitle).not.toBe('Titolo della consegna ritentata');
    expect(dopo.variants).toHaveLength(1);
    expect(dopo.shopifySyncStatus).toBe('error');
    expect(dopo.shopifyLastError).toMatch(/guasto iniettato/);

    // ⭐ 2 · REGISTRO: la riga del rifiuto È RIMASTA — il rifiuto è stato
    //        osservato, e il rollback dell'import non lo rende non avvenuto.
    //        ⛔ E da sola: nessuna riuscita, nessuna fallita — la riga non
    //        dichiara niente sull'esito dell'import.
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'import_variante_rifiutata',
      outcome: 'rifiutata',
      actor: 'webhook',
      remoteGid: 'gid://shopify/ProductVariant/990102',
    });
    const correlazioneDellaCaduta = righe[0]!.correlationId;

    // ⭐ 3 · La consegna RITENTATA (storico sano) riesce, e lascia la SUA riga
    //        con un'ALTRA correlazione: due consegne, due rifiuti, due eventi.
    expect(await service.importProductFromWebhook(IDS.tenantA, conNomeNuovo as never)).toBe(
      'updated',
    );
    const dopoIlTentativo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopoIlTentativo.shopifyTitle).toBe('Titolo della consegna ritentata');
    expect(dopoIlTentativo.shopifySyncStatus).toBe('synced');
    const righeDopo = await registro();
    expect(righeDopo).toHaveLength(2);
    expect(righeDopo.every((r) => r.operation === 'import_variante_rifiutata')).toBe(true);
    expect(righeDopo[1]!.correlationId).not.toBe(correlazioneDellaCaduta);
  });

  it('B6j · se il REGISTRO non si scrive, l import NON commette e lo dice: nessun effetto senza traccia', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    const daEliminare = prodotto.variants.find((v) => v.shopifyVariantId === '990102')!;
    await prisma.$transaction(async (tx) => {
      await storico.sganciaVariante(tx, { tenantId: IDS.tenantA, variantId: daEliminare.id });
      await tx.inventoryLevel.deleteMany({ where: { variantId: daEliminare.id } });
      await tx.productVariant.delete({ where: { id: daEliminare.id } });
    });

    // ⛔ Il registro non scrive: la riga del rifiuto non può nascere.
    const registroGuasto = {
      registraRifiuto: async () => {
        throw new Error('registro non disponibile');
      },
    };
    const conNomeNuovo = { ...remoto(GID_NUOVO), title: 'Titolo senza registro' };
    await expect(
      creaImport([remoto(GID_NUOVO)], { registro: registroGuasto }).importProductFromWebhook(
        IDS.tenantA,
        conNomeNuovo as never,
      ),
    ).rejects.toThrow(/registro non disponibile/);

    // ⭐ 1 · NIENTE è commesso: titolo invariato, variante non tornata; e
    //        l'import dice perché è caduto.
    const dopo = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto.id },
      include: { variants: true },
    });
    expect(dopo.shopifyTitle).not.toBe('Titolo senza registro');
    expect(dopo.variants).toHaveLength(1);
    expect(dopo.shopifySyncStatus).toBe('error');
    expect(dopo.shopifyLastError).toMatch(/registro non disponibile/);
    // ⭐ 2 · E il registro è vuoto: nessuna riga «di comodo».
    expect(await registro()).toHaveLength(0);

    // ⭐ 3 · Registro tornato: la stessa consegna ritentata riesce e lascia la riga.
    expect(
      await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
        IDS.tenantA,
        conNomeNuovo as never,
      ),
    ).toBe('updated');
    expect((await registro()).map((r) => r.operation)).toEqual(['import_variante_rifiutata']);
  });

  // ── 3-ter · la copertura: tutti i rifiuti autorizzati, non tre ──────────

  it('B5a-quater · una VARIANTE col periodo chiuso e senza cache non si ricrea: «già collegata», registrata', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow({
      where: { shopifyVariantGid: 'gid://shopify/ProductVariant/990102' },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_links
          SET status = 'unlinked', close_reason = 'operator',
              closed_at = GREATEST(now(), linked_at), updated_at = now()
        WHERE identity_id = $1::uuid AND status = 'active'`,
      identita.id,
    );
    // ⚠️ Come B5a, per la variante: la cache azzerata, la riga viva.
    await prisma.productVariant.updateMany({
      where: { tenantId: IDS.tenantA, shopifyVariantId: '990102' },
      data: { shopifyVariantId: null, shopifyInventoryItemId: null },
    });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('updated');
    // ⛔ Nessuna variante nuova, e la riga viva non è stata ricollegata.
    expect(await prisma.productVariant.count({ where: { tenantId: IDS.tenantA } })).toBe(2);
    expect(
      await prisma.productVariant.count({
        where: { tenantId: IDS.tenantA, shopifyVariantId: '990102' },
      }),
    ).toBe(0);
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'import_variante_rifiutata',
      outcome: 'rifiutata',
      actor: 'webhook',
      remoteGid: 'gid://shopify/ProductVariant/990102',
    });
    expect(righe[0]!.detail).toMatch(/^gia_collegato: /);
  });

  it('B6f · anagrafica RICOMPARSA con la cache di un identità ELIMINATA: il riaggancio è rifiutato e registrato', async () => {
    // ⚠️ SITUAZIONE COSTRUITA: è ciò che un ripristino da backup produce
    //    (`DA-FARE` §26.7) — la riga torna con la colonna-cache, l'identità è
    //    eliminata. Qui si costruisce a mano per provare il registro.
    const idEliminato = await importaEdElimina(GID_NUOVO);
    // ⚠️ Fedele a un ripristino: STESSO id, origine `shopify`, collegamento
    //    `imported` — con un id nuovo lo storico risponderebbe «di un altro», e
    //    con origine `vestiflow` l'import la salterebbe come catalogo locale.
    const tornato = await prisma.product.create({
      data: {
        id: idEliminato,
        tenantId: IDS.tenantA,
        name: 'Tornato dal backup',
        articleCode: 'TORNATO-1',
        catalogOrigin: CatalogOrigin.shopify,
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.imported,
        shopifyProductId: String(GID_NUOVO),
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'SKU-990101',
              optionValues: { Taglia: 'M' },
              sellingPriceMinor: 1000,
              shopifyVariantId: '990101',
              shopifyInventoryItemId: '991101',
            },
          ],
        },
      },
    });

    const conTitolo = { ...remoto(GID_NUOVO, [990101]), title: 'Titolo dopo il ritorno' };
    const esito = await creaImport([conTitolo]).importProductFromWebhook(
      IDS.tenantA,
      conTitolo as never,
    );

    // ⛔ **Comportamento SUPERATO il 09/09/2026.** Qui c'era `expect(esito).
    //    toBe('updated')`, con la nota «l'import va a buon fine e aggiorna per
    //    cache (è la famiglia di §26.7: misurato, non deciso)». Ora 26.7 è
    //    deciso: un'identità eliminata definitivamente non autorizza il
    //    passaggio degli aggiornamenti attraverso la colonna-cache, quindi
    //    l'import SALTA l'anagrafica invece di aggiornarla.
    expect(esito).toBe('skipped');
    // ⭐ Lo storico resta com'era: identità eliminata, nessun periodo attivo.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { shopifyProductGid: `gid://shopify/Product/${GID_NUOVO}` },
    });
    expect(identita.localDeletedAt).not.toBeNull();
    expect(identita.productId).toBeNull();
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(0);
    // ⭐ §10.3 · UNA riga: il riaggancio del PRODOTTO rifiutato — «identità
    //    eliminata» — e le varianti non vengono nemmeno esaminate.
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      outcome: 'rifiutata',
      actor: 'webhook',
      entityId: tornato.id,
      remoteGid: `gid://shopify/Product/${GID_NUOVO}`,
    });
    expect(righe[0]!.detail).toMatch(/^identita_eliminata: /);
  });

  it('B6g · VARIANTE ricomparsa con la cache di un identità eliminata: riaggancio rifiutato e registrato, per variante', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    const daEliminare = prodotto.variants.find((v) => v.shopifyVariantId === '990102')!;
    await prisma.$transaction(async (tx) => {
      await storico.sganciaVariante(tx, { tenantId: IDS.tenantA, variantId: daEliminare.id });
      await tx.inventoryLevel.deleteMany({ where: { variantId: daEliminare.id } });
      await tx.productVariant.delete({ where: { id: daEliminare.id } });
    });
    // ⚠️ SITUAZIONE COSTRUITA (ripristino): la riga torna con la sua cache e
    //    con lo STESSO id — un ripristino conserva gli id.
    const tornata = await prisma.productVariant.create({
      data: {
        id: daEliminare.id,
        tenantId: IDS.tenantA,
        productId: prodotto.id,
        sku: 'SKU-990102',
        optionValues: { Taglia: 'L' },
        sellingPriceMinor: 1000,
        shopifyVariantId: '990102',
        shopifyInventoryItemId: '991102',
      },
    });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('updated');
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow({
      where: { shopifyVariantGid: 'gid://shopify/ProductVariant/990102' },
      include: { periodi: true },
    });
    expect(identita.localDeletedAt).not.toBeNull();
    expect(identita.variantId).toBeNull();
    expect(identita.periodi.map((p) => p.status)).toEqual(['unlinked']);
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      outcome: 'rifiutata',
      entityId: tornata.id,
      remoteGid: 'gid://shopify/ProductVariant/990102',
    });
    expect(righe[0]!.detail).toMatch(/^identita_eliminata: /);
  });

  it('B6h · la cache punta al GID di un ALTRA anagrafica: riaggancio rifiutato e registrato, l altra intatta', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const legittimo = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
    });
    // ⚠️ SITUAZIONE COSTRUITA: un'altra anagrafica porta la cache del GID, e
    //    quella legittima non la porta più (altrimenti `existing` sarebbe ambiguo).
    await prisma.product.update({ where: { id: legittimo.id }, data: { shopifyProductId: null } });
    const abusivo = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Anagrafica con la cache altrui',
        articleCode: 'ABUSIVO-1',
        // ⚠️ Origine `shopify`: con `vestiflow` l'import la salterebbe prima
        //    di arrivare allo storico, e la prova non proverebbe niente.
        catalogOrigin: CatalogOrigin.shopify,
        shopifyCatalogLinkKind: ShopifyCatalogLinkKind.imported,
        shopifyProductId: String(GID_NUOVO),
      },
    });

    const esito = await creaImport([remoto(GID_NUOVO, [])]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO, []) as never,
    );

    // ⛔ **Comportamento SUPERATO il 09/09/2026**: qui l'esito era `updated`,
    //    cioè l'anagrafica abusiva riceveva gli aggiornamenti del GID altrui
    //    passando dalla propria cache. Con 26.7 il GID di un altro articolo non
    //    è utilizzabile, e l'import salta.
    expect(esito).toBe('skipped');
    // ⭐ L'identità resta della anagrafica legittima: nessuna riassegnazione.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { shopifyProductGid: `gid://shopify/Product/${GID_NUOVO}` },
    });
    expect(identita.originalProductId).toBe(legittimo.id);
    expect(identita.productId).toBe(legittimo.id);
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      outcome: 'rifiutata',
      entityId: abusivo.id,
      remoteGid: `gid://shopify/Product/${GID_NUOVO}`,
    });
    expect(righe[0]!.detail).toMatch(/^gid_di_un_altro: /);
  });

  it('B6h-bis · una VARIANTE con la cache del GID di un altra variante: riaggancio rifiutato e registrato, la legittima intatta', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    const legittima = prodotto.variants.find((v) => v.shopifyVariantId === '990102')!;
    // ⚠️ SITUAZIONE COSTRUITA: la legittima perde la cache, un'altra riga dello
    //    stesso prodotto la porta — così la mappa per cache è univoca e la
    //    scelta non dipende dall'ordine delle righe.
    await prisma.productVariant.update({
      where: { id: legittima.id },
      data: { shopifyVariantId: null, shopifyInventoryItemId: null },
    });
    const abusiva = await prisma.productVariant.create({
      data: {
        tenantId: IDS.tenantA,
        productId: prodotto.id,
        sku: 'SKU-ABUSIVA',
        optionValues: { Taglia: 'XL' },
        sellingPriceMinor: 1000,
        shopifyVariantId: '990102',
        shopifyInventoryItemId: '991102',
      },
    });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('updated');
    // ⭐ L'identità resta della variante legittima: nessuna riassegnazione.
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow({
      where: { shopifyVariantGid: 'gid://shopify/ProductVariant/990102' },
    });
    expect(identita.originalVariantId).toBe(legittima.id);
    expect(identita.variantId).toBe(legittima.id);
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      outcome: 'rifiutata',
      entityId: abusiva.id,
      remoteGid: 'gid://shopify/ProductVariant/990102',
    });
    // ⚠️ **Il nome della regola è cambiato il 09/09/2026**, e con lui questa
    //    attesa: prima il rifiuto arrivava dalla SCRITTURA dello storico
    //    (`gid_di_un_altra`, che aveva un vocabolario suo per le varianti); ora
    //    arriva dalla GUARDIA operativa di 26.7, che parla una lingua sola per
    //    prodotti e varianti — `gid_di_un_altro`. La situazione rifiutata è la
    //    stessa; a cambiare è chi la rifiuta, e prima della scrittura.
    expect(righe[0]!.detail).toMatch(/^gid_di_un_altro: /);
  });

  it('B5f · cache del PRODOTTO azzerata con periodo ATTIVO: «già collegato», non si crea un doppione, registrato', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
    });
    // ⚠️ Solo la cache: il periodo resta ATTIVO. È il doppione canonico di B5.
    await prisma.product.update({ where: { id: prodotto.id }, data: { shopifyProductId: null } });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('skipped');
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    // ⛔ E la cache non viene rimessa di nascosto: il riaggancio è un'azione esplicita.
    expect((await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } })).shopifyProductId).toBeNull();
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'import_prodotto_rifiutato',
      outcome: 'rifiutata',
      remoteGid: `gid://shopify/Product/${GID_NUOVO}`,
    });
    expect(righe[0]!.detail).toMatch(/^gia_collegato: /);
  });

  it('B5f-bis · cache della VARIANTE azzerata con periodo ATTIVO: «già collegata», non si ricrea, registrata', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    await prisma.productVariant.updateMany({
      where: { tenantId: IDS.tenantA, shopifyVariantId: '990102' },
      data: { shopifyVariantId: null, shopifyInventoryItemId: null },
    });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('updated');
    expect(await prisma.productVariant.count({ where: { tenantId: IDS.tenantA } })).toBe(2);
    expect(
      await prisma.productVariant.count({
        where: { tenantId: IDS.tenantA, shopifyVariantId: '990102' },
      }),
    ).toBe(0);
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'import_variante_rifiutata',
      outcome: 'rifiutata',
      remoteGid: 'gid://shopify/ProductVariant/990102',
    });
    expect(righe[0]!.detail).toMatch(/^gia_collegato: /);
  });

  it('B6k · DUE varianti rifiutate nella STESSA consegna: due righe, una correlazione', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    // Entrambe le varianti eliminate dal percorso di B4: il prodotto resta.
    await prisma.$transaction(async (tx) => {
      for (const v of prodotto.variants) {
        await storico.sganciaVariante(tx, { tenantId: IDS.tenantA, variantId: v.id });
        await tx.inventoryLevel.deleteMany({ where: { variantId: v.id } });
        await tx.productVariant.delete({ where: { id: v.id } });
      }
    });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('updated');
    expect(await prisma.productVariant.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    const righe = await registro();
    expect(righe).toHaveLength(2);
    expect(righe.every((r) => r.operation === 'import_variante_rifiutata' && r.actor === 'webhook')).toBe(true);
    expect(righe.map((r) => r.remoteGid).sort()).toEqual([
      'gid://shopify/ProductVariant/990101',
      'gid://shopify/ProductVariant/990102',
    ]);
    // ⭐ Stessa consegna, stessa correlazione.
    expect(new Set(righe.map((r) => r.correlationId)).size).toBe(1);
  });

  // ── 4 · collegamento chiuso con anagrafica ANCORA PRESENTE ───────────────

  it('B5a · collegamento chiuso e anagrafica viva: non si crea un DOPPIONE', async () => {
    // ⚠️ Si simula uno scollegamento: il periodo si chiude, l'articolo resta, e
    //    la colonna-cache viene azzerata — è lo stato in cui `existing` è null
    //    e senza lo storico l'import creerebbe un secondo articolo.
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
    });
    await chiudiPeriodi();
    await prisma.product.update({
      where: { id: prodotto.id },
      data: { shopifyProductId: null },
    });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('skipped');
    // ⛔ Un solo articolo: nessun doppione.
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    // ⭐ E **nessuna ripresa**: il periodo chiuso resta chiuso, con la sua causale.
    const periodi = await prisma.shopifyProductLink.findMany();
    expect(periodi).toHaveLength(1);
    expect(periodi[0]!.status).toBe('unlinked');
    expect(periodi[0]!.closeReason).toBe('operator');
    // ⚠️ E l'anagrafica non è stata ricollegata di nascosto.
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopo.shopifyProductId).toBeNull();

    // ⭐ §10.3 · il rifiuto «già collegato» (collegamento chiuso, anagrafica viva,
    //    cache azzerata) è nel registro come import del prodotto rifiutato.
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'import_prodotto_rifiutato',
      outcome: 'rifiutata',
      actor: 'webhook',
      entityId: null,
      remoteGid: `gid://shopify/Product/${GID_NUOVO}`,
    });
    expect(righe[0]!.detail).toMatch(/^gia_collegato: /);
  });

  it('B5a-bis · periodo chiuso e identificativo Shopify ANCORA PRESENTE: nessuna riapertura', async () => {
    // ⛔ **Il divieto non deve dipendere dalla colonna-cache**, e `B5a` la
    //    azzerava. Qui `shopifyProductId` resta al suo posto: l'import trova
    //    l'articolo, passa dal ramo di AGGIORNAMENTO — dove la guardia di
    //    creazione non arriva — e prosegue fino alla scrittura dello storico.
    //
    // ⭐ È lì che stava il difetto: senza periodo attivo se ne apriva uno
    //    NUOVO, cioè una **ripresa automatica** del collegamento. La ripresa
    //    richiede un'azione esplicita autorizzata (`docs/24` §8.5.2).
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    await chiudiPeriodi();
    const primaChiusura = await prisma.shopifyProductLink.findFirstOrThrow();

    // ⚠️ La colonna-cache NON si tocca: è il punto della prova.
    const conNomeNuovo = { ...remoto(GID_NUOVO), title: 'Titolo aggiornato' };
    const esito = await creaImport([conNomeNuovo]).importProductFromWebhook(
      IDS.tenantA,
      conNomeNuovo as never,
    );

    // ⛔ **Comportamento SUPERATO il 09/09/2026, e questa è la prova che lo
    //    dichiara.** Fino a quel giorno l'esito era `updated` e il titolo nuovo
    //    veniva scritto: l'import trovava l'articolo per colonna-cache e
    //    proseguiva, e il solo riaggancio veniva rifiutato. Il proprietario ha
    //    deciso che «un collegamento chiuso non autorizza né una riapertura né
    //    il passaggio automatico di aggiornamenti attraverso la cache» (26.7):
    //    l'import salta l'anagrafica, e la sicurezza non dipende più dal fatto
    //    che qualcuno sia passato dal ripristino ad azzerare la colonna.
    expect(esito).toBe('skipped');
    // ⛔ 1 · Nessun periodo attivo è nato.
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(0);
    expect(await prisma.shopifyVariantLink.count({ where: { status: 'active' } })).toBe(0);
    // ⛔ 2 · E nemmeno un periodo in più: il chiuso resta l'unico.
    expect(await prisma.shopifyProductLink.count()).toBe(1);

    // ⭐ 3 · Causale e date precedenti intatte: nessuna riscrittura.
    const dopo = await prisma.shopifyProductLink.findFirstOrThrow();
    expect(dopo.id).toBe(primaChiusura.id);
    expect(dopo.status).toBe('unlinked');
    expect(dopo.closeReason).toBe('operator');
    expect(dopo.closedAt?.toISOString()).toBe(primaChiusura.closedAt?.toISOString());
    expect(dopo.linkedAt.toISOString()).toBe(primaChiusura.linkedAt.toISOString());

    // ⛔ 4 · E il titolo nuovo NON è arrivato. Qui l'attesa era l'opposto —
    //        «gli aggiornamenti consentiti al prodotto sono avvenuti lo stesso»,
    //        con `toBe('Titolo aggiornato')`. Era il difetto 26.7 scritto come
    //        conformità: un collegamento chiuso lasciava passare la modifica
    //        remota perché la colonna-cache diceva ancora «collegato».
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
    });
    expect(prodotto.shopifyTitle).not.toBe('Titolo aggiornato');

    // ⭐ 5 · §10.3 · il RIAGGANCIO rifiutato è nel registro — non come «import
    //        rifiutato», perché l'import è andato a buon fine: come
    //        `riaggancio_rifiutato`, sul prodotto, con la regola per nome.
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      outcome: 'rifiutata',
      actor: 'webhook',
      entityId: prodotto.id,
      remoteGid: `gid://shopify/Product/${GID_NUOVO}`,
      shopGid: 'gid://shopify/Shop/9980001',
    });
    expect(righe[0]!.detail).toMatch(/^collegamento_chiuso: /);
  });

  it('B5a-ter · una VARIANTE con periodo chiuso non riapre il suo, e il prodotto resta attivo', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );
    // ⚠️ Si chiude il periodo di UNA sola variante: il padre resta attivo, che
    //    è consentito (la FK esige il contrario, non questo).
    const variante = await prisma.shopifyVariantIdentity.findFirstOrThrow({
      where: { shopifyVariantGid: 'gid://shopify/ProductVariant/990102' },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_links
          SET status = 'unlinked', close_reason = 'operator',
              closed_at = GREATEST(now(), linked_at), updated_at = now()
        WHERE identity_id = $1::uuid AND status = 'active'`,
      variante.id,
    );
    const chiuso = await prisma.shopifyVariantLink.findFirstOrThrow({
      where: { identityId: variante.id },
    });

    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    // ⛔ Il periodo di quella variante NON è stato riaperto, né duplicato.
    const periodi = await prisma.shopifyVariantLink.findMany({
      where: { identityId: variante.id },
    });
    expect(periodi).toHaveLength(1);
    expect(periodi[0]!.id).toBe(chiuso.id);
    expect(periodi[0]!.status).toBe('unlinked');
    expect(periodi[0]!.closeReason).toBe('operator');
    expect(periodi[0]!.closedAt?.toISOString()).toBe(chiuso.closedAt?.toISOString());

    // ⭐ E l'altra variante, che era attiva, lo è ancora: il rifiuto è per
    //    identità, non per prodotto.
    expect(await prisma.shopifyVariantLink.count({ where: { status: 'active' } })).toBe(1);
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(1);

    // ⭐ §10.3 · il riaggancio rifiutato della SOLA variante è nel registro,
    //    agganciato alla riga locale (che esiste, con la sua cache); nessuna
    //    riga per il prodotto, che è stato registrato normalmente.
    const rigaLocale = await prisma.productVariant.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyVariantId: '990102' },
    });
    const righe = await registro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      outcome: 'rifiutata',
      actor: 'webhook',
      entityId: rigaLocale.id,
      remoteGid: 'gid://shopify/ProductVariant/990102',
    });
    expect(righe[0]!.detail).toMatch(/^collegamento_chiuso: /);
  });

  // ── 5 · i casi VALIDI non sono toccati ───────────────────────────────────

  it('B5b · un articolo MAI collegato si importa normalmente', async () => {
    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('imported');
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
      include: { variants: true },
    });
    expect(prodotto.variants).toHaveLength(2);
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
  });

  it('B5c · un articolo GIÀ importato si aggiorna come sempre', async () => {
    await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    const conNomeNuovo = { ...remoto(GID_NUOVO), title: 'Rinominato su Shopify' };
    const esito = await creaImport([conNomeNuovo]).importProductFromWebhook(
      IDS.tenantA,
      conNomeNuovo as never,
    );

    // ⭐ La guardia vale solo nel ramo di CREAZIONE: gli aggiornamenti passano.
    expect(esito).toBe('updated');
    const dopo = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: String(GID_NUOVO) },
    });
    expect(dopo.shopifyTitle).toBe('Rinominato su Shopify');
  });

  // ── 6 · isolamento fra tenant ────────────────────────────────────────────

  it('B6e · l esclusione di un tenant non impedisce l import all altro', async () => {
    await importaEdElimina(GID_ESCLUSO);

    const negozioB = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/9980002' },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantB,
        status: 'connected',
        shopDomain: 'altro.myshopify.com',
        shopId: negozioB.id,
      },
    });

    // ⭐ Stesso GID, altro negozio: l'esclusione ha grana per NEGOZIO.
    const esito = await creaImport([remoto(GID_ESCLUSO)]).importProductFromWebhook(
      IDS.tenantB,
      remoto(GID_ESCLUSO) as never,
    );

    expect(esito).toBe('imported');
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantB } })).toBe(1);
    // ⛔ E il tenant A resta escluso.
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
  });

  // ── 7 · connessioni legacy e uso senza Shopify ───────────────────────────

  it('B5d · connessione NON migrata: l import non cambia comportamento', async () => {
    // ⛔ Senza `shop_id` non c'è storico da interrogare, e la guardia non deve
    //    inventarsi un rifiuto: l'import prosegue come è sempre stato.
    await prisma.shopifyConnection.update({
      where: { tenantId: IDS.tenantA },
      data: { shopId: null },
    });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('imported');
    expect(
      await prisma.product.count({
        where: { tenantId: IDS.tenantA, shopifyProductId: String(GID_NUOVO) },
      }),
    ).toBe(1);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    // ⭐ E nessuna riga di registro: senza negozio non c'è storico da interrogare,
    //    quindi niente da rifiutare — per progetto, non per dimenticanza.
    expect(await registro()).toHaveLength(0);
  });

  it('B5e · senza NESSUNA connessione Shopify l import resta quello di prima', async () => {
    await prisma.shopifyConnection.delete({ where: { tenantId: IDS.tenantA } });

    const esito = await creaImport([remoto(GID_NUOVO)]).importProductFromWebhook(
      IDS.tenantA,
      remoto(GID_NUOVO) as never,
    );

    expect(esito).toBe('imported');
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect(await registro()).toHaveLength(0);
  });
});
