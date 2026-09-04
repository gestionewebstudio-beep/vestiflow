import { describe, expect, it } from 'vitest';

import { variantLabel, variantTitle } from './variant-label.util';

/**
 * ⭐ **Questo file è metà di una coppia.** L'altra metà è la spec della gemella
 * client (`domain/products/models/product-variant.util.spec.ts`): gli stessi
 * ingressi devono dare gli stessi risultati. Se una delle due cambia da sola,
 * la stessa variante si legge in due modi a seconda di chi la scrive — che è
 * esattamente il difetto che questa funzione esiste per chiudere.
 */
describe('variantLabel', () => {
  describe('la forma normale: un elenco di coppie', () => {
    it('due opzioni si uniscono con « / »', () => {
      expect(
        variantLabel([
          { name: 'Taglia', value: 'M' },
          { name: 'Colore', value: 'Rosso' },
        ]),
      ).toBe('M / Rosso');
    });

    it('una sola opzione esce da sola', () => {
      expect(variantLabel([{ name: 'Taglia', value: 'M' }])).toBe('M');
    });

    it('tre opzioni restano in ordine', () => {
      expect(
        variantLabel([
          { name: 'Taglia', value: 'M' },
          { name: 'Colore', value: 'Rosso' },
          { name: 'Materiale', value: 'Cotone' },
        ]),
      ).toBe('M / Rosso / Cotone');
    });

    it('gli spazi intorno al valore si tolgono', () => {
      expect(variantLabel([{ name: ' Taglia ', value: '  M  ' }])).toBe('M');
    });

    it('un valore vuoto non lascia un separatore orfano', () => {
      expect(
        variantLabel([
          { name: 'Taglia', value: 'M' },
          { name: 'Colore', value: '   ' },
        ]),
      ).toBe('M');
    });
  });

  /**
   * ⚠️ Non è un formato, sono **dati vecchi** che stanno a database. Tre
   * implementazioni su quattro qui restituivano stringa vuota, e la Dashboard
   * mostrava il solo nome prodotto per quelle varianti.
   */
  describe('la forma a mappa, che circola nei dati vecchi', () => {
    it('si legge come l’elenco di coppie', () => {
      expect(variantLabel({ Taglia: 'M', Colore: 'Rosso' })).toBe('M / Rosso');
    });

    it('anche qui i valori vuoti si scartano', () => {
      expect(variantLabel({ Taglia: 'M', Colore: '' })).toBe('M');
    });
  });

  /**
   * ⛔ Il sentinella di Shopify: un prodotto SENZA opzioni là ha comunque una
   * variante, con opzione `Title` e valore `Default Title`. Non è una variante
   * che si chiama così — è l'assenza di varianti, e l'admin di Shopify non la
   * mostra. Senza questo filtro comparirebbe «Default Title» in colonna su ogni
   * riga di ogni articolo importato senza opzioni.
   */
  describe('il sentinella di Shopify', () => {
    it('«Title / Default Title» è ASSENZA di varianti, non una variante', () => {
      expect(variantLabel([{ name: 'Title', value: 'Default Title' }])).toBe('');
    });

    it('vale anche nella forma a mappa', () => {
      expect(variantLabel({ Title: 'Default Title' })).toBe('');
    });

    /** ⚠️ Il filtro è stretto: due condizioni insieme, e una sola opzione. */
    it('un’opzione che si chiama Title ma vale altro NON si filtra', () => {
      expect(variantLabel([{ name: 'Title', value: 'Rosso' }])).toBe('Rosso');
    });

    it('un valore «Default Title» sotto un’altra opzione NON si filtra', () => {
      expect(variantLabel([{ name: 'Colore', value: 'Default Title' }])).toBe('Default Title');
    });

    it('accompagnato da una vera opzione NON si filtra', () => {
      expect(
        variantLabel([
          { name: 'Title', value: 'Default Title' },
          { name: 'Taglia', value: 'M' },
        ]),
      ).toBe('Default Title / M');
    });
  });

  describe('quando non c’è niente da comporre', () => {
    it.each([
      ['elenco vuoto', []],
      ['mappa vuota', {}],
      ['null', null],
      ['undefined', undefined],
      ['una stringa', 'M / Rosso'],
      ['un numero', 42],
      ['voci non oggetto', [null, 'M', 7]],
    ])('%s → stringa vuota', (_caso, ingresso) => {
      expect(variantLabel(ingresso)).toBe('');
    });
  });
});

describe('variantTitle', () => {
  it('nome e variante si uniscono con « — »', () => {
    expect(variantTitle('Maglietta cotone', [{ name: 'Taglia', value: 'M' }])).toBe(
      'Maglietta cotone — M',
    );
  });

  /** ⛔ Nessun separatore in coda quando la variante non c’è. */
  it('senza variante resta il solo nome, senza trattino appeso', () => {
    expect(variantTitle('Maglietta cotone', [])).toBe('Maglietta cotone');
    expect(variantTitle('Maglietta cotone', [{ name: 'Title', value: 'Default Title' }])).toBe(
      'Maglietta cotone',
    );
  });

  it('senza nome resta la sola variante', () => {
    expect(variantTitle('   ', [{ name: 'Taglia', value: 'M' }])).toBe('M');
  });

  it('senza nome né variante è stringa vuota', () => {
    expect(variantTitle('', null)).toBe('');
  });
});
