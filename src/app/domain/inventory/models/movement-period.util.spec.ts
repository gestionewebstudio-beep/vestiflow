import { describe, expect, it } from 'vitest';

import { MovementPeriodPreset, resolveMovementPeriodRange } from './movement-period.util';

// Riferimento fisso a metà mese per rendere deterministici i preset.
const REFERENCE = new Date(2026, 6, 18); // 18 luglio 2026

describe('resolveMovementPeriodRange', () => {
  it('senza preset non vincola le date', () => {
    expect(resolveMovementPeriodRange(MovementPeriodPreset.All, '', '', REFERENCE)).toEqual({});
  });

  it('mese corrente: dal primo all’ultimo giorno del mese', () => {
    expect(resolveMovementPeriodRange(MovementPeriodPreset.ThisMonth, '', '', REFERENCE)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('mese scorso: mese di calendario precedente, anche a cavallo d’anno', () => {
    expect(resolveMovementPeriodRange(MovementPeriodPreset.LastMonth, '', '', REFERENCE)).toEqual({
      from: '2026-06-01',
      to: '2026-06-30',
    });
    expect(
      resolveMovementPeriodRange(MovementPeriodPreset.LastMonth, '', '', new Date(2026, 0, 10)),
    ).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('anno corrente e anno scorso: anni di calendario interi', () => {
    expect(resolveMovementPeriodRange(MovementPeriodPreset.ThisYear, '', '', REFERENCE)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(resolveMovementPeriodRange(MovementPeriodPreset.LastYear, '', '', REFERENCE)).toEqual({
      from: '2025-01-01',
      to: '2025-12-31',
    });
  });

  it('personalizzato: usa le date Dal/Al, anche parziali', () => {
    expect(
      resolveMovementPeriodRange(
        MovementPeriodPreset.Custom,
        '2026-03-05',
        '2026-03-20',
        REFERENCE,
      ),
    ).toEqual({ from: '2026-03-05', to: '2026-03-20' });
    expect(
      resolveMovementPeriodRange(MovementPeriodPreset.Custom, '2026-03-05', '', REFERENCE),
    ).toEqual({ from: '2026-03-05', to: undefined });
  });
});
