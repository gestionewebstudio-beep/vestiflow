import { describe, expect, it } from 'vitest';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { DocumentCodeLookupStore } from './document-code-lookup.store';

function variant(id: string): VariantSummary {
  return {
    variantId: id,
    productId: 'prod-1',
    sku: `SKU-${id}`,
    articleCode: 'ART-1',
    productName: 'Maglietta',
    title: `Maglietta — ${id}`,
    variantLabel: '',
    sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
  };
}

describe('DocumentCodeLookupStore', () => {
  it('parte chiusa: nessuna scelta da fare finché un codice non ne apre una', () => {
    const store = new DocumentCodeLookupStore();

    expect(store.matches()).toEqual([]);
    expect(store.isOpenOn(0, 'sku')).toBe(false);
    expect(store.isOpenOnLine(0)).toBe(false);
  });

  it('la scelta si apre sulla prima voce: il fuoco è rimasto nel campo', () => {
    const store = new DocumentCodeLookupStore();

    store.open(2, 'articleCode', [variant('a'), variant('b')]);

    expect(store.activeIndex()).toBe(0);
    expect(store.isOpenOn(2, 'articleCode')).toBe(true);
  });

  // La cella non sa dove sia la scelta: la interroga. Senza questo, due celle
  // codice della stessa riga mostrerebbero lo stesso pannello.
  it('mostra le corrispondenze solo nella cella che le ha aperte', () => {
    const store = new DocumentCodeLookupStore();

    store.open(1, 'sku', [variant('a'), variant('b')]);

    expect(store.matchesFor(1, 'sku')).toHaveLength(2);
    expect(store.matchesFor(1, 'barcode')).toEqual([]);
    expect(store.matchesFor(0, 'sku')).toEqual([]);
  });

  // La riga chiede «c'è una scelta aperta su di me», senza elencare i campi:
  // è elencandoli a mano che il quarto codice viene dimenticato.
  it('la riga sa di avere una scelta aperta, qualunque cella l’abbia aperta', () => {
    const store = new DocumentCodeLookupStore();

    store.open(3, 'supplierCode', [variant('a'), variant('b')]);

    expect(store.isOpenOnLine(3)).toBe(true);
    expect(store.isOpenOnLine(2)).toBe(false);
  });

  it('le frecce si fermano ai capi invece di girare', () => {
    const store = new DocumentCodeLookupStore();
    store.open(0, 'sku', [variant('a'), variant('b')]);

    store.navigate('prev');
    expect(store.activeIndex()).toBe(0);

    store.navigate('next');
    store.navigate('next');
    expect(store.activeIndex()).toBe(1);
  });

  it('senza corrispondenze le frecce non muovono nulla', () => {
    const store = new DocumentCodeLookupStore();

    store.navigate('next');

    expect(store.activeIndex()).toBe(0);
  });

  it('chiudere dimentica riga, campo, corrispondenze ed evidenziazione', () => {
    const store = new DocumentCodeLookupStore();
    store.open(1, 'sku', [variant('a'), variant('b')]);
    store.navigate('next');

    store.clear();

    expect(store.matches()).toEqual([]);
    expect(store.activeIndex()).toBe(0);
    expect(store.isOpenOn(1, 'sku')).toBe(false);
    expect(store.isOpenOnLine(1)).toBe(false);
  });

  // Una scelta con una voce sola non è una scelta: quel caso aggancia e basta.
  // Se ci arrivasse comunque, il pannello non deve restare aperto a vuoto.
  it('un elenco vuoto non conta come scelta aperta', () => {
    const store = new DocumentCodeLookupStore();

    store.open(0, 'sku', []);

    expect(store.isOpenOn(0, 'sku')).toBe(false);
    expect(store.isOpenOnLine(0)).toBe(false);
  });
});
