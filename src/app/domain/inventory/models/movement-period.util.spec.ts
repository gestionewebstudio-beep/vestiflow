import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MOVEMENT_PERIOD,
  MovementPeriodPreset,
  resolveMovementPeriodRange,
} from './movement-period.util';

// Riferimento fisso a metà mese per rendere deterministici i preset.
const REFERENCE = new Date(2026, 6, 18); // 18 luglio 2026

describe('resolveMovementPeriodRange', () => {
  /**
   * ⛔ Il registro non si APRE più così — `DEFAULT_MOVEMENT_PERIOD` è delimitato —
   * ma «Tutti» resta una scelta esplicita, e deve continuare a non vincolare.
   */
  it('«Tutti» non vincola le date, e resta scegliibile', () => {
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

  /**
   * ⭐ «Ultimi N giorni» INCLUDE OGGI: sette giorni sono oggi più i sei precedenti.
   * Contarli escludendo oggi darebbe un registro che non mostra ciò che si è appena
   * registrato — il difetto che si nota solo usandolo.
   */
  it('⭐ ultimi 7 giorni: oggi più i sei precedenti', () => {
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Last7Days, '', '', REFERENCE)).toEqual({
      from: '2026-07-12',
      to: '2026-07-18',
    });
  });

  it('ultimi 30 giorni: oggi più i ventinove precedenti, anche a cavallo di mese', () => {
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Last30Days, '', '', REFERENCE)).toEqual({
      from: '2026-06-19',
      to: '2026-07-18',
    });
  });

  /**
   * ⚠️ A cavallo d'anno l'aritmetica dei giorni deve attraversare il capodanno: è il
   * caso in cui un calcolo scritto a mano sui numeri di giorno sbaglia.
   */
  it('⚠️ ultimi 30 giorni a cavallo d’anno', () => {
    expect(
      resolveMovementPeriodRange(MovementPeriodPreset.Last30Days, '', '', new Date(2026, 0, 10)),
    ).toEqual({ from: '2025-12-12', to: '2026-01-10' });
  });

  /**
   * ⛔ La prova che inchioda la decisione: il registro NON si apre su tutta la storia.
   */
  it('⛔ il predefinito è delimitato, non «Tutti»', () => {
    expect(DEFAULT_MOVEMENT_PERIOD).toBe(MovementPeriodPreset.Last30Days);
    expect(resolveMovementPeriodRange(DEFAULT_MOVEMENT_PERIOD, '', '', REFERENCE)).toEqual({
      from: '2026-06-19',
      to: '2026-07-18',
    });
  });

  /*
    ── Oggi e Ieri, aggiunti il 06/09/2026 ──────────────────────────────────

    ⭐ **Passano dal fuso dell'ATTIVITÀ**, non da quello del browser: sono i due
    preset in cui un'ora di scarto cambia il giorno, e sono quelli su cui la
    Cassa si apre. Le attese sono assolute, quindi valgono sia sul corridore CI
    (UTC) sia sulla macchina di sviluppo (Europe/Rome).
  */
  it('⭐ Oggi e Ieri sono un giorno solo, con estremi uguali', () => {
    const meta = new Date('2026-07-18T10:00:00.000Z');
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Today, '', '', meta)).toEqual({
      from: '2026-07-18',
      to: '2026-07-18',
    });
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Yesterday, '', '', meta)).toEqual({
      from: '2026-07-17',
      to: '2026-07-17',
    });
  });

  it('⛔ a mezzanotte «Oggi» è il giorno di ROMA, non quello di UTC', () => {
    // 00:30 del 7 settembre a Roma è ancora il 6 per il fuso di Greenwich.
    const mezzanotte = new Date('2026-09-06T22:30:00.000Z');
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Today, '', '', mezzanotte)).toEqual({
      from: '2026-09-07',
      to: '2026-09-07',
    });
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Yesterday, '', '', mezzanotte)).toEqual({
      from: '2026-09-06',
      to: '2026-09-06',
    });
  });

  it('⭐ «Ieri» attraversa il cambio d’ora senza saltare un giorno', () => {
    // Il 25 ottobre 2026 dura 25 ore: «ieri» il 26 resta il 25.
    const dopoIlCambio = new Date('2026-10-26T09:00:00.000Z');
    expect(
      resolveMovementPeriodRange(MovementPeriodPreset.Yesterday, '', '', dopoIlCambio),
    ).toEqual({ from: '2026-10-25', to: '2026-10-25' });
    // Il 29 marzo 2026 dura 23 ore: «ieri» il 30 resta il 29.
    const dopoIlCambioPrimavera = new Date('2026-03-30T09:00:00.000Z');
    expect(
      resolveMovementPeriodRange(MovementPeriodPreset.Yesterday, '', '', dopoIlCambioPrimavera),
    ).toEqual({ from: '2026-03-29', to: '2026-03-29' });
  });

  /**
   * ⛔ **REGRESSIONE sui consumatori esistenti.** Documenti, Ordini cliente,
   * Ordini fornitore, Movimenti e Vendite online usano questo stesso risolutore:
   * l'aggiunta di due preset non deve spostare di un giorno nessuno degli altri.
   */
  it('⛔ gli altri preset non si spostano di un giorno', () => {
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Last7Days, '', '', REFERENCE)).toEqual({
      from: '2026-07-12',
      to: '2026-07-18',
    });
    expect(resolveMovementPeriodRange(MovementPeriodPreset.Last30Days, '', '', REFERENCE)).toEqual({
      from: '2026-06-19',
      to: '2026-07-18',
    });
    expect(resolveMovementPeriodRange(MovementPeriodPreset.ThisMonth, '', '', REFERENCE)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(resolveMovementPeriodRange(MovementPeriodPreset.All, '', '', REFERENCE)).toEqual({});
    expect(
      resolveMovementPeriodRange(
        MovementPeriodPreset.Custom,
        '2026-01-02',
        '2026-01-09',
        REFERENCE,
      ),
    ).toEqual({ from: '2026-01-02', to: '2026-01-09' });
  });
});
