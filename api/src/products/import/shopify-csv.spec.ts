import { describe, expect, it } from 'vitest';

import {
  buildImportPreview,
  isImportProductReady,
  resolveCsvImportSku,
} from './shopify-csv.mapper';
import { parseShopifyProductCsv } from './shopify-csv.parse';

const SAMPLE_CSV = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare-at Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / AdWords Grouping,Google Shopping / AdWords Labels,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Status
maglietta-test,Maglietta Test,<p>Cotone morbido</p>,Brand X,Abbigliamento,estate,TRUE,Taglia,S,Colore,Rosso,,,SKU-RED-S,200,,10,deny,manual,29.90,39.90,TRUE,TRUE,111,,,,,,,,,,,,,,,,,,,,,active
maglietta-test,,,,,,,,M,,Rosso,,,SKU-RED-M,,,5,,,29.90,,,,,,,,,,,,,,,,,,,,,,,,,
`;

describe('parseShopifyProductCsv', () => {
  it('parses righe Shopify classiche', () => {
    const rows = parseShopifyProductCsv(SAMPLE_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.handle).toBe('maglietta-test');
    expect(rows[0]?.variantSku).toBe('SKU-RED-S');
  });
});

describe('buildImportPreview', () => {
  it('raggruppa varianti per handle', () => {
    const rows = parseShopifyProductCsv(SAMPLE_CSV);
    const preview = buildImportPreview(rows, new Set());
    expect(preview.summary.total).toBe(1);
    expect(preview.products[0]?.dto.variants).toHaveLength(2);
    expect(preview.products[0]?.dto.name).toBe('Maglietta Test');
    expect(preview.summary.ready).toBe(1);
  });
});

describe('resolveCsvImportSku', () => {
  it('ritorna SKU libero se non riservato', () => {
    const reserved = new Set<string>();
    expect(resolveCsvImportSku(reserved, 'SKU-NEW', 2, 0)).toBe('SKU-NEW');
  });

  it('genera fallback se SKU duplicato nel file', () => {
    const reserved = new Set(['sku-dup']);
    expect(resolveCsvImportSku(reserved, 'SKU-DUP', 5, 1)).toBe('SKU-DUP-CSV-5');
  });

  it('genera SKU da riga se raw vuoto', () => {
    expect(resolveCsvImportSku(new Set(), '', 3, 0)).toBe('CSV-3-0');
  });
});

describe('isImportProductReady', () => {
  it('false se almeno un issue error', () => {
    expect(
      isImportProductReady({
        issues: [{ level: 'warning', message: 'ok' }, { level: 'error', message: 'bad' }],
      } as unknown as Parameters<typeof isImportProductReady>[0]),
    ).toBe(false);
  });

  it('true se solo warning o nessun issue', () => {
    expect(
      isImportProductReady({
        issues: [{ level: 'warning', message: 'warn' }],
      } as unknown as Parameters<typeof isImportProductReady>[0]),
    ).toBe(true);
  });
});
