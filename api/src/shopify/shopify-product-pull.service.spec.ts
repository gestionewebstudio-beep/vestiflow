import { describe, expect, it, vi } from 'vitest';

import { ShopifyProductPullService } from './shopify-product-pull.service';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyConfigService } from './shopify-config.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import type { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';
import { archivioImmaginiFinto } from '../test/integration/archivio-immagini-finto';

/**
 * ⭐ **«Nome Shopify» — il lato che ARRIVA da Shopify** (docs/24 §1.9).
 *
 * ⛔ Fino al 03/09/2026 il titolo remoto finiva in `Product.name`, e ci finiva a
 *    OGNI giro: chi accorciava il nome per il magazzino se lo vedeva tornare
 *    lungo al primo webhook. Ora il titolo remoto è il **nome Shopify**, e il
 *    nome interno appartiene a chi lavora in VestiFlow.
 *
 * ⚠️ Il ramo che conta è l'AGGIORNAMENTO: alla creazione i due nomi nascono
 *    uguali, quindi lì l'errore non si vedrebbe.
 */
function creaService(existing: Record<string, unknown> | null) {
  // ⭐ Dal 09/09/2026 (`DA-FARE` §25) l'import è UNA transazione che prende il
  //    lock e POI legge: `existing`, gli SKU riservati e la scrittura del solo
  //    Nome Shopify stanno su `tx`. Sul client esterno restano la guardia dello
  //    spento (`syncSpentaPerRemoto`) e `recordProductImportError` — per questo
  //    `findFirst` è condiviso e `updateMany` è uno per client: così si vede
  //    CHI ha scritto.
  const findFirst = vi.fn().mockResolvedValue(existing);
  const tx = {
    product: {
      findFirst,
      create: vi.fn().mockResolvedValue({ id: 'prod-1' }),
      update: vi.fn().mockResolvedValue({ id: 'prod-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    productVariant: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
    productImage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ next: 1 }]),
    $executeRaw: vi.fn(),
  };

  const prisma = {
    product: {
      findFirst,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    // Le varianti locali si leggono PRIMA dell'arricchimento (fuori dal lock) per
    // decidere di quali varianti chiedere il costo: qui nessuna → tutte nuove.
    productVariant: { findMany: vi.fn().mockResolvedValue([]) },
    // L'immagine principale si sincronizza FUORI dalla transazione, sul
    // client esterno: senza questa lettura il giro non trova le locali.
    productImage: { findMany: vi.fn().mockResolvedValue([]) },
    shopifyConnection: {
      findUnique: vi.fn().mockResolvedValue({ status: 'connected', scopes: ['read_products'] }),
    },
    shopifyCredential: { findUnique: vi.fn().mockResolvedValue({ scopes: ['read_products'] }) },
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };

  // L'arricchimento è predisposto a FALLIRE: se qualcuno lo chiama, si vede.
  const enrichProduct = vi.fn().mockRejectedValue(new Error('Shopify non risponde'));

  const service = new ShopifyProductPullService(
    prisma as unknown as PrismaService,
    {
      getAccessToken: vi
        .fn()
        .mockResolvedValue({ shopDomain: 'shop.myshopify.com', accessToken: 'shpat_test' }),
    } as unknown as ShopifyOAuthService,
    { requestedScopes: ['read_products'] } as unknown as ShopifyConfigService,
    {
      listAllProducts: vi.fn().mockResolvedValue([PAYLOAD]),
    } as unknown as ShopifyAdminClient,
    {
      healStaleErrorStatus: vi.fn(),
      touchSync: vi.fn(),
      recordApiFailure: vi.fn(),
    } as unknown as ShopifyConnectionService,
    { enrichProduct } as unknown as ShopifyProductEnrichmentService,
    // ⭐ B2 · lo storico dei collegamenti. Qui il tenant NON ha un negozio
    //    identificato — è la connessione preesistente non ancora migrata — e
    //    l'import deve comportarsi esattamente come prima: nessuna scrittura.
    //    Le regole dello storico si provano sul database, non qui.
    { negozioDelTenant: vi.fn().mockResolvedValue(null) } as never,
    // §10.3 · il registro: senza negozio non si arriva mai a un rifiuto, quindi
    //    qui non deve essere chiamato. Le righe vere si provano sul database.
    { registraRifiuto: vi.fn() } as never,
    archivioImmaginiFinto() as never,
  );

  return { service, prisma, tx, enrichProduct };
}

const PAYLOAD = {
  id: 111,
  title: 'Maglia in cotone blu — collezione estate 2026',
  body_html: '<p>Descrizione</p>',
  status: 'active',
  variants: [{ id: 501, price: '29.90', inventory_item_id: 900, sku: 'SKU-1' }],
  images: [],
  options: [],
};

describe('ShopifyProductPullService — il titolo remoto è il «Nome Shopify»', () => {
  it('⛔ ri-sync: il nome INTERNO non si tocca, si aggiorna solo il nome Shopify', async () => {
    // Il prodotto in VestiFlow ha già un nome corto, scelto da chi sta in magazzino.
    const { service, tx } = creaService({
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      catalogOrigin: 'shopify',
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      variants: [],
    });

    const esito = await service.importProductFromWebhook('tenant-1', PAYLOAD);

    expect(esito).toBe('updated');
    const [[chiamata]] = tx.product.update.mock.calls as [[{ data: Record<string, unknown> }]];
    // Questo è il difetto che la separazione chiude: il nome corto resta corto.
    expect(chiamata.data).not.toHaveProperty('name');
    expect(chiamata.data['shopifyTitle']).toBe('Maglia in cotone blu — collezione estate 2026');
  });

  it('⛔ a sincronizzazione SPENTA il prodotto si ignora INTEGRALMENTE: nessuna scrittura', async () => {
    // Spegnere l'interruttore significa «questo prodotto non si tocca da Shopify».
    // Prima passava tutto tranne lo stato: nome, descrizione, opzioni, varianti,
    // immagini. Una guardia che ne lascia passare metà è peggio di nessuna.
    const { service, prisma, tx } = creaService({
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      shopifyTitle: 'Titolo vecchio',
      catalogOrigin: 'shopify',
      shopifySyncEnabled: false,
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      images: [],
      variants: [],
    });

    const esito = await service.importProductFromWebhook('tenant-1', {
      ...PAYLOAD,
      status: 'archived',
    });

    expect(esito).toBe('skipped');
    // Nessuna scrittura, di nessun genere: né il titolo, né la transazione.
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.product.create).not.toHaveBeenCalled();
    expect(tx.productVariant.update).not.toHaveBeenCalled();
    expect(tx.productVariant.create).not.toHaveBeenCalled();
  });

  it('⛔ e nemmeno un payload SENZA TITOLO la fa scrivere: la guardia viene prima di tutto', async () => {
    // `normalizeWebhookProduct` non valida il payload: `remote.title` può essere
    // `undefined`. Se il titolo si leggesse prima della guardia, il `.trim()`
    // lancerebbe e il catch scriverebbe `shopifySyncStatus: error` — sul prodotto
    // che la guardia esiste per proteggere.
    const { service, prisma } = creaService({
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      shopifyTitle: 'Titolo vecchio',
      catalogOrigin: 'shopify',
      shopifySyncEnabled: false,
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      images: [],
      variants: [],
    });

    const senzaTitolo: Record<string, unknown> = { ...PAYLOAD };
    delete senzaTitolo['title'];

    await expect(service.importProductFromWebhook('tenant-1', senzaTitolo)).resolves.toBe(
      'skipped',
    );
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it('⭐ prodotto NATO in VestiFlow: si aggiorna come gli altri, categoria e costo esclusi', async () => {
    // ⛔ **Qui la prova diceva il contrario**: «arriva solo il Nome Shopify, il
    //    resto del catalogo no». Era la guardia d’ORIGINE, e §9.12 la smentisce
    //    — «le regole per campo NON guardano dove è nato l’articolo». A
    //    decidere è il campo: descrizione e tipo prodotto Shopify entrano,
    //    categoria interna e costo no.
    const { service, prisma, tx } = creaService({
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      shopifyTitle: 'Titolo vecchio',
      catalogOrigin: 'vestiflow',
      shopifyCatalogLinkKind: 'pushed',
      shopifyProductId: '111',
      shopifySyncEnabled: true,
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      images: [],
      variants: [],
    });

    const esito = await service.importProductFromWebhook('tenant-1', {
      ...PAYLOAD,
      product_type: 'Maglieria',
    });

    expect(esito).toBe('updated');
    const [[chiamata]] = tx.product.update.mock.calls as [[{ data: Record<string, unknown> }]];
    // ⭐ I bidirezionali tornano indietro anche su un articolo nato qui.
    expect(chiamata.data['shopifyTitle']).toBe('Maglia in cotone blu — collezione estate 2026');
    expect(chiamata.data['shopifyProductType']).toBe('Maglieria');
    // ⛔ E ciò che resta di VestiFlow resta fermo, per campo e non per origine.
    expect(chiamata.data).not.toHaveProperty('name');
    expect(chiamata.data).not.toHaveProperty('category');
    expect(chiamata.data).not.toHaveProperty('purchasePriceMinor');
    // …e nessun errore registrato sul client esterno.
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  it('a sincronizzazione ACCESA un prodotto IMPORTATO si aggiorna come sempre, stato compreso', async () => {
    const { service, tx } = creaService({
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      catalogOrigin: 'shopify',
      shopifySyncEnabled: true,
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      variants: [],
    });

    await service.importProductFromWebhook('tenant-1', { ...PAYLOAD, status: 'archived' });

    const [[chiamata]] = tx.product.update.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(chiamata.data['status']).toBe('archived');
  });

  // ⛔ I due PUNTI D'INGRESSO arricchiscono PRIMA di chiamare `importProduct`:
  //    la guardia che sta lì dentro non li protegge. Nel pull massivo il
  //    fallimento dell'arricchimento finisce nel catch, che scrive l'errore
  //    addosso al prodotto spento.
  describe("i punti d'ingresso riconoscono lo spento prima di interrogare Shopify", () => {
    const spento = {
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      shopifyTitle: 'Titolo vecchio',
      catalogOrigin: 'shopify',
      shopifySyncEnabled: false,
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      images: [],
      variants: [],
    };

    it("⛔ PULL MASSIVO: l'arricchimento non viene chiamato, e nessun errore viene registrato", async () => {
      const { service, prisma, enrichProduct, tx } = creaService(spento);

      const esito = await service.pullCatalog('tenant-1');

      expect(enrichProduct).not.toHaveBeenCalled();
      expect(esito.skipped).toBe(1);
      expect(esito.failed).toEqual([]);
      // `recordProductImportError` passa di qui: se fosse stato chiamato si vedrebbe.
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('⛔ WEBHOOK: stessa cosa — nemmeno una chiamata a Shopify per un prodotto spento', async () => {
      const { service, prisma, enrichProduct, tx } = creaService(spento);

      const esito = await service.importProductFromWebhook('tenant-1', PAYLOAD);

      expect(enrichProduct).not.toHaveBeenCalled();
      expect(esito).toBe('skipped');
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('⭐ e con la sincronizzazione ACCESA il pull massivo arricchisce come sempre', async () => {
      const { service, enrichProduct } = creaService({ ...spento, shopifySyncEnabled: true });

      await service.pullCatalog('tenant-1');

      expect(enrichProduct).toHaveBeenCalledOnce();
    });
  });

  it('primo import: i due nomi nascono UGUALI, e da lì vivono separati', async () => {
    const { service, tx } = creaService(null);

    const esito = await service.importProductFromWebhook('tenant-1', PAYLOAD);

    expect(esito).toBe('imported');
    const [[chiamata]] = tx.product.create.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(chiamata.data['name']).toBe('Maglia in cotone blu — collezione estate 2026');
    expect(chiamata.data['shopifyTitle']).toBe('Maglia in cotone blu — collezione estate 2026');
  });
});

/**
 * ⛔ UN DATO NON RICEVUTO NON È UN DATO CANCELLATO.
 *
 * L'arricchimento — SEO, collezioni, metafield, costi, tassonomia — è una
 * chiamata a parte, e **può cadere**: il codice lo registra e prosegue con
 * l'import, che è la scelta giusta. Ma se l'esito assente viene scritto come
 * `null`, come elenco vuoto o come zero, un guasto di rete **cancella dati che
 * nessuno ha cancellato**.
 *
 * ⭐ **La distinzione che regge tutto**: `enrichment` assente significa «non
 *    lo so», e allora si conserva; `enrichment` presente con `null` o `[]`
 *    significa «Shopify dice che non c'è», e allora si applica.
 *
 * ⚠️ Nel codice la differenza era già stata vista per tassonomia, stagione e
 *    metafield — che ripiegano su `existing` — e non per SEO, collezioni e
 *    costo. Tre campi protetti e tre no, nello stesso oggetto.
 */
describe('⛔ un arricchimento CADUTO non cancella quello che c era', () => {
  const ESISTENTE = {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'Maglia',
    shopifyTitle: 'Maglia in cotone blu — collezione estate 2026',
    catalogOrigin: 'shopify',
    variants: [],
    images: [],
    shopifyLastError: null,
    seoTitle: 'Maglia estate — spedizione gratis',
    seoDescription: 'La maglia in cotone della collezione estate.',
    shopifyCollections: [{ id: 'gid://shopify/Collection/1', title: 'Estate 2026' }],
    shopifyMetafields: [],
    shopifyCategoryMetafields: [],
    purchasePriceMinor: 1200,
    season: 'Estate 2026',
    shopifyTaxonomyCategoryId: 'gid://shopify/TaxonomyCategory/aa-1',
    shopifyTaxonomyCategoryFullName: 'Abbigliamento',
  };

  /** I campi scritti sul prodotto dall'aggiornamento. */
  function scrittiSulProdotto(tx: { product: { update: ReturnType<typeof vi.fn> } }) {
    const chiamata = tx.product.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    return chiamata.data;
  }

  it('⛔ la SEO NON si azzera', async () => {
    const { service, tx } = creaService(ESISTENTE);

    await service.importProductFromWebhook('tenant-1', PAYLOAD);

    const dati = scrittiSulProdotto(tx);
    expect(dati['seoTitle']).toBe('Maglia estate — spedizione gratis');
    expect(dati['seoDescription']).toBe('La maglia in cotone della collezione estate.');
  });

  it('⛔ le COLLEZIONI non si svuotano', async () => {
    const { service, tx } = creaService(ESISTENTE);

    await service.importProductFromWebhook('tenant-1', PAYLOAD);

    expect(scrittiSulProdotto(tx)['shopifyCollections']).toEqual([
      { id: 'gid://shopify/Collection/1', title: 'Estate 2026' },
    ]);
  });

  it('⛔ il COSTO non va a zero — e ora non si scrive affatto', async () => {
    // ⚠️ Un articolo comprato a 12,00 che risulta a costo zero falsa il
    //    margine di ogni report, e nessuno se ne accorge guardando la scheda.
    //
    // ⭐ **La protezione è salita di un gradino l’11/09/2026.** Qui si
    //    asseriva `toBe(1200)`, cioè il valore locale riscritto sopra sé
    //    stesso: bastava a escludere lo zero, non a escludere che Shopify
    //    comandasse il costo. Ora il campo esce dall’allowlist (§9.11) e la
    //    colonna non viene toccata: qualunque sia il valore, sopravvive.
    const { service, tx } = creaService(ESISTENTE);

    await service.importProductFromWebhook('tenant-1', PAYLOAD);

    expect(scrittiSulProdotto(tx)).not.toHaveProperty('purchasePriceMinor');
  });

  it('⭐ e quelli già protetti restano protetti', async () => {
    // ⭐ La correzione non deve rompere i tre che ripiegavano già su `existing`.
    const { service, tx } = creaService(ESISTENTE);

    await service.importProductFromWebhook('tenant-1', PAYLOAD);

    const dati = scrittiSulProdotto(tx);
    expect(dati['season']).toBe('Estate 2026');
    expect(dati['shopifyTaxonomyCategoryId']).toBe('gid://shopify/TaxonomyCategory/aa-1');
  });

  it('⭐ ma una cancellazione RICEVUTA si applica', async () => {
    // ⭐ **Questa è l'altra metà della regola.** Se Shopify risponde e dice che
    //    la SEO non c'è e le collezioni sono zero, quella è una cancellazione
    //    vera: conservarla per prudenza sarebbe l'errore opposto — VestiFlow
    //    mostrerebbe per sempre un dato che sul canale non esiste più.
    const { service, tx, enrichProduct } = creaService(ESISTENTE);
    enrichProduct.mockResolvedValue({
      tags: [],
      seoTitle: null,
      seoDescription: null,
      season: null,
      collections: [],
      metafields: [],
      variantPurchasePriceMinor: new Map<number, number>(),
      taxonomyCategoryId: null,
      taxonomyCategoryFullName: null,
      categoryMetafields: [],
    });

    await service.importProductFromWebhook('tenant-1', PAYLOAD);

    const dati = scrittiSulProdotto(tx);
    expect(dati['seoTitle']).toBeNull();
    expect(dati['seoDescription']).toBeNull();
    expect(dati['shopifyCollections']).toEqual([]);
  });
});

/**
 * ⛔ **LE REGOLE SONO PER CAMPO, NON PER ORIGINE** — `docs/24` §9.12.
 *
 * Fino all'11/09/2026 decideva `shouldSkipShopifyCatalogImport`: per un
 * articolo nato in VestiFlow l'import scriveva il solo `shopifyTitle` e usciva,
 * quindi **nessun campo bidirezionale tornava indietro**. Per uno importato
 * passava invece tutto, categoria interna e costo compresi.
 *
 * ⭐ Due regimi opposti sullo stesso articolo, decisi dalla provenienza. Ora la
 *    domanda è una sola e vale per tutti: **di chi è questo campo?**
 *
 * ⚠️ Le prove qui sotto sono in COPPIA apposta — lo stesso payload, la stessa
 *    asserzione, su un articolo nato qui e su uno arrivato da Shopify. Una
 *    regola «uguale per tutti» dimostrata su un caso solo non è dimostrata.
 */
describe('⛔ regole per campo: stessa gestione per i due tipi di articolo', () => {
  const PAYLOAD_TIPATO = {
    ...PAYLOAD,
    body_html: '<p>Descrizione arrivata da Shopify</p>',
    vendor: 'Acme',
    product_type: 'Maglieria',
  };

  /** Lo stesso articolo, cambiata solo la PROVENIENZA. */
  function articolo(origine: 'vestiflow' | 'shopify') {
    return {
      id: 'prod-1',
      tenantId: 'tenant-1',
      name: 'MAGL-COT-BLU',
      shopifyTitle: 'Titolo vecchio',
      catalogOrigin: origine,
      shopifyCatalogLinkKind: origine === 'vestiflow' ? 'pushed' : 'imported',
      shopifyProductId: '111',
      shopifySyncEnabled: true,
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      shopifyCategoryMetafields: [],
      // Il dato che la separazione deve proteggere, su ENTRAMBI.
      category: 'Abbigliamento donna',
      subcategory: 'Maglie',
      purchasePriceMinor: 1200,
      images: [],
      variants: [],
    };
  }

  async function aggiorna(origine: 'vestiflow' | 'shopify') {
    const { service, tx } = creaService(articolo(origine));
    const esito = await service.importProductFromWebhook('tenant-1', PAYLOAD_TIPATO);
    const [[chiamata]] = tx.product.update.mock.calls as [[{ data: Record<string, unknown> }]];
    return { esito, dati: chiamata.data };
  }

  for (const origine of ['vestiflow', 'shopify'] as const) {
    const chi = origine === 'vestiflow' ? 'NATO in VestiFlow' : 'IMPORTATO da Shopify';

    it(chi + ' · i bidirezionali arrivano', async () => {
      const { esito, dati } = await aggiorna(origine);

      expect(esito).toBe('updated');
      expect(dati['shopifyTitle']).toBe('Maglia in cotone blu — collezione estate 2026');
      expect(dati['description']).toBe('Descrizione arrivata da Shopify');
      expect(dati['brand']).toBe('Acme');
    });

    it(chi + ' · il tipo prodotto Shopify va nel campo SUO', async () => {
      const { dati } = await aggiorna(origine);

      expect(dati['shopifyProductType']).toBe('Maglieria');
      // ⛔ È il cuore della separazione: il tipo prodotto non rientra più dentro
      //    la categoria interna, in nessuna delle due direzioni (§9.5).
      expect(dati).not.toHaveProperty('category');
    });

    it(chi + ' · il COSTO non si scrive', async () => {
      const { dati } = await aggiorna(origine);

      // Lo comanda VestiFlow (§9.11): il campo esce dall'allowlist, quindi la
      // colonna non viene toccata — né azzerata, né riscritta uguale.
      expect(dati).not.toHaveProperty('purchasePriceMinor');
    });

    it(chi + ' · il NOME INTERNO resta di chi sta in magazzino', async () => {
      const { dati } = await aggiorna(origine);

      expect(dati).not.toHaveProperty('name');
    });
  }

  it('⭐ e i due articoli ricevono ESATTAMENTE gli stessi campi', async () => {
    // ⭐ La prova che chiude il difetto: non «entrambi funzionano», ma «l'origine
    //    non compare più nella decisione». Se un campo tornasse a dipendere
    //    dalla provenienza, le due chiavi divergerebbero qui.
    const natoQui = await aggiorna('vestiflow');
    const importato = await aggiorna('shopify');

    expect(Object.keys(natoQui.dati).sort()).toEqual(Object.keys(importato.dati).sort());
  });

  it('⛔ tipo prodotto TOLTO su Shopify: la cancellazione ricevuta si applica', async () => {
    // ⭐ È l'altra metà della regola dell'arricchimento caduto: qui il payload
    //    C'È e dice che il tipo prodotto non c'è. Quella è una cancellazione
    //    vera, e va applicata — conservarla mostrerebbe per sempre un valore
    //    che sul canale non esiste più.
    const { service, tx } = creaService(articolo('shopify'));

    await service.importProductFromWebhook('tenant-1', { ...PAYLOAD_TIPATO, product_type: '  ' });

    const [[chiamata]] = tx.product.update.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(chiamata.data['shopifyProductType']).toBeNull();
    expect(chiamata.data).not.toHaveProperty('category');
  });

  it('⛔ PRIMA importazione: il tipo prodotto entra, la categoria interna resta vuota', async () => {
    // ⚠️ Anche alla creazione: un articolo importato non nasce con la categoria
    //    di magazzino già decisa da Shopify. La sceglie l'operatore.
    const { service, tx } = creaService(null);

    await service.importProductFromWebhook('tenant-1', PAYLOAD_TIPATO);

    const [[chiamata]] = tx.product.create.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(chiamata.data['shopifyProductType']).toBe('Maglieria');
    expect(chiamata.data).not.toHaveProperty('category');
  });
});

/**
 * ⛔ **IL COSTO DELLE VARIANTI: acquisire non è sovrascrivere.**
 *
 * §9.11 dice «lo comanda VestiFlow» per gli AGGIORNAMENTI, e §9.12 tiene
 * separata la partenza. Le due cose si incontrano proprio qui: nello stesso
 * ciclo convivono una variante già in VestiFlow — che ha un costo da proteggere
 * — e una comparsa ora su Shopify, che non ne ha nessuno.
 */
describe('⛔ costo delle varianti: chi ce l ha lo tiene, chi nasce lo acquisisce', () => {
  const DUE_VARIANTI = {
    ...PAYLOAD,
    product_type: 'Maglieria',
    variants: [
      { id: 501, price: '29.90', inventory_item_id: 900, sku: 'SKU-1' },
      { id: 502, price: '34.90', inventory_item_id: 901, sku: 'SKU-2' },
    ],
  };

  const ESISTENTE = {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'MAGL-COT-BLU',
    shopifyTitle: 'Titolo vecchio',
    catalogOrigin: 'shopify',
    shopifyProductId: '111',
    shopifySyncEnabled: true,
    shopifyLastError: null,
    shopifyTaxonomyCategoryId: null,
    shopifyTaxonomyCategoryFullName: null,
    season: null,
    shopifyMetafields: [],
    shopifyCategoryMetafields: [],
    category: 'Abbigliamento donna',
    purchasePriceMinor: 1200,
    images: [],
    // La 501 è già collegata; la 502 comparirà adesso.
    variants: [{ id: 'var-1', shopifyVariantId: '501', sku: 'SKU-1', purchasePriceMinor: 1200 }],
  };

  /** Shopify risponde, e porta un costo DIVERSO da quello di VestiFlow. */
  function conCostiRemoti(enrichProduct: { mockResolvedValue: (v: unknown) => void }) {
    enrichProduct.mockResolvedValue({
      tags: [],
      seoTitle: null,
      seoDescription: null,
      season: null,
      collections: [],
      metafields: [],
      variantPurchasePriceMinor: new Map<number, number>([
        [501, 9900],
        [502, 8800],
      ]),
      taxonomyCategoryId: null,
      taxonomyCategoryFullName: null,
      categoryMetafields: [],
    });
  }

  it('⛔ variante GIÀ COLLEGATA: il costo remoto non la tocca', async () => {
    // ⚠️ Questo è il caso che prima passava: l'arricchimento c'era, e il costo
    //    Shopify VINCEVA su quello locale. Non era un azzeramento — era una
    //    direzione sbagliata, e per questo il ripiego aggiunto il 10/09 non
    //    bastava.
    const { service, tx, enrichProduct } = creaService(ESISTENTE);
    conCostiRemoti(enrichProduct);

    await service.importProductFromWebhook('tenant-1', DUE_VARIANTI);

    const [[aggiornata]] = tx.productVariant.update.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(aggiornata.data).not.toHaveProperty('purchasePriceMinor');
    // …e il resto della variante si allinea come sempre.
    expect(aggiornata.data['shopifyPriceMinor']).toBe(2990);
  });

  it('⭐ variante NUOVA: il costo si acquisisce, perché non c e niente da proteggere', async () => {
    const { service, tx, enrichProduct } = creaService(ESISTENTE);
    conCostiRemoti(enrichProduct);

    await service.importProductFromWebhook('tenant-1', DUE_VARIANTI);

    const [[creata]] = tx.productVariant.create.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(creata.data['shopifyVariantId']).toBe('502');
    expect(creata.data['purchasePriceMinor']).toBe(8800);
  });

  it('⛔ e senza arricchimento la variante nuova non nasce a un costo inventato', async () => {
    // L'arricchimento cade: la variante nuova non ha costo, e zero è l'unico
    // valore onesto — non c'è nessun dato precedente da conservare.
    const { service, tx } = creaService(ESISTENTE);

    await service.importProductFromWebhook('tenant-1', DUE_VARIANTI);

    const [[creata]] = tx.productVariant.create.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(creata.data['purchasePriceMinor']).toBe(0);
    // …e quella già collegata resta comunque fuori.
    const [[aggiornata]] = tx.productVariant.update.mock.calls as [
      [{ data: Record<string, unknown> }],
    ];
    expect(aggiornata.data).not.toHaveProperty('purchasePriceMinor');
  });
});

/**
 * ⛔ **UN WEBHOOK CHE NON CAMBIA NIENTE NON DEVE SCRIVERE NIENTE.**
 *
 * L'effetto non era innocuo, ed è misurato: `@updatedAt` si sposta a ogni
 * scrittura e l'elenco catalogo è ordinato `updatedAt: desc`
 * (`products.service.ts`). Un articolo che nessuno aveva toccato saltava in cima,
 * spingendo giù quelli modificati davvero.
 *
 * ⛔ **Non è un arbitraggio dei conflitti**, e non lo diventa: non si confrontano
 *    istanti, non si stabilisce chi ha scritto per ultimo, non vince nessuno. Si
 *    risponde a una domanda sola — «c'è qualcosa da scrivere?».
 *
 * ⭐ **Il fixture del secondo giro NON è scritto a mano**: si prende quello che
 *    il primo import ha davvero scritto. Un elenco di campi compilato a mano
 *    proverebbe la mia idea dei campi, non i campi.
 */
describe('⛔ webhook identico: nessuna scrittura', () => {
  const BASE = {
    id: 'prod-1',
    tenantId: 'tenant-1',
    name: 'MAGL-COT-BLU',
    shopifyTitle: 'Titolo vecchio',
    catalogOrigin: 'shopify',
    shopifyCatalogLinkKind: 'imported',
    shopifyProductId: '111',
    shopifySyncEnabled: true,
    shopifyLastError: null,
    shopifyTaxonomyCategoryId: null,
    shopifyTaxonomyCategoryFullName: null,
    season: null,
    shopifyMetafields: [],
    shopifyCategoryMetafields: [],
    category: 'Abbigliamento donna',
    purchasePriceMinor: 1200,
    images: [],
    variants: [],
  };

  const PAYLOAD_PIENO = {
    ...PAYLOAD,
    vendor: 'Acme',
    product_type: 'Maglieria',
    tags: 'estate, donna',
  };

  /** Il primo import, e ciò che ha davvero scritto su prodotto e variante. */
  async function primoGiro(payload: Record<string, unknown> = PAYLOAD_PIENO) {
    const { service, tx } = creaService(BASE);
    await service.importProductFromWebhook('tenant-1', payload);
    const prodotto = (tx.product.update.mock.calls[0]?.[0] as { data: Record<string, unknown> })
      .data;
    const variante = (
      tx.productVariant.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    ).data;
    return { prodotto, variante };
  }

  /** Lo stesso articolo, con addosso i valori del primo giro. */
  function articoloAllineato(prodotto: Record<string, unknown>, variante: Record<string, unknown>) {
    return {
      ...BASE,
      ...prodotto,
      variants: [{ id: 'var-1', ...variante }],
    };
  }

  it('⛔ il SECONDO webhook identico non tocca né prodotto né variante', async () => {
    const { prodotto, variante } = await primoGiro();

    const { service, tx } = creaService(articoloAllineato(prodotto, variante));
    const esito = await service.importProductFromWebhook('tenant-1', PAYLOAD_PIENO);

    expect(esito).toBe('updated');
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.productVariant.update).not.toHaveBeenCalled();
    expect(tx.productVariant.create).not.toHaveBeenCalled();
  });

  // ⚠️ Le prove qui sotto sono l'altra metà, e sono quelle che contano di più:
  //    un confronto troppo indulgente **perderebbe una modifica in silenzio**,
  //    che è molto peggio di una scrittura di troppo. Una per famiglia di tipo.
  const CAMBIAMENTI: readonly {
    readonly nome: string;
    readonly payload: Record<string, unknown>;
  }[] = [
    { nome: 'testo (titolo)', payload: { title: 'Maglia rinominata su Shopify' } },
    { nome: 'testo (tipo prodotto)', payload: { product_type: 'Camiceria' } },
    { nome: 'testo (descrizione)', payload: { body_html: '<p>Altra descrizione</p>' } },
    { nome: 'enumerato (stato)', payload: { status: 'archived' } },
    { nome: 'elenco (tag)', payload: { tags: 'estate, donna, saldi' } },
    {
      nome: 'numero (prezzo Shopify)',
      payload: {
        variants: [{ id: 501, price: '39.90', inventory_item_id: 900, sku: 'SKU-1' }],
      },
    },
  ];

  for (const cambiamento of CAMBIAMENTI) {
    it('⭐ ma un cambiamento di ' + cambiamento.nome + ' si scrive', async () => {
      const { prodotto, variante } = await primoGiro();

      const { service, tx } = creaService(articoloAllineato(prodotto, variante));
      await service.importProductFromWebhook('tenant-1', {
        ...PAYLOAD_PIENO,
        ...cambiamento.payload,
      });

      expect(tx.product.update).toHaveBeenCalledOnce();
    });
  }

  it('⭐ e un cambiamento sulla sola VARIANTE la scrive', async () => {
    const { prodotto, variante } = await primoGiro();

    const { service, tx } = creaService(articoloAllineato(prodotto, variante));
    await service.importProductFromWebhook('tenant-1', {
      ...PAYLOAD_PIENO,
      variants: [{ id: 501, price: '29.90', inventory_item_id: 900, sku: 'SKU-1', barcode: '888' }],
    });

    expect(tx.productVariant.update).toHaveBeenCalledOnce();
  });

  it('⛔ e un errore di metafield da registrare rompe il fermo: si scrive', async () => {
    // ⚠️ `shopifyLastError` e `shopifySyncStatus` sono nel confronto come tutti
    //    gli altri: se cambiano, si scrive. Escluderli avrebbe reso invisibile
    //    un articolo che entra in anomalia senza che niente lo dica.
    const { prodotto, variante } = await primoGiro();

    const { service, tx } = creaService({
      ...articoloAllineato(prodotto, variante),
      shopifyLastError: 'Errore precedente da guarire',
    });
    await service.importProductFromWebhook('tenant-1', PAYLOAD_PIENO);

    expect(tx.product.update).toHaveBeenCalledOnce();
  });
});
