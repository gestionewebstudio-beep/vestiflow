import { describe, expect, it } from 'vitest';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { DOCUMENT_CODE_MATCH_PAGE_SIZE, filterExactCodeMatches } from './document-code-match.util';

function variant(overrides: Partial<VariantSummary> & { variantId: string }): VariantSummary {
  return {
    productId: 'prod-1',
    sku: 'SKU-1',
    articleCode: 'ART-1',
    productName: 'Maglietta',
    title: 'Maglietta — M',
    sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
    ...overrides,
  };
}

function ids(rows: readonly VariantSummary[]): readonly string[] {
  return rows.map((row) => row.variantId);
}

describe('filterExactCodeMatches', () => {
  it('un codice vuoto non corrisponde a niente', () => {
    const rows = [variant({ variantId: 'var-1' })];

    expect(filterExactCodeMatches(rows, '   ', 'sku')).toEqual([]);
  });

  describe('SKU', () => {
    it('confronta senza distinguere maiuscole e spazi ai bordi', () => {
      const rows = [variant({ variantId: 'var-1', sku: 'MAG-M' })];

      expect(ids(filterExactCodeMatches(rows, '  mag-m ', 'sku'))).toEqual(['var-1']);
    });

    // È il ripiego che è stato tolto: la ricerca del server guarda dentro nome
    // e marca, quindi senza corrispondenza esatta tornava tutto il pescato.
    it('non accetta corrispondenze parziali', () => {
      const rows = [variant({ variantId: 'var-1', sku: 'JEANS-100-SLIM' })];

      expect(filterExactCodeMatches(rows, '100', 'sku')).toEqual([]);
    });
  });

  describe('codice articolo', () => {
    // È unico per PRODOTTO, non per variante: più risultati sono per forza
    // taglie dello stesso articolo, e la scelta è «quale taglia».
    it('restituisce tutte le varianti che condividono il codice', () => {
      const rows = [
        variant({ variantId: 'var-M', articleCode: 'ART-9' }),
        variant({ variantId: 'var-L', articleCode: 'art-9' }),
        variant({ variantId: 'var-X', articleCode: 'ART-90' }),
      ];

      expect(ids(filterExactCodeMatches(rows, 'ART-9', 'articleCode'))).toEqual(['var-M', 'var-L']);
    });
  });

  describe('EAN', () => {
    it('confronta la stringa esatta, e ignora le varianti che non ne hanno uno', () => {
      const rows = [
        variant({ variantId: 'var-1', barcode: '8001234567890' }),
        variant({ variantId: 'var-2' }),
      ];

      expect(ids(filterExactCodeMatches(rows, ' 8001234567890 ', 'barcode'))).toEqual(['var-1']);
    });
  });

  describe('codice fornitore', () => {
    // Non è unico affatto: fornitori diversi possono usare lo stesso codice per
    // articoli diversi, e lì la scelta è «quale articolo».
    it('restituisce gli articoli diversi che condividono il codice', () => {
      const rows = [
        variant({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-100' }),
        variant({ variantId: 'var-2', productId: 'prod-2', supplierSku: 'f-100' }),
      ];

      expect(ids(filterExactCodeMatches(rows, 'F-100', 'supplierCode'))).toEqual([
        'var-1',
        'var-2',
      ]);
    });

    // Senza la guardia sul valore, una variante senza collegamento fornitore
    // risponderebbe a un confronto fra stringhe vuote.
    it('una variante senza codice fornitore non corrisponde mai', () => {
      const rows = [variant({ variantId: 'var-1', supplierSku: '' })];

      expect(filterExactCodeMatches(rows, '  ', 'supplierCode')).toEqual([]);
      expect(filterExactCodeMatches(rows, 'F-1', 'supplierCode')).toEqual([]);
    });
  });

  // Non è un elenco da sfogliare: si vogliono TUTTE le varianti che condividono
  // il codice, e sei taglie per cinque colori fanno trenta.
  it('la pagina della ricerca di conferma sta larga', () => {
    expect(DOCUMENT_CODE_MATCH_PAGE_SIZE).toBeGreaterThanOrEqual(100);
  });
});
