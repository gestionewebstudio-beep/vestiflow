import { describe, expect, it } from 'vitest';

import { buildLabelPrintDocument } from './product-label-print-document.util';
import type { ProductLabelViewModel } from './product-label.model';

const label: ProductLabelViewModel = {
  variantId: 'var-1',
  productName: 'Maglietta <Test>',
  brand: 'Brand & Co',
  sku: 'SKU-M',
  barcode: '8001234567890',
  sellingPrice: { amountMinor: 2990, currencyCode: 'EUR' },
  compareAtPrice: { amountMinor: 3990, currencyCode: 'EUR' },
};

describe('buildLabelPrintDocument', () => {
  it('genera HTML completo con escape e prezzi formattati', async () => {
    const html = await buildLabelPrintDocument([label], document);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Maglietta &lt;Test&gt;');
    expect(html).toContain('Brand &amp; Co');
    expect(html).toContain('SKU-M');
    expect(html).toContain('label__price');
    expect(html).toContain('label__compare-at');
  });

  it('mostra messaggio se barcode assente', async () => {
    const html = await buildLabelPrintDocument([{ ...label, barcode: '' }], document);

    expect(html).toContain('Barcode non impostato');
  });
});
