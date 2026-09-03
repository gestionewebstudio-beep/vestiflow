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
    product: { findFirst: vi.fn().mockResolvedValue(existing) },
    productVariant: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };

  const service = new ShopifyProductPullService(
    prisma as unknown as PrismaService,
    {
      getAccessToken: vi
        .fn()
        .mockResolvedValue({ shopDomain: 'shop.myshopify.com', accessToken: 'shpat_test' }),
    } as unknown as ShopifyOAuthService,
    {} as unknown as ShopifyConfigService,
    {} as unknown as ShopifyAdminClient,
    {} as unknown as ShopifyConnectionService,
    {
      enrichProduct: vi.fn().mockResolvedValue({
        variantPurchasePriceMinor: new Map<number, number>(),
      }),
    } as unknown as ShopifyProductEnrichmentService,
  );

  return { service, prisma, tx };
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

  it("⛔ a sincronizzazione SPENTA lo stato remoto non si importa: era l'eco della nostra archiviazione", async () => {
    // Spegnere la sync archivia il prodotto su Shopify (docs/24 §1.10). Il webhook
    // riporta quell'ARCHIVED, e importarlo rendeva lo spegnimento irreversibile:
    // il prodotto locale diventava `archived` e il push si rifiutava di lavorarci.
    const { service, tx } = creaService({
      id: 'prod-1',
      name: 'MAGL-COT-BLU',
      catalogOrigin: 'shopify',
      shopifySyncEnabled: false,
      shopifyLastError: null,
      shopifyTaxonomyCategoryId: null,
      shopifyTaxonomyCategoryFullName: null,
      season: null,
      shopifyMetafields: [],
      variants: [],
    });

    await service.importProductFromWebhook('tenant-1', { ...PAYLOAD, status: 'archived' });

    const [[chiamata]] = tx.product.update.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(chiamata.data).not.toHaveProperty('status');
    // Il resto continua ad arrivare: è solo lo stato a essere nostro.
    expect(chiamata.data['shopifyTitle']).toBe('Maglia in cotone blu — collezione estate 2026');
  });

  it('a sincronizzazione ACCESA lo stato remoto si importa come sempre', async () => {
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

  it('primo import: i due nomi nascono UGUALI, e da lì vivono separati', async () => {
    const { service, tx } = creaService(null);

    const esito = await service.importProductFromWebhook('tenant-1', PAYLOAD);

    expect(esito).toBe('imported');
    const [[chiamata]] = tx.product.create.mock.calls as [[{ data: Record<string, unknown> }]];
    expect(chiamata.data['name']).toBe('Maglia in cotone blu — collezione estate 2026');
    expect(chiamata.data['shopifyTitle']).toBe('Maglia in cotone blu — collezione estate 2026');
  });
});
