import { describe, expect, it } from 'vitest';

import {
  canChangeLicensedLocationSelection,
  shouldShowLocationSelectionGrantedHint,
  shouldShowLocationSelectionLockedMessage,
} from './location-selection-lock.util';

describe('location-selection-lock.util', () => {
  it('canChangeLicensedLocationSelection consente prima configurazione e sblocco admin', () => {
    expect(
      canChangeLicensedLocationSelection({
        locationSelectionLocked: false,
        locationSelectionChangeGranted: false,
      }),
    ).toBe(true);

    expect(
      canChangeLicensedLocationSelection({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      }),
    ).toBe(true);
  });

  it('canChangeLicensedLocationSelection nega salvataggio se bloccato senza sblocco', () => {
    expect(
      canChangeLicensedLocationSelection({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: false,
      }),
    ).toBe(false);
  });

  it('shouldShowLocationSelectionLockedMessage solo se bloccato e senza grant', () => {
    expect(
      shouldShowLocationSelectionLockedMessage({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: false,
      }),
    ).toBe(true);

    expect(
      shouldShowLocationSelectionLockedMessage({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      }),
    ).toBe(false);
  });

  it('shouldShowLocationSelectionGrantedHint quando admin ha concesso il cambio', () => {
    expect(
      shouldShowLocationSelectionGrantedHint({
        locationSelectionLocked: true,
        locationSelectionChangeGranted: true,
      }),
    ).toBe(true);

    expect(
      shouldShowLocationSelectionGrantedHint({
        locationSelectionLocked: false,
        locationSelectionChangeGranted: false,
      }),
    ).toBe(false);
  });
});
