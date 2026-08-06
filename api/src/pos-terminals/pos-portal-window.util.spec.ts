import { describe, expect, it } from 'vitest';

import { posPortalStatus, posPortalWindow } from './pos-portal-window.util';

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('pos-portal-window.util', () => {
  it('prima finestra: POS in uso a gennaio 2026 → 5 marzo – 20 aprile 2026', () => {
    const window = posPortalWindow(utc('2025-11-15'));
    expect(window.from.toISOString().slice(0, 10)).toBe('2026-03-05');
    expect(window.to.toISOString().slice(0, 10)).toBe('2026-04-20');
    // Anche l'attivato il 31 gennaio rientra nella prima finestra.
    expect(posPortalWindow(utc('2026-01-31')).to.toISOString().slice(0, 10)).toBe('2026-04-20');
  });

  it('regime: dal 6° giorno all’ultimo giorno del secondo mese successivo', () => {
    // Esempi ufficiali: attivato ad aprile → 6–30 giugno; maggio → 6–31 luglio.
    const april = posPortalWindow(utc('2026-04-12'));
    expect(april.from.toISOString().slice(0, 10)).toBe('2026-06-06');
    expect(april.to.toISOString().slice(0, 10)).toBe('2026-06-30');

    const may = posPortalWindow(utc('2026-05-02'));
    expect(may.to.toISOString().slice(0, 10)).toBe('2026-07-31');

    // Cavallo d'anno: attivato a novembre → finestra a gennaio dell'anno dopo.
    const november = posPortalWindow(utc('2026-11-20'));
    expect(november.from.toISOString().slice(0, 10)).toBe('2027-01-06');
    expect(november.to.toISOString().slice(0, 10)).toBe('2027-01-31');
  });

  it('stato: linked vince su tutto; poi upcoming/open/overdue rispetto a oggi', () => {
    const activated = utc('2026-06-15'); // finestra 6–31 agosto 2026
    expect(posPortalStatus(activated, utc('2026-08-07'), utc('2026-08-07'))).toBe('linked');
    expect(posPortalStatus(activated, null, utc('2026-08-01'))).toBe('upcoming');
    expect(posPortalStatus(activated, null, utc('2026-08-07'))).toBe('open');
    expect(posPortalStatus(activated, null, utc('2026-08-31'))).toBe('open');
    expect(posPortalStatus(activated, null, utc('2026-09-01'))).toBe('overdue');
  });
});
