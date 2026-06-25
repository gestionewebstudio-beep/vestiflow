import { describe, expect, it } from 'vitest';

import {
  canAdminGrantLocationSelectionChange,
  resolveAdminLocationSelectionStatusLabel,
} from './admin-location-selection.util';

describe('admin-location-selection.util', () => {
  it('resolveAdminLocationSelectionStatusLabel per stati admin', () => {
    expect(
      resolveAdminLocationSelectionStatusLabel({
        locationSelectionLocked: false,
        locationSelectionChangeGranted: false,
      }),
    ).toBe('Il cliente può ancora scegliere le sedi attive (prima configurazione).');

    expect(
      resolveAdminLocationSelectionStatusLabel({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: false,
      }),
    ).toBe('');

    expect(
      resolveAdminLocationSelectionStatusLabel({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      }),
    ).toBe('Cambio sede concesso — in attesa che il cliente salvi in Impostazioni.');
  });

  it('canAdminGrantLocationSelectionChange solo se bloccato e grant non ancora attivo', () => {
    expect(
      canAdminGrantLocationSelectionChange({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: false,
      }),
    ).toBe(true);

    expect(
      canAdminGrantLocationSelectionChange({
        locationSelectionLocked: false,
        locationSelectionChangeGranted: false,
      }),
    ).toBe(false);

    expect(
      canAdminGrantLocationSelectionChange({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      }),
    ).toBe(false);
  });
});
