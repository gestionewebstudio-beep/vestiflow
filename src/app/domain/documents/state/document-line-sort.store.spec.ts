import { describe, expect, it } from 'vitest';

import { DocumentLineSortStore } from './document-line-sort.store';

type Colonna = 'sku' | 'product' | 'quantity';

function crea() {
  return new DocumentLineSortStore<Colonna>();
}

/** Il primo riordino passa dall'avviso: da qui in poi i test partono dopo. */
function creaConfermato() {
  const store = crea();
  store.request('sku');
  store.confirm();
  return store;
}

describe('DocumentLineSortStore', () => {
  describe('l’avviso, una volta per documento', () => {
    it('il primo riordino non parte: prima chiede', () => {
      const store = crea();

      expect(store.request('sku')).toBe(false);
      expect(store.confirmOpen()).toBe(true);
      expect(store.column()).toBeNull();
    });

    it('confermando, il riordino in attesa parte', () => {
      const store = crea();
      store.request('sku');

      expect(store.confirm()).toBe('sku');
      expect(store.confirmOpen()).toBe(false);
      expect(store.column()).toBe('sku');
    });

    it('dal secondo in poi non chiede più', () => {
      const store = creaConfermato();

      expect(store.request('product')).toBe(true);
      expect(store.confirmOpen()).toBe(false);
      expect(store.column()).toBe('product');
    });

    it('rinunciando non si ordina, e l’avviso resta dovuto', () => {
      const store = crea();
      store.request('sku');
      store.dismiss();

      expect(store.confirmOpen()).toBe(false);
      expect(store.column()).toBeNull();
      // La prova che l'avviso non è stato consumato: il prossimo lo richiede.
      expect(store.request('sku')).toBe(false);
    });

    it('confermando a vuoto non ordina niente', () => {
      const store = crea();

      expect(store.confirm()).toBeNull();
      expect(store.column()).toBeNull();
    });
  });

  describe('colonna e verso', () => {
    it('una colonna nuova parte crescente', () => {
      const store = creaConfermato();

      store.request('product');

      expect(store.column()).toBe('product');
      expect(store.direction()).toBe('asc');
    });

    it('la stessa colonna rovescia il verso', () => {
      const store = creaConfermato();

      expect(store.direction()).toBe('asc');
      store.request('sku');
      expect(store.direction()).toBe('desc');
      store.request('sku');
      expect(store.direction()).toBe('asc');
    });

    it('cambiando colonna si riparte da crescente, non si eredita il verso', () => {
      const store = creaConfermato();
      store.request('sku'); // ora è decrescente

      store.request('quantity');

      expect(store.direction()).toBe('asc');
    });
  });

  // Senza, aprendo il secondo documento nella stessa sessione il riordino
  // avverrebbe in silenzio: l'avviso risulterebbe già dato.
  it('un altro documento torna a chiedere', () => {
    const store = creaConfermato();

    store.reset();

    expect(store.column()).toBeNull();
    expect(store.direction()).toBe('asc');
    expect(store.request('sku')).toBe(false);
  });
});
