import { describe, expect, it } from 'vitest';

import { unitOfMeasureSelectOptions } from './unit-of-measure-options.util';

const voce = (name: string, isActive = true) => ({
  id: `um-${name}`,
  name,
  sortOrder: 0,
  isSystem: false,
  isActive,
});

describe('unitOfMeasureSelectOptions', () => {
  // Sulla riga l'unità si salva come stringa: `pz` non ha un identificativo da
  // nascondere, ed è anche ciò che rende possibile il testo libero.
  it('il valore è l’etichetta', () => {
    expect(unitOfMeasureSelectOptions([voce('pz')])).toEqual([{ value: 'pz', label: 'pz' }]);
  });

  it('le disattivate non si propongono', () => {
    const voci = [voce('pz'), voce('conf', false), voce('kg')];

    expect(unitOfMeasureSelectOptions(voci).map((o) => o.value)).toEqual(['pz', 'kg']);
  });

  it('l’ordine ricevuto resta quello', () => {
    const voci = [voce('kg'), voce('pz'), voce('m')];

    expect(unitOfMeasureSelectOptions(voci).map((o) => o.label)).toEqual(['kg', 'pz', 'm']);
  });
});
