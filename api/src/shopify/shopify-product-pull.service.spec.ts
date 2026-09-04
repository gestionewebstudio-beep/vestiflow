import { describe, expect, it, vi } from 'vitest';

import { ShopifyProductPullService } from './shopify-product-pull.service';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import type { ShopifyConfigService } from './shopify-config.service';
import type { ShopifyConnectionService } from './shopify-connection.service';
import type { ShopifyOAuthService } from './shopify-oauth.service';
import type { ShopifyProductEnrichmentService } from './shopify-product-enrichment.service';

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
  const tx = {
    product: {
      create: vi.fn().mockResolvedValue({ id: 'prod-1' }),
      update: vi.fn().mockResolvedValue({ id: 'prod-1' }),
    },
    productVariant: { create: vi.fn(), update: vi.fn() },
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
      findFirst: vi.fn().mockResolvedValue(existing),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    productVariant: { findMany: vi.fn().mockResolvedValue([]) },
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

  it('⭐ prodotto NATO in VestiFlow: arriva solo il Nome Shopify, il resto del catalogo no', async () => {
    // Il catalogo resta di VestiFlow, ma la vetrina è di Shopify: il titolo è
    // bidirezionale per contratto (docs/24 §1.9), tutto il resto no.
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

    const esito = await service.importProductFromWebhook('tenant-1', PAYLOAD);

    expect(esito).toBe('skipped');
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', tenantId: 'tenant-1' },
      data: { shopifyTitle: 'Maglia in cotone blu — collezione estate 2026' },
    });
    // ⛔ Il resto del catalogo non si sblocca: nessun import, nessun `name`.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it('e se il titolo remoto è già quello salvato, non si scrive affatto', async () => {
    const { service, prisma } = creaService({
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      shopifyTitle: 'Maglia in cotone blu — collezione estate 2026',
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

    await service.importProductFromWebhook('tenant-1', PAYLOAD);

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

    it('⛔ PULL MASSIVO: l\'arricchimento non viene chiamato, e nessun errore viene registrato', async () => {
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
