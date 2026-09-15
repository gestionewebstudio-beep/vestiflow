import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductEnrichmentService } from '../../shopify/shopify-product-enrichment.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { archivioImmaginiFinto } from './archivio-immagini-finto';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * ⛔ **`products/update` pagava una chiamata REST PER VARIANTE per un costo che non
 *    scrive** (`docs/30` #2, misurato sul codice il 15/09/2026): `importProductFromWebhook`
 * chiedeva `fetchVariantCosts: true`, l'arricchimento faceva `GET /inventory_items/{id}` per
 * ogni variante (≥ 500 ms l'una col limitatore), e l'aggiornamento **non scrive**
 * `purchasePriceMinor` sulle varianti esistenti (`docs/24` §9.11). Il costo serve solo alle
 * varianti che VestiFlow non ha ancora (`tx.productVariant.create`).
 *
 * Qui si dimostra, con l'arricchimento VERO e il negozio simulato che conta le chiamate:
 * 1 · i campi aggiornati sono gli stessi con o senza costi (il risultato non serve);
 * 2 · quante chiamate costa oggi, e quante dopo la restrizione alle sole varianti nuove.
 */
describe('products/update: il costo per variante si chiede solo per le varianti nuove', () => {
  const DOMINIO = 'costi-aggiornamento.myshopify.com';
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;

  beforeAll(() => {
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
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
    negozio = new NegozioSimulato(DOMINIO, 994000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/994001' },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId: riga.id,
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

  /** L'arricchimento VERO: tassonomia e metafield di categoria finti, REST dal negozio simulato. */
  function arricchimento(): ShopifyProductEnrichmentService {
    return new ShopifyProductEnrichmentService(
      negozio.admin() as never,
      {} as never,
      { parseFromProductMetafields: vi.fn().mockResolvedValue([]) } as never,
      { localizeCategory: vi.fn().mockResolvedValue(null) } as never,
    );
  }

  function creaImport(): ShopifyProductPullService {
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
      arricchimento(),
      storico,
      registro,
      archivioImmaginiFinto() as never,
    );
  }

  const TAGLIE = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL'] as const;

  function seminaOttoVarianti(): number {
    return negozio.semina({
      title: 'Giacca otto taglie',
      vendor: 'Marca',
      product_type: 'Giacche',
      tags: 'collaudo',
      opzioni: [{ name: 'Taglia', values: [...TAGLIE] }],
      varianti: TAGLIE.map((taglia, i) => ({
        sku: `GIACCA-${taglia}`,
        barcode: `800000000${i}00`,
        price: '99.00',
        cost: `${40 + i}.50`,
        valori: [taglia],
      })),
    }).id;
  }

  async function localeConVarianti(remotoId: number) {
    return prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(remotoId) },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
  }

  /** La fotografia dei campi che un aggiornamento può toccare, per confrontare due esecuzioni. */
  function fotografia(prodotto: Awaited<ReturnType<typeof localeConVarianti>>) {
    return {
      shopifyTitle: prodotto.shopifyTitle,
      brand: prodotto.brand,
      shopifyProductType: prodotto.shopifyProductType,
      tags: prodotto.tags,
      purchasePriceMinor: String(prodotto.purchasePriceMinor),
      varianti: prodotto.variants.map((v) => ({
        sku: v.sku,
        shopifyPriceMinor: String(v.shopifyPriceMinor),
        purchasePriceMinor: String(v.purchasePriceMinor),
        barcode: v.barcode,
      })),
    };
  }

  it('prima importazione: il costo di ogni variante si acquisisce, e costa una chiamata per variante', async () => {
    const remotoId = seminaOttoVarianti();
    negozio.azzeraChiamate();

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remotoId) as never,
    );

    expect(esito).toBe('imported');
    expect(negozio.chiamate.get('getInventoryItem')).toBe(8);
    const locale = await localeConVarianti(remotoId);
    expect(locale.variants).toHaveLength(8);
    for (const [i, taglia] of TAGLIE.entries()) {
      const variante = locale.variants.find((v) => v.sku === `GIACCA-${taglia}`);
      expect(String(variante?.purchasePriceMinor), taglia).toBe(`${(40 + i) * 100 + 50}`);
    }
  });

  it('aggiornamento senza varianti nuove: i campi scritti sono identici con o senza costi, e non parte NESSUNA chiamata per i costi', async () => {
    const remotoId = seminaOttoVarianti();
    await creaImport().importProductFromWebhook(IDS.tenantA, negozio.webhook(remotoId) as never);
    // VestiFlow ha nel frattempo deciso i costi (arrivo merce): sono suoi (§9.11).
    await prisma.productVariant.updateMany({
      where: { tenantId: IDS.tenantA, product: { shopifyProductId: String(remotoId) } },
      data: { purchasePriceMinor: 12345 },
    });

    // Modifica dal pannello Shopify: titolo e prezzo di una variante; i costi remoti cambiano
    // pure — e NON devono arrivare.
    const prodotto = negozio.modifica(remotoId, { title: 'Giacca otto taglie · nuova stagione' });
    negozio.modifica(remotoId, { variante: { id: prodotto.variants[2]!.id, price: '89.00' } });
    for (const v of prodotto.variants) {
      v.cost = '1.00';
    }
    negozio.azzeraChiamate();

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remotoId) as never,
    );
    expect(esito).toBe('updated');
    const dopo = fotografia(await localeConVarianti(remotoId));

    // I campi aggiornati: titolo e prezzo Shopify sì; il costo resta quello di VestiFlow.
    expect(dopo.shopifyTitle).toBe('Giacca otto taglie · nuova stagione');
    expect(dopo.varianti.find((v) => v.sku === 'GIACCA-M')?.shopifyPriceMinor).toBe('8900');
    expect(dopo.varianti.every((v) => v.purchasePriceMinor === '12345')).toBe(true);
    // ⛔ Su `develop` qui erano 8: una per variante, per un valore che non si scrive.
    expect(negozio.chiamate.get('getInventoryItem') ?? 0).toBe(0);
    // Il resto dell'arricchimento (collezioni, metafield) resta com'era.
    expect(negozio.chiamate.get('listProductCollects')).toBe(1);
    expect(negozio.chiamate.get('listProductMetafields')).toBe(1);
  });

  it('aggiornamento con UNA variante nuova su Shopify: una sola chiamata, e il costo arriva solo a lei', async () => {
    const remotoId = seminaOttoVarianti();
    await creaImport().importProductFromWebhook(IDS.tenantA, negozio.webhook(remotoId) as never);
    await prisma.productVariant.updateMany({
      where: { tenantId: IDS.tenantA, product: { shopifyProductId: String(remotoId) } },
      data: { purchasePriceMinor: 12345 },
    });

    negozio.modifica(remotoId, {
      nuovaVariante: {
        sku: 'GIACCA-5XL',
        barcode: '800000000900',
        price: '109.00',
        cost: '77.25',
        valori: ['5XL'],
      },
    });
    negozio.azzeraChiamate();

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remotoId) as never,
    );
    expect(esito).toBe('updated');
    const dopo = fotografia(await localeConVarianti(remotoId));

    expect(dopo.varianti).toHaveLength(9);
    expect(dopo.varianti.find((v) => v.sku === 'GIACCA-5XL')?.purchasePriceMinor).toBe('7725');
    expect(
      dopo.varianti
        .filter((v) => v.sku !== 'GIACCA-5XL')
        .every((v) => v.purchasePriceMinor === '12345'),
    ).toBe(true);
    // ⛔ Su `develop` qui erano 9: otto a vuoto più quella che serve.
    expect(negozio.chiamate.get('getInventoryItem')).toBe(1);
  });
});
