import { describe, expect, it } from 'vitest';

import { filterSelectMenuOptions } from './select-menu-filter.util';

describe('filterSelectMenuOptions', () => {
  const options = [
    { value: '1', label: 'Maglietta — M / Rosso', detail: 'MAG-M-ROSSO' },
    { value: '2', label: 'Pantaloni — L', detail: 'PANT-L' },
  ] as const;

  it('restituisce tutte le opzioni con query vuota', () => {
    expect(filterSelectMenuOptions(options, '')).toEqual(options);
  });

  it('filtra per SKU', () => {
    expect(filterSelectMenuOptions(options, 'pant-l')).toEqual([options[1]]);
  });

  it('filtra per titolo prodotto', () => {
    expect(filterSelectMenuOptions(options, 'maglietta')).toEqual([options[0]]);
  });
});
