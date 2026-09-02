import { describe, expect, it } from 'vitest';

import { raggruppaPerArticolo } from './articolo-trovato.model';
import type { VariantSummary } from './variant-summary.model';

function variante(over: Partial<VariantSummary> = {}): VariantSummary {
  return {
    variantId: 'v1',
    productId: 'p1',
    sku: 'SKU-1',
    articleCode: 'ART-1',
    productName: 'Maglietta cotone',
    title: 'Maglietta cotone — M',
    variantLabel: 'M',
    sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
    ...over,
  };
}

describe('raggruppaPerArticolo', () => {
  it('⭐ tre modelli con quindici taglie sono TRE righe, non quarantacinque', () => {
    const varianti = [
      variante({ variantId: 'a1', productId: 'a', productName: 'Maglie lana' }),
      variante({ variantId: 'a2', productId: 'a', productName: 'Maglie lana' }),
      variante({ variantId: 'b1', productId: 'b', productName: 'Maglietta cotone' }),
      variante({ variantId: 'c1', productId: 'c', productName: 'Magliette bimbo' }),
      variante({ variantId: 'c2', productId: 'c', productName: 'Magliette bimbo' }),
    ];

    const articoli = raggruppaPerArticolo(varianti);

    expect(articoli.map((a) => a.productName)).toEqual([
      'Maglie lana',
      'Maglietta cotone',
      'Magliette bimbo',
    ]);
    expect(articoli.map((a) => a.varianti.length)).toEqual([2, 1, 2]);
  });

  it("conserva l'ordine in cui il server ha dato le varianti", () => {
    const articoli = raggruppaPerArticolo([
      variante({ variantId: 'z', productId: 'z', productName: 'Zoccoli' }),
      variante({ variantId: 'a', productId: 'a', productName: 'Abito' }),
    ]);

    expect(articoli.map((a) => a.productId)).toEqual(['z', 'a']);
  });

  describe('giacenza e disponibilità', () => {
    it('somma i valori delle varianti', () => {
      const articoli = raggruppaPerArticolo([
        variante({ variantId: 'v1', stockOnHand: 3, stockAvailable: 2 }),
        variante({ variantId: 'v2', stockOnHand: 5, stockAvailable: 5 }),
      ]);

      expect(articoli[0]?.giacenza).toBe(8);
      expect(articoli[0]?.disponibile).toBe(7);
    });

    /**
     * ⛔ **`null` non è zero.** Un articolo che non gestisce magazzino non ha
     * giacenza: mostrare «0» direbbe **finito** invece di «non si conta», e in
     * negozio sono due risposte opposte.
     */
    it('⛔ senza nessuna giacenza il totale è null, non zero', () => {
      const articoli = raggruppaPerArticolo([
        variante({ variantId: 'v1' }),
        variante({ variantId: 'v2' }),
      ]);

      expect(articoli[0]?.giacenza).toBeNull();
      expect(articoli[0]?.disponibile).toBeNull();
    });

    it('⚠️ se una sola variante ha il numero, quella somma vale — le altre non tolgono', () => {
      const articoli = raggruppaPerArticolo([
        variante({ variantId: 'v1', stockOnHand: 4 }),
        variante({ variantId: 'v2' }),
      ]);

      expect(articoli[0]?.giacenza).toBe(4);
    });

    it('⚠️ uno zero vero resta zero: è «finito», e va distinto da «non pervenuto»', () => {
      const articoli = raggruppaPerArticolo([variante({ variantId: 'v1', stockOnHand: 0 })]);

      expect(articoli[0]?.giacenza).toBe(0);
    });
  });

  describe('prezzo', () => {
    it('con prezzi uguali il prezzo è unico', () => {
      const articoli = raggruppaPerArticolo([
        variante({ variantId: 'v1' }),
        variante({ variantId: 'v2' }),
      ]);

      expect(articoli[0]?.prezzoUnico).toBe(true);
      expect(articoli[0]?.prezzo.amountMinor).toBe(2500);
    });

    /** Taglie a prezzo diverso: quello mostrato è un «da …», e va detto. */
    it('⚠️ con prezzi diversi NON è unico', () => {
      const articoli = raggruppaPerArticolo([
        variante({ variantId: 'v1', sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' } }),
        variante({ variantId: 'v2', sellingPrice: { amountMinor: 2900, currencyCode: 'EUR' } }),
      ]);

      expect(articoli[0]?.prezzoUnico).toBe(false);
    });
  });

  it("⚠️ l'immagine è la prima DISPONIBILE, non quella della prima variante", () => {
    const articoli = raggruppaPerArticolo([
      variante({ variantId: 'v1' }),
      variante({ variantId: 'v2', imageUrl: 'https://cdn.test/rossa.jpg' }),
    ]);

    expect(articoli[0]?.imageUrl).toBe('https://cdn.test/rossa.jpg');
  });

  it('senza risultati non produce articoli', () => {
    expect(raggruppaPerArticolo([])).toEqual([]);
  });
});
