import { describe, expect, it } from 'vitest';

import { toLocationSelectOptions } from './location-select-options.util';

const LOCATIONS = [
  { id: 'loc-milano', name: 'Milano' },
  { id: 'loc-roma', name: 'Roma' },
  { id: 'loc-napoli', name: 'Napoli' },
];

describe('toLocationSelectOptions', () => {
  it('senza predefinita mantiene ordine ed etichette originali', () => {
    const options = toLocationSelectOptions(LOCATIONS, null);

    expect(options).toEqual([
      { value: 'loc-milano', label: 'Milano' },
      { value: 'loc-roma', label: 'Roma' },
      { value: 'loc-napoli', label: 'Napoli' },
    ]);
  });

  it('porta la predefinita PRIMA in lista con etichetta "(predefinita)"', () => {
    const options = toLocationSelectOptions(LOCATIONS, 'loc-roma');

    expect(options[0]).toEqual({ value: 'loc-roma', label: 'Roma (predefinita)' });
    expect(options.map((option) => option.value)).toEqual(['loc-roma', 'loc-milano', 'loc-napoli']);
  });

  it('ignora una predefinita non presente tra le sedi (nessuna etichetta)', () => {
    const options = toLocationSelectOptions(LOCATIONS, 'loc-sconosciuta');

    expect(options.map((option) => option.label)).toEqual(['Milano', 'Roma', 'Napoli']);
  });
});
