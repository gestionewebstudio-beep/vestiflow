import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * B3 · la PUBBLICAZIONE scrive lo storico — dal servizio reale.
 *
 * ⛔ **Questo file colma una lacuna vera**, rilevata dal proprietario il
 *    09/09/2026: `storico-import-push.integration-spec.ts` porta quel nome ma
 *    le sue nove prove sono **tutte** sull'importazione. B3 era cablato e
 *    provato solo dalle unitarie, che girano su un tenant **senza negozio
 *    identificato** — cioè esercitano il ramo in cui lo storico NON si scrive.
 *
 * ⭐ **Servizio reale, PostgreSQL vero, negozio simulato**: le scritture, i vincoli
 *    e l'idempotenza sono quelli del database; gli identificativi remoti li assegna
 *    il negozio, come sul canale.
 *
 * ⭐ **Dal 15/09/2026 la creazione passa dall'identità VestiFlow** (`docs/30`
 *    §7.2-bis, §7.2-ter.3): `productSet` in sola creazione col metafield `vestiflow.product_id`, varianti con
 *    `vestiflow.variant_id`, e gli id si scrivono per identità. La prova `3h`, che
 *    misurava il doppione remoto dopo un fallimento locale, ora misura il contrario:
 *    il prodotto remoto SOPRAVVISSUTO viene ritrovato e adottato, non ricreato.
 */
describe('Pubblicazione verso Shopify e storico dei collegamenti (B3)', () => {
  const DOMINIO = 'prova.myshopify.com';
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let shopId: string;
  let prodotto: string;
  let varianteM: string;
  let varianteL: string;

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
    negozio = new NegozioSimulato(DOMINIO, 996000);

    const rigaNegozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/9970001' },
    });
    shopId = rigaNegozio.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId,
        // ⚠️ Lo scope serve: senza, il push si ferma prima di scrivere qualsiasi
        //    cosa e la prova sarebbe verde per il motivo sbagliato.
        scopes: ['write_products'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
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
        // ⚠️ Due varianti vogliono un'opzione: senza, Shopify ne ammette una sola
        //    (la variante iniziale), e il vecchio doppio REST non se ne accorgeva.
        options: [{ name: 'T', values: ['M', 'L'] }],
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'PUB-M',
              optionValues: [{ name: 'T', value: 'M' }],
              sellingPriceMinor: 2990,
            },
            {
              tenantId: IDS.tenantA,
              sku: 'PUB-L',
              optionValues: [{ name: 'T', value: 'L' }],
              sellingPriceMinor: 2990,
            },
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
      readonly storico?: unknown;
      readonly graphql?: Record<string, unknown>;
    } = {},
  ) {
    const shopifyGraphql = { ...negozio.graphql(), ...(opzioni.graphql ?? {}) };
    const service = new ShopifyProductPushService(
      prisma as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      { markSynced: vi.fn(), markError: vi.fn(), touchSync: vi.fn() } as never,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as never,
      { buildMetafields: vi.fn().mockResolvedValue([]) } as never,
      shopifyGraphql as never,
      (opzioni.storico ?? new ShopifyLinkHistoryService()) as never,
      new PlatformAuditService(prisma as never, prisma as never),
    );
    return { service, shopifyGraphql };
  }

  /** Il prodotto remoto che porta l'identità dell'articolo, con gli id assegnati dal negozio. */
  function remotoDi(productId: string) {
    const remoto = negozio.prodottoPerIdentita(productId);
    if (!remoto) {
      throw new Error(`nessun prodotto remoto con identità ${productId}`);
    }
    const perIdentita = new Map(remoto.variants.map((v) => [v.identita, v]));
    return { remoto, perIdentita };
  }

  // ── 1 · la scrittura: colonne preesistenti E storico, insieme ────────────

  it('3a · la pubblicazione scrive colonne-cache E storico, prodotto e varianti', async () => {
    const { service } = creaPush();

    const esito = await service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ 1 · L'esito finale della pubblicazione è quello atteso: UNA creazione.
    expect(esito.pushed).toBe(true);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.contaProdottiConIdentita(prodotto)).toBe(1);
    const { remoto, perIdentita } = remotoDi(prodotto);
    // Nessuna variante iniziale: productSet crea esattamente le due dichiarate.
    expect(remoto.variants).toHaveLength(2);

    // ⭐ 2 · Le colonne-cache di sempre: non sono state sostituite dallo storico.
    const dopo = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    expect(dopo.shopifyProductId).toBe(String(remoto.id));
    expect(dopo.catalogOrigin).toBe('vestiflow');
    expect(dopo.shopifyCatalogLinkKind).toBe('pushed');
    const perSku = new Map(dopo.variants.map((v) => [v.sku, v]));
    expect(perSku.get('PUB-M')!.shopifyVariantId).toBe(String(perIdentita.get(varianteM)!.id));
    expect(perSku.get('PUB-M')!.shopifyInventoryItemId).toBe(
      String(perIdentita.get(varianteM)!.inventory_item_id),
    );
    expect(perSku.get('PUB-L')!.shopifyVariantId).toBe(String(perIdentita.get(varianteL)!.id));
    // ⛔ Il claim della creazione è CHIUSO: il prodotto è collegato.
    expect(dopo.shopifyCreateClaimId).toBeNull();

    // ⭐ 3 · E lo storico, sullo stesso prodotto.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.shopifyProductGid).toBe(`gid://shopify/Product/${remoto.id}`);
    expect(identita.originalProductId).toBe(prodotto);
    expect(identita.productId).toBe(prodotto);
    const periodo = await prisma.shopifyProductLink.findFirstOrThrow();
    expect(periodo.status).toBe('active');

    const identitaVarianti = await prisma.shopifyVariantIdentity.findMany();
    expect(identitaVarianti).toHaveLength(2);
    expect(identitaVarianti.map((v) => v.shopifyVariantGid).sort()).toEqual(
      [varianteM, varianteL]
        .map((id) => `gid://shopify/ProductVariant/${perIdentita.get(id)!.id}`)
        .sort(),
    );
    // ⭐ Ogni variante è agganciata alla variante LOCALE giusta, per identità e non per SKU.
    const perGid = new Map(identitaVarianti.map((v) => [v.shopifyVariantGid, v]));
    expect(
      perGid.get(`gid://shopify/ProductVariant/${perIdentita.get(varianteM)!.id}`)!
        .originalVariantId,
    ).toBe(varianteM);
    expect(
      perGid.get(`gid://shopify/ProductVariant/${perIdentita.get(varianteL)!.id}`)!
        .originalVariantId,
    ).toBe(varianteL);

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
    //    ramo GraphQL di aggiornamento: è un percorso DIVERSO dal primo.
    const secondo = creaPush();
    const esito = await secondo.service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ 1 · Entrambe riuscite, e la seconda è passata davvero dall'aggiornamento.
    expect(esito.pushed).toBe(true);
    expect(negozio.chiamate.get('updateProductCatalog')).toBe(1);
    expect(negozio.chiamate.get('bulkUpdateVariants')).toBe(1);
    // ⛔ E NON è stato ricreato su Shopify: una sola creazione, un solo remoto.
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.contaProdottiConIdentita(prodotto)).toBe(1);

    // ⭐ 2 · Lo stato finale del prodotto dichiara la riuscita.
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto } });
    expect(dopo.shopifySyncStatus).toBe('synced');
    expect(dopo.shopifyLastError).toBeNull();
    expect(dopo.shopifyProductId).toBe(String(remotoDi(prodotto).remoto.id));

    // ⭐ 3 · E solo allora conta qualcosa dire che nulla è raddoppiato.
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);
    expect(await prisma.shopifyVariantLink.count()).toBe(2);
  });

  it('3c · colonna-cache persa con STORIA attiva: la guardia dello storico rifiuta, niente creazione né rilettura', async () => {
    // ⚠️ **Questa prova NON è il recupero dopo un fallimento** (quello è `3h`): qui
    //    VestiFlow perde SOLO la colonna-cache `shopifyProductId` mentre lo storico ha
    //    un periodo attivo. È la guardia 26.7 (`puoPubblicareDaZero`: «ha storia») a
    //    fermare il push PRIMA di qualunque chiamata — e lo storico non si duplica
    //    perché non si scrive niente, non perché lo riconosca.
    await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    await prisma.product.update({
      where: { id: prodotto },
      data: { shopifyProductId: null },
    });
    const chiamatePrima = negozio.totaleChiamate();

    const esito = await creaPush().service.pushProduct(IDS.tenantA, prodotto);

    expect(esito.outcome).toBe('rifiutato');
    expect(negozio.totaleChiamate()).toBe(chiamatePrima);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);

    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);
    expect(await prisma.shopifyVariantLink.count()).toBe(2);
  });

  it('3h · dopo un fallimento locale il prodotto remoto RESTA, e il nuovo tentativo lo ADOTTA invece di crearne un secondo', async () => {
    // ⛔ Qui c'era «LIMITE MISURATO»: il secondo tentativo non sapeva del primo e
    //    creava un secondo prodotto remoto (`DA-FARE` §24). Con l'identità nel
    //    payload e la rilettura prima di creare, il limite è chiuso: la prova ora lo
    //    dimostra invece di misurarlo.

    // ── 1 · la creazione remota RIESCE, la scrittura locale cade dopo ───────
    const storicoRotto = {
      negozioDelTenant: async () => shopId,
      puoPubblicareDaZero: (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().puoPubblicareDaZero(tx, dati),
      registraProdotto: async () => {
        throw new Error('caduta locale dopo la creazione remota');
      },
    };
    const primo = await creaPush({ storico: storicoRotto }).service.pushProduct(
      IDS.tenantA,
      prodotto,
    );
    expect(primo.pushed).toBe(false);

    // ⭐ Il rollback locale è avvenuto: VestiFlow non ha traccia di niente…
    const dopoIlFallimento = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto },
    });
    expect(dopoIlFallimento.shopifyProductId).toBeNull();
    expect(dopoIlFallimento.shopifySyncStatus).toBe('error');
    // …e il claim del tentativo FINITO è chiuso: nessuno resta «in corso» per sempre.
    expect(dopoIlFallimento.shopifyCreateClaimId).toBeNull();
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    // ⛔ …ma su Shopify il prodotto ESISTE. Il database non annulla il remoto.
    expect(negozio.contaProdottiConIdentita(prodotto)).toBe(1);
    const { remoto } = remotoDi(prodotto);

    // ── 2 · il nuovo tentativo RILEGGE l'identità prima di creare, e adotta ─
    const secondo = await creaPush().service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ Nessuna seconda creazione: UN prodotto remoto per un articolo VestiFlow.
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.contaProdottiConIdentita(prodotto)).toBe(1);
    // ⭐ E il recupero è SOLO recupero: il push finisce lì, senza spingere dati,
    //    e lo dice a chi ha chiesto la pubblicazione.
    expect(secondo.pushed).toBe(false);
    expect(secondo.outcome).toBe('parziale');
    expect(secondo.outcome === 'parziale' && secondo.detail).toContain(
      'Identità Shopify recuperata',
    );
    expect(negozio.chiamate.get('updateProductCatalog') ?? 0).toBe(0);

    // ⭐ Localmente tutto è coerente col remoto sopravvissuto: id e storico.
    const finale = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto },
      include: { variants: true },
    });
    expect(finale.shopifyProductId).toBe(String(remoto.id));
    expect(finale.shopifySyncStatus).toBe('out_of_sync');
    expect(finale.variants.every((v) => v.shopifyVariantId !== null)).toBe(true);
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow();
    expect(identita.shopifyProductGid).toBe(`gid://shopify/Product/${remoto.id}`);
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);

    // ── 3 · il push successivo è un aggiornamento ordinario, e riesce ───────
    const terzo = await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    expect(terzo.pushed).toBe(true);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: prodotto } })).shopifySyncStatus,
    ).toBe('synced');
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
    expect(dopo.shopifyProductId).toBe(String(remotoDi(prodotto).remoto.id));
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
      negozioDelTenant: async (tx: never, tenantId: string) =>
        new ShopifyLinkHistoryService().negozioDelTenant(tx, tenantId),
      puoPubblicareDaZero: (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().puoPubblicareDaZero(tx, dati),
      registraProdotto: async (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().registraProdotto(tx, dati),
      registraVariante: async (tx: unknown, dati: never) => {
        await new ShopifyLinkHistoryService().registraVariante(tx as never, dati);
        // ⚠️ Si legge DENTRO la stessa transazione: da fuori queste righe non
        //    sarebbero ancora visibili, e la verifica non proverebbe niente.
        const client = tx as {
          product: {
            findUnique: (a: unknown) => Promise<{ shopifyProductId: string | null } | null>;
          };
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

    const { service } = creaPush({ storico: storicoSpia });
    await service.pushProduct(IDS.tenantA, prodotto);

    // ⭐ 1 · Le scritture locali C'ERANO davvero, prima della caduta.
    expect(vistoDentro).not.toBeNull();
    expect(vistoDentro!.prodotto).toBe(String(remotoDi(prodotto).remoto.id));
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
    //        di là resta un prodotto con la nostra identità — che è ciò che il
    //        tentativo successivo rilegge (`3h`).
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.contaProdottiConIdentita(prodotto)).toBe(1);

    // ⚠️ Lo stato del prodotto lo dichiara: la pubblicazione non risulta riuscita.
    expect(dopo.shopifySyncStatus).toBe('error');
    expect(dopo.shopifyLastError).toContain('caduta a scritture locali avvenute');
  });

  it('3f · dopo quel fallimento il remoto si RECUPERA, e la pubblicazione successiva riesce', async () => {
    // ⭐ Il rollback non lascia il prodotto in uno stato da cui non si esce: si
    //    ripubblica, il remoto viene adottato, e il giro dopo va a buon fine.
    const storicoRotto = {
      negozioDelTenant: async () => shopId,
      puoPubblicareDaZero: (tx: never, dati: never) =>
        new ShopifyLinkHistoryService().puoPubblicareDaZero(tx, dati),
      registraProdotto: async () => {
        throw new Error('caduta');
      },
    };
    await creaPush({ storico: storicoRotto }).service.pushProduct(IDS.tenantA, prodotto);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);

    const recupero = await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    expect(recupero.outcome).toBe('parziale');
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);

    const esito = await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    expect(esito.pushed).toBe(true);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
  });

  // ── 5 · isolamento fra tenant ────────────────────────────────────────────

  it('3g · la pubblicazione di un tenant non tocca lo storico dell altro', async () => {
    // A crea sul negozio ma non riesce a salvare niente (risposta persa e rilettura
    // caduta): il remoto esiste, lo storico di A no.
    negozio.perdiProssimaRisposta('createProductSet');
    negozio.guastaProssima('productByIdentity', 1, 1);
    await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    const gidDiA = `gid://shopify/Product/${remotoDi(prodotto).remoto.id}`;

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
        shopifyProductGid: gidDiA,
        originalProductId: prodottoB.id,
        productId: prodottoB.id,
      },
    });

    // Il recupero per identità di A scrive lo storico di A e basta.
    const recupero = await creaPush().service.pushProduct(IDS.tenantA, prodotto);
    expect(recupero.outcome).toBe('parziale');

    expect(await prisma.shopifyProductIdentity.count()).toBe(2);
    const diA = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    const diB = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantB },
    });
    expect(diA.originalProductId).toBe(prodotto);
    expect(diA.shopId).toBe(shopId);
    expect(diB.originalProductId).toBe(prodottoB.id);
    expect(diB.shopId).toBe(negozioB.id);
    expect(diB.localDeletedAt).toBeNull();
  });
});
