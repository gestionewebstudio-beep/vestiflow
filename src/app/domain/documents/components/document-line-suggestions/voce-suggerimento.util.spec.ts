import { describe, expect, it } from 'vitest';

import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { voceSuggerimento } from './voce-suggerimento.util';

function variante(over: Partial<VariantSummary> = {}): VariantSummary {
  return {
    variantId: 'v1',
    productId: 'p1',
    sku: 'SKU-1',
    articleCode: 'ART-1',
    productName: 'Maglietta cotone',
    title: 'Maglietta cotone — XL',
    variantLabel: 'XL',
    sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
    ...over,
  };
}

describe('voceSuggerimento', () => {
  /**
   * ⛔ **IL DIFETTO CHE QUESTA PROVA INCHIODA.** La cella «Nome prodotto»
   * scriveva «Disp. N» leggendo `stockOnHand`, la GIACENZA. In tutto il resto
   * dell'app «Disp.» è il disponibile — giacenza meno impegnata.
   *
   * ⚠️ Su un ordine cliente la differenza è operativa: la merce si impegna,
   * quindi «Disp. 18» poteva voler dire diciotto in magazzino e tre vendibili.
   */
  it('⛔ «Disp.» è il DISPONIBILE, non la giacenza', () => {
    const voce = voceSuggerimento(variante({ stockOnHand: 18, stockAvailable: 3 }));

    expect(voce.disponibile).toBe('Disp. 3');
  });

  /**
   * ⭐ **La disponibilità si mostra SEMPRE, anche a zero** — proprietario,
   * 02/09/2026: «manca solo visualizzare sempre la disponibilità, anche quella 0».
   *
   * ⛔ Qui c'era la prova opposta: «senza disponibilità non scrive Disp.: null
   * non è zero». La premessa era sbagliata, e l'ha smentita l'API:
   * `products.service` dice «null solo se la variante non ha alcuna riga
   * giacenza (mai movimentata)» — cioè zero pezzi davvero.
   */
  it('⭐ una variante mai movimentata mostra «Disp. 0», non il vuoto', () => {
    const voce = voceSuggerimento(variante({ stockOnHand: 7 }));

    expect(voce.disponibile).toBe('Disp. 0');
    expect(voce.tonoDisponibile).toBe('zero');
  });

  /**
   * ⚠️ **L'unico caso in cui il silenzio è giusto.** Un servizio o un articolo
   * fuori magazzino non ha disponibilità: «Disp. 0» direbbe «finito» su qualcosa
   * che non finisce mai.
   */
  it('⛔ chi non gestisce magazzino non mostra disponibilità affatto', () => {
    const voce = voceSuggerimento(variante({ managesStock: false }));

    expect(voce.disponibile).toBeUndefined();
    expect(voce.tonoDisponibile).toBeUndefined();
  });

  describe('il tono della disponibilità', () => {
    it('sopra zero è ok', () => {
      expect(voceSuggerimento(variante({ stockAvailable: 4 })).tonoDisponibile).toBe('ok');
    });

    it('a zero è «finito»', () => {
      expect(voceSuggerimento(variante({ stockAvailable: 0 })).tonoDisponibile).toBe('zero');
    });

    /** Sotto zero è un'anomalia di magazzino, e si deve vedere. */
    it('sotto zero è negativa', () => {
      expect(voceSuggerimento(variante({ stockAvailable: -2 })).tonoDisponibile).toBe('negativa');
    });
  });

  /**
   * ⭐ Scorrendo dieci suggerimenti dello stesso articolo, la taglia è l'unica
   * cosa che cambia: attaccata al nome con un trattino restava sepolta.
   */
  it('⭐ la variante è separata dal nome, non attaccata con un trattino', () => {
    const voce = voceSuggerimento(variante());

    expect(voce.title).toBe('Maglietta cotone');
    expect(voce.variante).toBe('XL');
  });

  it('senza etichetta variante non ne inventa una', () => {
    const voce = voceSuggerimento(variante({ variantLabel: '' }));

    expect(voce.variante).toBeUndefined();
  });

  it('i codici stanno insieme, separati dal punto medio', () => {
    const voce = voceSuggerimento(
      variante({ sku: 'SKU-9', barcode: '800012', category: 'Magliette' }),
    );

    expect(voce.detail).toBe('SKU-9 · EAN 800012 · Magliette');
  });

  it('senza codici il dettaglio non esiste, invece di essere vuoto', () => {
    const voce = voceSuggerimento(variante({ sku: '', barcode: undefined, category: undefined }));

    expect(voce.detail).toBeUndefined();
  });

  describe('il costo', () => {
    /** Serve ai documenti di acquisto, e solo a chi lo chiede. */
    it('non c’è se non lo si chiede', () => {
      const voce = voceSuggerimento(
        variante({ purchasePrice: { amountMinor: 1200, currencyCode: 'EUR' } }),
      );

      expect(voce.costo).toBeUndefined();
    });

    it('c’è quando lo si chiede', () => {
      const voce = voceSuggerimento(
        variante({ purchasePrice: { amountMinor: 1200, currencyCode: 'EUR' } }),
        { conCosto: true },
      );

      expect(voce.costo).toContain('Acq.');
    });
  });

  it('⚠️ un prezzo a zero non si mostra: non è un prezzo, è un dato mancante', () => {
    const voce = voceSuggerimento(
      variante({ sellingPrice: { amountMinor: 0, currencyCode: 'EUR' } }),
    );

    expect(voce.prezzo).toBeUndefined();
  });
});
