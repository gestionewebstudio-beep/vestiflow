import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * B3 · la PUBBLICAZIONE scrive lo storico — dal servizio reale.
 *
 * ⛔ **Questo file colma una lacuna vera**, rilevata dal proprietario il
 *    09/09/2026: `storico-import-push.integration-spec.ts` porta quel nome ma
 *    le sue nove prove sono **tutte** sull'importazione. B3 era cablato e
 *    provato solo dalle unitarie, che girano su un tenant **senza negozio
 *    identificato** — cioè esercitano il ramo in cui lo storico NON si scrive.
 *
 * ⭐ **Servizio reale, PostgreSQL vero, sole risposte Shopify simulate**: le
 *    scritture, i vincoli e l'idempotenza sono quelli del database.
 */
describe('Pubblicazione verso Shopify e storico dei collegamenti (B3)', () => {
  let prisma: PrismaClient;
  let shopId: string;
  let prodotto: string;
  let varianteM: string;
  let varianteL: string;

  /** Ciò che Shopify «risponde» alla creazione: due varianti abbinate per SKU. */
  const RISPOSTA_SHOPIFY = {
    id: 660001,
    variants: [
      { id: 661001, sku: 'PUB-M', inventory_item_id: 662001 },
      { id: 661002, sku: 'PUB-L', inventory_item_id: 662002 },
    ],
    images: [],
  };

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
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

    const negozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/9970001' },
    });
    shopId = negozio.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: 'prova.myshopify.com',
        shopId,
        // ⚠️ Lo scope serve: senza, il push si ferma prima di scrivere qualsiasi
        //    cosa e la prova sarebbe verde per il motivo sbagliato.
        scopes: ['write_products'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: 'prova.myshopify.com',
        accessTokenEnc: 'cifrato',
        scopes: ['write_products'],
      },
    });

    const creato = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Articolo da pubblicare',
        articleCode: 'PUB-1',
        shopifySyncEnabled: true,
        variants: {
          create: [
            { tenantId: IDS.tenantA, sku: 'PUB-M', optionValues: { T: 'M' }, sellingPriceMinor: 2990 },
            { tenantId: IDS.tenantA, sku: 'PUB-L', optionValues: { T: 'L' }, sellingPriceMinor: 2990 },
          ],
        },
      },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    prodotto = creato.id;
    varianteL = creato.variants[0]!.id;
    varianteM = creato.variants[1]!.id;
  });

  /**
   * Il servizio di pubblicazione VERO, con Prisma vero.
   *
   * ⚠️ **Le uniche cose simulate sono le risposte di Shopify** e i servizi che
   *    parlano con Shopify per i metadati: la tassonomia e i metafield non
   *    c'entrano con lo storico, e riempirli renderebbe la prova sensibile a
   *    cose che non sta provando.
   */
  function creaPush(
    opzioni: {
      readonly senzaNegozio?: boolean;
      readonly storico?: unknown;
      readonly creaProdotto?: () => Promise<unknown>;
      readonly graphql?: Record<string, unknown>;
    } = {},
  ) {
    const shopifyAdmin = {
      createProduct: vi.fn(
        opzioni.creaProdotto ?? (async () => structuredClone(RISPOSTA_SHOPIFY)),
      ),
      listProductMetafields: vi.fn().mockResolvedValue([]),
      upsertProductMetafield: vi.fn(),
      updateInventoryItemCost: vi.fn(),
      createProductImage: vi.fn(),
    };
    // ⛔ **I metodi devono essere QUELLI CHE IL SERVIZIO CHIAMA.** La prima
    //    stesura esponeva `productUpdate` e `productVariantsBulkUpdate`, che
    //    **non esistono**: il ramo GraphQL falliva, e `3b` restava verde perché
    //    contava soltanto l'assenza di duplicazioni — che un push fallito
    //    garantisce da sé. Verde per il motivo sbagliato, rilevato dal
    //    proprietario il 09/09/2026.
    const shopifyGraphql = {
      updateProductCatalog: vi.fn().mockResolvedValue(undefined),
      bulkUpdateVariants: vi.fn().mockResolvedValue(undefined),
      listProductVariants: vi.fn().mockResolvedValue([]),
      getProductTitle: vi.fn().mockResolvedValue(null),
      listProductMedia: vi.fn().mockResolvedValue([]),
      addProductMedia: vi.fn().mockResolvedValue(undefined),
      setProductStatus: vi.fn().mockResolvedValue(undefined),
      ...(opzioni.graphql ?? {}),
    };
    const service = new ShopifyProductPushService(
      prisma as never,
      {
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ shopDomain: 'prova.myshopify.com', accessToken: 'token' }),
      } as never,
      shopifyAdmin as never,
      { markSynced: vi.fn(), markError: vi.fn(), touchSync: vi.fn() } as never,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as never,
      { buildMetafields: vi.fn().mockResolvedValue([]) } as never,
      shopifyGraphql as never,
      (opzioni.storico ??
        (opzioni.senzaNegozio
          ? { negozioDelTenant: vi.fn().mockResolvedValue(null) }
          : new ShopifyLinkHistoryService())) as never,
      new PlatformAuditService(prisma as never, prisma as never),
    );
    return { service, shopifyAdmin, shopifyGraphql };
  }

  // ── 1 · la scrittura: colonne preesistenti E storico, insieme ────────────

  it('3a · la pubblicazione scrive colonne-cache E storico, prodotto e varianti', async () => {
    const { service, shopifyAdmin } = creaPush();

    const esito = await service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ 1 · L'esito finale della pubblicazione è quello atteso.
    expect(esito.pushed).toBe(true);
    expect(shopifyAdmin.createProduct).toHaveBeenCalledTimes(1);

    // ⭐ 2 · Le colonne-cache di sempre: non sono state sostituite dallo storico.
    const dopo = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    expect(dopo.shopifyProductId).toBe('660001');
    expect(dopo.catalogOrigin).toBe('vestiflow');
    expect(dopo.shopifyCatalogLinkKind).toBe('pushed');
    const perSku = new Map(dopo.variants.map((v) => [v.sku, v]));
    expect(perSku.get('PUB-M')!.shopifyVariantId).toBe('661001');
    expect(perSku.get('PUB-M')!.shopifyInventoryItemId).toBe('662001');
    expect(perSku.get('PUB-L')!.shopifyVariantId).toBe('661002');

    // ⭐ 3 · E lo storico, sullo stesso prodotto.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.shopifyProductGid).toBe('gid://shopify/Product/660001');
    expect(identita.originalProductId).toBe(prodotto);
    expect(identita.productId).toBe(prodotto);
    const periodo = await prisma.shopifyProductLink.findFirstOrThrow();
    expect(periodo.status).toBe('active');

    const identitaVarianti = await prisma.shopifyVariantIdentity.findMany();
    expect(identitaVarianti).toHaveLength(2);
    expect(identitaVarianti.map((v) => v.shopifyVariantGid).sort()).toEqual([
      'gid://shopify/ProductVariant/661001',
      'gid://shopify/ProductVariant/661002',
    ]);
    expect(identitaVarianti.map((v) => v.shopifyInventoryItemGid).sort()).toEqual([
      'gid://shopify/InventoryItem/662001',
      'gid://shopify/InventoryItem/662002',
    ]);
    // ⭐ Ogni variante è agganciata alla variante LOCALE giusta, non a caso.
    const perGid = new Map(identitaVarianti.map((v) => [v.shopifyVariantGid, v]));
    expect(perGid.get('gid://shopify/ProductVariant/661001')!.originalVariantId).toBe(varianteM);
    expect(perGid.get('gid://shopify/ProductVariant/661002')!.originalVariantId).toBe(varianteL);

    const periodiVariante = await prisma.shopifyVariantLink.findMany();
    expect(periodiVariante).toHaveLength(2);
    expect(periodiVariante.every((p) => p.productLinkId === periodo.id)).toBe(true);
  });

  // ── 2 · ripetizione ──────────────────────────────────────────────────────

  it('3b · pubblicazione RIPETUTA: entrambe riescono, e nessuna duplicazione', async () => {
    // ⛔ **L'assenza di duplicazioni da sola NON basta**, e la prima stesura si
    //    fermava lì: un secondo push FALLITO non duplica niente, quindi quella
    //    verifica era soddisfatta anche dal caso che si voleva escludere.
    //    Serve prima di tutto che entrambe le pubblicazioni riescano davvero.
    const primo = await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    expect(primo.pushed).toBe(true);

    // ⚠️ Il secondo giro trova `shopifyProductId` già valorizzato e passa dal
    //    ramo GraphQL: è un percorso DIVERSO dal primo, e va esercitato.
    const secondo = creaPush();
    const esito = await secondo.service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ 1 · Entrambe riuscite, e la seconda è passata davvero da GraphQL.
    expect(esito.pushed).toBe(true);
    expect(secondo.shopifyGraphql.updateProductCatalog).toHaveBeenCalledTimes(1);
    expect(secondo.shopifyGraphql.bulkUpdateVariants).toHaveBeenCalledTimes(1);
    // ⛔ E NON è stato ricreato su Shopify: il prodotto era già collegato.
    expect(secondo.shopifyAdmin.createProduct).not.toHaveBeenCalled();

    // ⭐ 2 · Lo stato finale del prodotto dichiara la riuscita.
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto } });
    expect(dopo.shopifySyncStatus).toBe('synced');
    expect(dopo.shopifyLastError).toBeNull();
    expect(dopo.shopifyProductId).toBe('660001');

    // ⭐ 3 · E solo allora conta qualcosa dire che nulla è raddoppiato.
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);
    expect(await prisma.shopifyVariantLink.count()).toBe(2);
  });

  it('3c · IDEMPOTENZA LOCALE: lo stesso GID due volte non duplica lo storico', async () => {
    // ⚠️ **Questa prova NON è il recupero dopo un fallimento**, e la distinzione
    //    è il punto: qui il simulatore restituisce **sempre lo stesso GID**,
    //    cioè rappresenta la stessa creazione remota vista due volte. Prova che
    //    lo storico riconosce un GID già noto e riusa identità e periodo.
    //
    // ⛔ Il caso in cui Shopify assegna un GID **nuovo** a ogni creazione è
    //    un'altra cosa, ed è `3h`.
    await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    await prisma.product.update({
      where: { id: prodotto },
      data: { shopifyProductId: null },
    });

    await creaPush().service.pushProduct(IDS.tenantA, prodotto);

    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);
    expect(await prisma.shopifyVariantLink.count()).toBe(2);
  });

  it('3h · ⛔ LIMITE MISURATO · dopo un fallimento locale il prodotto remoto RESTA, e il nuovo tentativo ne crea un secondo', async () => {
    // ⭐ **Simulatore che si comporta come Shopify**: conserva ciò che ha creato
    //    e assegna un identificativo NUOVO a ogni creazione. È l'unica forma in
    //    cui la domanda «quanti prodotti remoti restano?» ha una risposta.
    const creati: { readonly id: number }[] = [];
    let prossimo = 665000;
    const creaRemoto = async () => {
      prossimo += 1;
      const remoto = {
        id: prossimo,
        variants: [
          { id: prossimo * 10 + 1, sku: 'PUB-M', inventory_item_id: prossimo * 100 + 1 },
          { id: prossimo * 10 + 2, sku: 'PUB-L', inventory_item_id: prossimo * 100 + 2 },
        ],
        images: [],
      };
      creati.push({ id: remoto.id });
      return remoto;
    };

    // ── 1 · la creazione remota RIESCE, la scrittura locale cade dopo ───────
    const storicoRotto = {
      negozioDelTenant: async () => shopId,
      // 26.7 · la guardia della pubblicazione, inoltrata al servizio vero:
      //    qui l articolo non ha ancora storia, quindi risponde «si pubblica».
      puoPubblicareDaZero: (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().puoPubblicareDaZero(tx, dati),
      registraProdotto: async () => {
        throw new Error('caduta locale dopo la creazione remota');
      },
    };
    const primo = creaPush({ creaProdotto: creaRemoto, storico: storicoRotto });
    await primo.service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ Il rollback locale è avvenuto: VestiFlow non ha traccia di niente…
    const dopoIlFallimento = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto },
    });
    expect(dopoIlFallimento.shopifyProductId).toBeNull();
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    // ⛔ …ma su Shopify il prodotto ESISTE. Il database non annulla il remoto.
    expect(creati).toHaveLength(1);
    expect(creati[0]!.id).toBe(665001);

    // ── 2 · il nuovo tentativo non sa del primo, e crea di nuovo ────────────
    const secondo = creaPush({ creaProdotto: creaRemoto });
    const esito = await secondo.service.pushProduct(IDS.tenantA, prodotto);
    expect(esito.pushed).toBe(true);

    // ⛔ **DUE prodotti remoti per un solo articolo VestiFlow.** Registrato come
    //    limite operativo in `DA-FARE` §24: non è un difetto di queste prove, ed
    //    è ciò che va risolto prima del rilascio. ⚠️ Nessuna soluzione è
    //    implementata qui: la prova MISURA, non rimedia.
    expect(creati).toHaveLength(2);
    expect(creati.map((c) => c.id)).toEqual([665001, 665002]);

    // ⭐ E localmente tutto è coerente col SECONDO: nessuno stato misto, nessuna
    //    duplicazione locale. Il disallineamento è tutto sul canale.
    const finale = await prisma.product.findUniqueOrThrow({ where: { id: prodotto } });
    expect(finale.shopifyProductId).toBe('665002');
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow();
    expect(identita.shopifyProductGid).toBe('gid://shopify/Product/665002');
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);

    // ⚠️ Il primo prodotto remoto resta su Shopify e VestiFlow non lo conosce:
    //    nessuna identità lo nomina.
    expect(
      await prisma.shopifyProductIdentity.count({
        where: { shopifyProductGid: 'gid://shopify/Product/665001' },
      }),
    ).toBe(0);
  });

  // ── 3 · il passaggio graduale ────────────────────────────────────────────

  it('3d · connessione NON migrata: pubblicazione invariata, nessuno storico', async () => {
    await prisma.shopifyConnection.update({
      where: { tenantId: IDS.tenantA },
      data: { shopId: null },
    });

    const esito = await creaPush().service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ La pubblicazione riesce e le colonne-cache si scrivono come sempre.
    expect(esito.pushed).toBe(true);
    const dopo = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto },
      include: { variants: true },
    });
    expect(dopo.shopifyProductId).toBe('660001');
    expect(dopo.variants.every((v) => v.shopifyVariantId)).toBe(true);
    // ⛔ E nessuna riga di storico: senza negozio identificato non esiste identità.
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    expect(await prisma.shopifyProductLink.count()).toBe(0);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(0);
  });

  // ── 4 · il rollback, e ciò che il rollback NON può fare ──────────────────

  it('3e · errore DOPO scritture locali avvenute: il database torna indietro', async () => {
    // ⭐ **Si fallisce dopo aver ACCERTATO che le scritture locali ci sono.**
    //    Un errore lanciato all'inizio dimostrerebbe solo che una transazione
    //    vuota non lascia tracce — cioè niente.
    let vistoDentro: {
      readonly prodotto: string | null;
      readonly varianti: number;
      readonly identita: number;
      readonly periodi: number;
    } | null = null;

    const storicoSpia = {
      negozioDelTenant: async () => shopId,
      // 26.7 · la guardia della pubblicazione, inoltrata al servizio vero:
      //    qui l articolo non ha ancora storia, quindi risponde «si pubblica».
      puoPubblicareDaZero: (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().puoPubblicareDaZero(tx, dati),
      registraProdotto: async (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().registraProdotto(tx, dati),
      registraVariante: async (tx: unknown, dati: never) => {
        await new ShopifyLinkHistoryService().registraVariante(tx as never, dati);
        // ⚠️ Si legge DENTRO la stessa transazione: da fuori queste righe non
        //    sarebbero ancora visibili, e la verifica non proverebbe niente.
        const client = tx as {
          product: { findUnique: (a: unknown) => Promise<{ shopifyProductId: string | null } | null> };
          productVariant: { count: (a: unknown) => Promise<number> };
          shopifyProductIdentity: { count: () => Promise<number> };
          shopifyProductLink: { count: () => Promise<number> };
        };
        const riga = await client.product.findUnique({
          where: { id: prodotto },
          select: { shopifyProductId: true },
        });
        vistoDentro = {
          prodotto: riga?.shopifyProductId ?? null,
          varianti: await client.productVariant.count({
            where: { productId: prodotto, shopifyVariantId: { not: null } },
          }),
          identita: await client.shopifyProductIdentity.count(),
          periodi: await client.shopifyProductLink.count(),
        };
        throw new Error('caduta a scritture locali avvenute');
      },
    };

    const { service, shopifyAdmin } = creaPush({ storico: storicoSpia });
    await service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ 1 · Le scritture locali C'ERANO davvero, prima della caduta.
    expect(vistoDentro).not.toBeNull();
    expect(vistoDentro!.prodotto).toBe('660001');
    expect(vistoDentro!.varianti).toBe(2);
    expect(vistoDentro!.identita).toBe(1);
    expect(vistoDentro!.periodi).toBe(1);

    // ⭐ 2 · E dopo il rollback non ne resta niente: colonne-cache e storico
    //        tornano insieme allo stato di prima. Sono nella stessa transazione.
    const dopo = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto },
      include: { variants: true },
    });
    expect(dopo.shopifyProductId).toBeNull();
    expect(dopo.variants.every((v) => v.shopifyVariantId === null)).toBe(true);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    expect(await prisma.shopifyProductLink.count()).toBe(0);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(0);

    // ⛔ 3 · **Ma il prodotto su Shopify È STATO CREATO, e il rollback non lo
    //        annulla.** Il database riporta indietro sé stesso, non il canale:
    //        di là resta un prodotto con quel GID, e VestiFlow non ne ha più
    //        traccia. È un disallineamento reale, non un dettaglio della prova.
    expect(shopifyAdmin.createProduct).toHaveBeenCalledTimes(1);

    // ⚠️ Lo stato del prodotto lo dichiara: la pubblicazione non risulta riuscita.
    expect(dopo.shopifySyncStatus).toBe('error');
    expect(dopo.shopifyLastError).toContain('caduta a scritture locali avvenute');
  });

  it('3f · dopo quel fallimento una nuova pubblicazione riesce', async () => {
    // ⭐ Il rollback non lascia il prodotto in uno stato da cui non si esce: si
    //    ripubblica, e questa volta va a buon fine.
    const storicoRotto = {
      negozioDelTenant: async () => shopId,
      // 26.7 · la guardia della pubblicazione, inoltrata al servizio vero:
      //    qui l articolo non ha ancora storia, quindi risponde «si pubblica».
      puoPubblicareDaZero: (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().puoPubblicareDaZero(tx, dati),
      registraProdotto: async () => {
        throw new Error('caduta');
      },
    };
    await creaPush({ storico: storicoRotto }).service.pushProduct(IDS.tenantA, prodotto);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);

    const esito = await creaPush().service.pushProduct(IDS.tenantA, prodotto);

    expect(esito.pushed).toBe(true);
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);
  });

  // ── 5 · isolamento fra tenant ────────────────────────────────────────────

  it('3g · la pubblicazione di un tenant non tocca lo storico dell altro', async () => {
    const negozioB = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/9970002' },
    });
    const prodottoB = await prisma.product.create({
      data: { tenantId: IDS.tenantB, name: 'Di un altro', articleCode: 'PUB-B' },
    });
    await prisma.shopifyProductIdentity.create({
      data: {
        tenantId: IDS.tenantB,
        shopId: negozioB.id,
        // ⭐ Stesso numero di prodotto, negozio diverso: devono convivere.
        shopifyProductGid: 'gid://shopify/Product/660001',
        originalProductId: prodottoB.id,
        productId: prodottoB.id,
      },
    });

    await creaPush().service.pushProduct(IDS.tenantA, prodotto);

    expect(await prisma.shopifyProductIdentity.count()).toBe(2);
    const diA = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    const diB = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantB },
    });
    expect(diA.originalProductId).toBe(prodotto);
    expect(diB.originalProductId).toBe(prodottoB.id);
    expect(diB.localDeletedAt).toBeNull();
  });
});
