import { describe, expect, it } from 'vitest';

import { DocumentProductSuggestStore } from './document-product-suggest.store';

import type { DocumentProductSuggestInputs } from './document-product-suggest.store';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

function variant(variantId: string): VariantSummary {
  return {
    variantId,
    productId: `p-${variantId}`,
    sku: `SKU-${variantId}`,
    articleCode: `ART-${variantId}`,
    productName: 'Maglietta cotone',
    title: 'Maglietta cotone — M',
    sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
  };
}

function inputs(
  overrides: Partial<DocumentProductSuggestInputs> = {},
): DocumentProductSuggestInputs {
  return { hasLinked: false, searched: [], ...overrides };
}

describe('DocumentProductSuggestStore', () => {
  describe('fuoco e chiusura', () => {
    it('parte chiuso', () => {
      const store = new DocumentProductSuggestStore();
      expect(store.lineIndex()).toBeNull();
      expect(store.activeIndex()).toBe(0);
    });

    it('apre sulla riga che prende il fuoco', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(2);
      expect(store.lineIndex()).toBe(2);
    });

    it('azzera l’evidenziazione passando a un’altra riga', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      store.navigate('next', 5);
      store.focusLine(1);
      expect(store.activeIndex()).toBe(0);
    });

    it('lo sfocamento della riga aperta chiude', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(1);
      store.blurLine(1);
      expect(store.lineIndex()).toBeNull();
    });

    it('lo sfocamento di un’altra riga non chiude il pannello altrui', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(1);
      store.blurLine(0);
      expect(store.lineIndex()).toBe(1);
    });

    it('clear chiude e riazzera', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(3);
      store.navigate('next', 4);
      store.clear();
      expect(store.lineIndex()).toBeNull();
      expect(store.activeIndex()).toBe(0);
    });
  });

  describe('elenco proposto', () => {
    it('non propone nulla su una riga diversa da quella col fuoco', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      expect(store.suggestionsFor(1, inputs({ searched: [variant('v1')] }))).toEqual([]);
    });

    it('non propone nulla se la riga ha già un articolo', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      expect(
        store.suggestionsFor(0, inputs({ hasLinked: true, searched: [variant('v1')] })),
      ).toEqual([]);
    });

    it('propone i risultati del catalogo, nell’ordine ricevuto', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      const elenco = store.suggestionsFor(0, inputs({ searched: [variant('v1'), variant('v2')] }));
      expect(elenco.map((v) => v.variantId)).toEqual(['v1', 'v2']);
    });

    it('non aggiunge nulla ai risultati del catalogo', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      const catalogo = [variant('v1')];
      expect(store.suggestionsFor(0, inputs({ searched: catalogo }))).toEqual(catalogo);
    });
  });

  describe('apertura del pannello', () => {
    it('è chiuso su una riga diversa da quella col fuoco', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      expect(store.isOpenOn(1, inputs({ searched: [variant('v1')] }))).toBe(false);
    });

    it('è chiuso se la riga ha già un articolo', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      expect(store.isOpenOn(0, inputs({ hasLinked: true, searched: [variant('v1')] }))).toBe(false);
    });

    it('è aperto con risultati', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      expect(store.isOpenOn(0, inputs({ searched: [variant('v1')] }))).toBe(true);
    });

    it('non si apre senza risultati: nessun messaggio di vuoto', () => {
      const store = new DocumentProductSuggestStore();
      store.focusLine(0);
      expect(store.isOpenOn(0, inputs())).toBe(false);
    });
  });

  describe('navigazione', () => {
    it('scende di uno', () => {
      const store = new DocumentProductSuggestStore();
      store.navigate('next', 3);
      expect(store.activeIndex()).toBe(1);
    });

    it('si ferma sull’ultimo, non torna al primo', () => {
      const store = new DocumentProductSuggestStore();
      store.navigate('next', 2);
      store.navigate('next', 2);
      store.navigate('next', 2);
      expect(store.activeIndex()).toBe(1);
    });

    it('si ferma sul primo, non salta all’ultimo', () => {
      const store = new DocumentProductSuggestStore();
      store.navigate('prev', 3);
      expect(store.activeIndex()).toBe(0);
    });

    it('ignora la navigazione su un elenco vuoto', () => {
      const store = new DocumentProductSuggestStore();
      store.navigate('next', 0);
      expect(store.activeIndex()).toBe(0);
    });

    it('rientra nei limiti se l’elenco si è accorciato sotto la posizione corrente', () => {
      const store = new DocumentProductSuggestStore();
      store.navigate('next', 10);
      store.navigate('next', 10);
      store.navigate('next', 10);
      expect(store.activeIndex()).toBe(3);
      store.navigate('next', 2);
      expect(store.activeIndex()).toBe(1);
    });
  });
});
