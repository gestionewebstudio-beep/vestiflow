import { ProductStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { buildImportPreview } from './shopify-csv.mapper';
import { parseCsvText, parseShopifyProductCsv } from './shopify-csv.parse';
import {
  escapeCsvField,
  serializeProductsToShopifyCsv,
  type ProductExportRecord,
} from './shopify-csv.serialize';

describe('escapeCsvField', () => {
  it('quota campi con virgola o newline', () => {
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('serializeProductsToShopifyCsv', () => {
  it('serializza prodotti con varianti e immagini', () => {
    const csv = serializeProductsToShopifyCsv([
      makeRecord({
        name: 'Maglietta Demo',
        description: 'Cotone morbido',
        brand: 'Brand X',
        category: 'Maglieria',
        tags: ['estate'],
        status: ProductStatus.active,
        // Prezzo barrato: dato di articolo (replicato su ogni variante in export).
        compareAtPriceMinor: 3990,
        options: [
          { name: 'Taglia', values: ['S', 'M'] },
          { name: 'Colore', values: ['Rosso'] },
        ],
        variants: [
          {
            sku: 'SKU-S',
            optionValues: [
              { name: 'Taglia', value: 'S' },
              { name: 'Colore', value: 'Rosso' },
            ],
            sellingPriceMinor: 2990,
            barcode: '111',
          },
          {
            sku: 'SKU-M',
            optionValues: [
              { name: 'Taglia', value: 'M' },
              { name: 'Colore', value: 'Rosso' },
            ],
            sellingPriceMinor: 2990,
          },
        ],
        images: [{ url: 'https://example.com/a.jpg', altText: 'Fronte', sortOrder: 0 }],
      }),
    ]);

    // "Codice articolo" apre l'export: colonna SOLO VestiFlow per il
    // round-trip export\u2192import (mai mappata su campi Shopify).
    expect(csv.startsWith('\uFEFFCodice articolo,Handle,Title,Body (HTML)')).toBe(true);
    expect(csv).toContain('00042');
    expect(csv).toContain('maglietta-demo');
    expect(csv).toContain('SKU-S');
    expect(csv).toContain('SKU-M');
    expect(csv).toContain('29.90');
    expect(csv).toContain('https://example.com/a.jpg');
  });

  // §sei decimali, punto di uscita: il prezzo memorizzato puo' portare la coda
  // di uno scorporo IVA. Nel CSV deve uscire a due decimali, mai «101.61.4754».
  it('scrive il prezzo a due decimali anche con la coda decimale', () => {
    const csv = serializeProductsToShopifyCsv([
      makeRecord({
        name: 'Maglietta ivata',
        options: [],
        images: [],
        variants: [{ sku: 'SKU-IVA', optionValues: [], sellingPriceMinor: 10161.4754 }],
      }),
    ]);

    const dataRow = csv.split(/\r?\n/)[1] ?? '';
    expect(dataRow.split(',')).toContain('101.61');
    expect(csv).not.toContain('101.61.4754');
  });

  it('è compatibile con il parser import (round-trip)', () => {
    const csv = serializeProductsToShopifyCsv([
      makeRecord({
        name: 'Pantalone Export',
        brand: 'Marino',
        category: 'Pantaloni',
        tags: ['SS26'],
        status: ProductStatus.draft,
        options: [{ name: 'Taglia', values: ['48', '50'] }],
        variants: [
          {
            sku: 'PNT-48',
            optionValues: [{ name: 'Taglia', value: '48' }],
            sellingPriceMinor: 5990,
          },
          {
            sku: 'PNT-50',
            optionValues: [{ name: 'Taglia', value: '50' }],
            sellingPriceMinor: 5990,
          },
        ],
        images: [],
      }),
    ]);

    const rows = parseShopifyProductCsv(csv.replace(/^\uFEFF/, ''));
    const preview = buildImportPreview(rows, new Set());

    expect(preview.summary.total).toBe(1);
    expect(preview.summary.ready).toBe(1);
    expect(preview.products[0]?.dto.name).toBe('Pantalone Export');
    expect(preview.products[0]?.dto.variants).toHaveLength(2);
  });
});

function makeRecord(input: {
  name: string;
  description?: string;
  brand?: string;
  category?: string;
  shopifyProductType?: string;
  season?: string;
  tags?: string[];
  status?: ProductStatus;
  compareAtPriceMinor?: number;
  options: { name: string; values: string[] }[];
  variants: {
    sku: string;
    optionValues: { name: string; value: string }[];
    sellingPriceMinor: number;
    barcode?: string;
  }[];
  images: { url: string; altText?: string; sortOrder: number }[];
}): ProductExportRecord {
  const productId = '11111111-1111-1111-1111-111111111111';
  const tenantId = '22222222-2222-2222-2222-222222222222';

  return {
    product: {
      id: productId,
      tenantId,
      articleCode: '00042',
      name: input.name,
      description: input.description ?? null,
      brand: input.brand ?? null,
      category: input.category ?? null,
      shopifyProductType: input.shopifyProductType ?? null,
      season: input.season ?? null,
      tags: input.tags ?? [],
      seoTitle: 'SEO title demo',
      seoDescription: 'SEO description demo',
      shopifyCollections: [],
      shopifyMetafields: [],
      status: input.status ?? ProductStatus.draft,
      compareAtPriceMinor: input.compareAtPriceMinor ?? null,
      options: input.options,
      shopifyProductId: null,
      shopifySyncStatus: 'not_connected',
      shopifyLastSyncAt: null,
      shopifyLastError: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      // Il serializzatore legge solo i campi valorizzati sopra: i nuovi campi
      // del modello (taxonomy, TikTok, IVA...) non servono al test.
    } as unknown as ProductExportRecord['product'],
    variants: input.variants.map((variant, index) => ({
      id: `33333333-3333-3333-3333-${String(index).padStart(12, '0')}`,
      tenantId,
      productId,
      sku: variant.sku,
      optionValues: variant.optionValues,
      barcode: variant.barcode ?? null,
      currency: 'EUR',
      sellingPriceMinor: variant.sellingPriceMinor,
      // Prezzo Shopify: valore proprio della variante, precompilato dal prezzo
      // articolo alla creazione (l'export legge questo, §B).
      shopifyPriceMinor: variant.sellingPriceMinor,
      purchasePriceMinor: null,
      shopifyVariantId: null,
      shopifyInventoryItemId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })) as unknown as ProductExportRecord['variants'],
    images: input.images.map((image, index) => ({
      id: `44444444-4444-4444-4444-${String(index).padStart(12, '0')}`,
      tenantId,
      productId,
      url: image.url,
      storagePath: null,
      altText: image.altText ?? null,
      sortOrder: image.sortOrder,
      shopifyImageId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
  };
}

/**
 * ⛔ **LA COLONNA `Type` È DI SHOPIFY, NON LA CATEGORIA DI MAGAZZINO.**
 *
 * Quel CSV è il formato di **esportazione di Shopify**, e quel file si ricarica
 * in Shopify Admin: `Type` è letteralmente `product_type`. Fino all'11/09/2026
 * l'export ci scriveva `product.category` e l'import la rileggeva da lì — la
 * stessa confusione della sincronizzazione, in un secondo posto (`docs/24` §9.5,
 * «non si mescola, in nessuna delle due direzioni»).
 *
 * ⭐ La colonna «Categoria» è nata con questa correzione, per la stessa ragione
 *    per cui esiste «Codice articolo»: senza, il ritorno del file **perderebbe**
 *    la classificazione di magazzino invece di mescolarla. Shopify ignora le
 *    colonne che non conosce.
 */
describe('⛔ CSV Shopify: Type è del canale, Categoria è di VestiFlow', () => {
  const ARTICOLO = {
    name: 'Maglia Separata',
    brand: 'Acme',
    category: 'Abbigliamento donna',
    shopifyProductType: 'Maglieria',
    options: [{ name: 'Taglia', values: ['M'] }],
    variants: [
      {
        sku: 'SEP-M',
        optionValues: [{ name: 'Taglia', value: 'M' }],
        sellingPriceMinor: 2990,
      },
    ],
    images: [],
  };

  /** Le celle della riga dati, incolonnate sotto le rispettive intestazioni. */
  function celle(csv: string): Record<string, string> {
    const righe = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
    const intestazioni = parseCsvText(righe[0] ?? '')[0] ?? [];
    const dati = parseCsvText(righe[1] ?? '')[0] ?? [];
    return Object.fromEntries(intestazioni.map((nome, i) => [nome, dati[i] ?? '']));
  }

  it('⛔ in USCITA la categoria interna non finisce in Type', () => {
    const riga = celle(serializeProductsToShopifyCsv([makeRecord(ARTICOLO)]));

    expect(riga['Type']).toBe('Maglieria');
    expect(riga['Categoria']).toBe('Abbigliamento donna');
    // ⛔ È il difetto che questa prova rende impossibile da rifare: un file
    //    esportato da VestiFlow e ricaricato in Shopify Admin scriveva la
    //    classificazione di magazzino nel tipo prodotto della vetrina.
    expect(riga['Type']).not.toBe('Abbigliamento donna');
  });

  it('⭐ tipo prodotto non ancora acquisito: Type resta vuoto, la Categoria no', () => {
    // ⚠️ Vuoto NON significa «prendi la categoria»: la colonna nasce vuota per
    //    tutti, e un ripiego qui reintrodurrebbe il mescolamento.
    const riga = celle(
      serializeProductsToShopifyCsv([makeRecord({ ...ARTICOLO, shopifyProductType: undefined })]),
    );

    expect(riga['Type']).toBe('');
    expect(riga['Categoria']).toBe('Abbigliamento donna');
  });

  it('⛔ in ENTRATA un export Shopify AUTENTICO non scrive la categoria interna', () => {
    // Un file uscito da Shopify ha `Type` e non ha «Categoria»: il tipo prodotto
    // entra nel campo suo, la classificazione di magazzino resta all'operatore —
    // esattamente come fa il webhook.
    const csvShopify = [
      'Handle,Title,Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Price',
      'maglia,Maglia,Acme,Maglieria,,TRUE,Taglia,M,SKU-M,29.90',
    ].join('\n');

    const preview = buildImportPreview(parseShopifyProductCsv(csvShopify), new Set());

    expect(preview.products[0]?.dto.shopifyProductType).toBe('Maglieria');
    expect(preview.products[0]?.dto.category).toBeUndefined();
  });

  it('⭐ RITORNO DEL FILE: nessuno dei due si perde e nessuno dei due si scambia', () => {
    const csv = serializeProductsToShopifyCsv([makeRecord(ARTICOLO)]);

    const preview = buildImportPreview(parseShopifyProductCsv(csv.replace(/^\uFEFF/, '')), new Set());

    const dto = preview.products[0]?.dto;
    expect(dto?.category).toBe('Abbigliamento donna');
    expect(dto?.shopifyProductType).toBe('Maglieria');
  });

  it('⛔ e il ritorno del file non SOVRASCRIVE: un articolo già a catalogo si salta', () => {
    // ⭐ L'import massivo CREA soltanto: un handle o un nome già presenti sono
    //    marcati `alreadyImported` e non producono nessuna scrittura. È la
    //    ragione per cui il ritorno del file non può riscrivere la categoria
    //    interna di un articolo esistente — e va tenuto fermo, non dedotto.
    const csv = serializeProductsToShopifyCsv([makeRecord(ARTICOLO)]);
    const righe = parseShopifyProductCsv(csv.replace(/^\uFEFF/, ''));

    const preview = buildImportPreview(righe, new Set(), {
      handles: new Set([righe[0]?.handle ?? '']),
      names: new Set<string>(),
    });

    expect(preview.products[0]?.alreadyImported).toBe(true);
  });
});
