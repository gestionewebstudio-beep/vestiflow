import { describe, expect, it } from 'vitest';

import type { OptionAxisDraft } from './product-form.model';
import {
  axisValues,
  cartesianOptionValues,
  comboKey,
  selectedOptionValue,
  variantOptionNames,
  variantLabel,
} from './product-variant.util';

const TAGLIA_COLORE: readonly OptionAxisDraft[] = [
  { name: 'Taglia', values: ['S', 'M'] },
  { name: 'Colore', values: ['Rosso', 'Blu'] },
];

describe('selectedOptionValue / axisValues', () => {
  it('legge il valore di una opzione per nome', () => {
    const values = [{ name: 'Taglia', value: 'M' }];
    expect(selectedOptionValue(values, 'Taglia')).toBe('M');
    expect(selectedOptionValue(values, 'Colore')).toBe('');
  });

  it('legge i valori di un asse per nome', () => {
    expect(axisValues(TAGLIA_COLORE, 'Colore')).toEqual(['Rosso', 'Blu']);
    expect(axisValues(TAGLIA_COLORE, 'Materiale')).toEqual([]);
  });
});

/**
 * ⭐ **Questo blocco è metà di una coppia.** L'altra metà è
 * `api/src/common/variant-label.util.spec.ts`: gli stessi ingressi devono dare
 * gli stessi risultati. Se una delle due cambia da sola, la stessa variante si
 * legge in due modi a seconda di chi la scrive.
 */
describe('variantLabel / variantOptionNames / comboKey', () => {
  it('compone i soli valori con " / "', () => {
    expect(
      variantLabel([
        { name: 'Taglia', value: 'M' },
        { name: 'Colore', value: 'Rosso' },
      ]),
    ).toBe('M / Rosso');
    expect(variantLabel([])).toBe('');
  });

  it('una sola opzione esce da sola', () => {
    expect(variantLabel([{ name: 'Taglia', value: 'M' }])).toBe('M');
  });

  it('gli spazi si tolgono e i valori vuoti non lasciano separatori orfani', () => {
    expect(
      variantLabel([
        { name: 'Taglia', value: '  M  ' },
        { name: 'Colore', value: '   ' },
      ]),
    ).toBe('M');
  });

  /**
   * ⛔ Il sentinella di Shopify: un prodotto SENZA opzioni là ha comunque una
   * variante, con opzione `Title` e valore `Default Title`. È l'assenza di
   * varianti, non una variante che si chiama così.
   */
  it('«Title / Default Title» è ASSENZA di varianti', () => {
    expect(variantLabel([{ name: 'Title', value: 'Default Title' }])).toBe('');
  });

  it('il filtro è stretto: servono entrambe le condizioni, e una sola opzione', () => {
    expect(variantLabel([{ name: 'Title', value: 'Rosso' }])).toBe('Rosso');
    expect(variantLabel([{ name: 'Colore', value: 'Default Title' }])).toBe('Default Title');
    expect(
      variantLabel([
        { name: 'Title', value: 'Default Title' },
        { name: 'Taglia', value: 'M' },
      ]),
    ).toBe('Default Title / M');
  });

  it('deriva i nomi opzione in ordine di prima comparsa', () => {
    const variants = [
      { optionValues: [{ name: 'Taglia', value: 'M' }] },
      {
        optionValues: [
          { name: 'Taglia', value: 'L' },
          { name: 'Colore', value: 'Blu' },
        ],
      },
    ];
    expect(variantOptionNames(variants)).toEqual(['Taglia', 'Colore']);
  });

  it('comboKey distingue combinazioni con valori simili', () => {
    const a = comboKey([
      { name: 'Taglia', value: 'M' },
      { name: 'Colore', value: 'Rosso' },
    ]);
    const b = comboKey([{ name: 'Taglia', value: 'M / Rosso' }]);
    expect(a).not.toBe(b);
  });
});

describe('cartesianOptionValues', () => {
  it('genera il prodotto cartesiano in ordine stabile (primo asse esterno)', () => {
    const combos = cartesianOptionValues(TAGLIA_COLORE);
    expect(combos).toHaveLength(4);
    expect(combos[0]).toEqual([
      { name: 'Taglia', value: 'S' },
      { name: 'Colore', value: 'Rosso' },
    ]);
    expect(combos[3]).toEqual([
      { name: 'Taglia', value: 'M' },
      { name: 'Colore', value: 'Blu' },
    ]);
  });

  it('ignora gli assi senza valori e deduplica i valori', () => {
    const combos = cartesianOptionValues([
      { name: 'Taglia', values: ['M', 'M', 'L'] },
      { name: 'Colore', values: [] },
    ]);
    expect(combos).toEqual([[{ name: 'Taglia', value: 'M' }], [{ name: 'Taglia', value: 'L' }]]);
  });

  it('nessun asse valorizzato: nessuna combinazione', () => {
    expect(cartesianOptionValues([])).toEqual([]);
    expect(cartesianOptionValues([{ name: 'Taglia', values: [] }])).toEqual([]);
  });

  it('supporta il terzo asse (vincolo Shopify max 3)', () => {
    const combos = cartesianOptionValues([
      { name: 'Taglia', values: ['M'] },
      { name: 'Colore', values: ['Rosso'] },
      { name: 'Materiale', values: ['Cotone', 'Lino'] },
    ]);
    expect(combos).toHaveLength(2);
    expect(combos[1]).toEqual([
      { name: 'Taglia', value: 'M' },
      { name: 'Colore', value: 'Rosso' },
      { name: 'Materiale', value: 'Lino' },
    ]);
  });
});
