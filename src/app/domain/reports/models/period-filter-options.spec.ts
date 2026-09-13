import { describe, expect, it } from 'vitest';

import {
  MOVEMENT_PERIOD_OPTIONS,
  MovementPeriodPreset,
  resolveMovementPeriodRange,
} from '@domain/inventory/models/movement-period.util';

import {
  REPORT_PERIOD_OPTIONS,
  ReportPeriodPreset,
  resolveReportDateRange,
} from './report-list-query.model';

/**
 * ⭐ **Il selettore condiviso non ha spostato un confine** (11/09/2026).
 *
 * _Il proprietario: «conserva i confini temporali attuali durante questa
 * migrazione … Le prove devono confrontare gli intervalli prima e dopo, non
 * soltanto l'aspetto del selettore»._
 *
 * Le voci passano ora da `app-period-filter`, ma ogni schermata le risolve col
 * proprio risolutore: qui si fissa, voce per voce e a una data di riferimento,
 * l'intervallo che ciascun modello dava PRIMA del componente — letto dal codice
 * il giorno stesso, con i risolutori non toccati. Se un giorno qualcuno
 * unificasse i due risolutori «per semplificare», questa tabella arrossa e dice
 * quale confine si è mosso.
 *
 * ⚠️ I due modelli NON coincidono, ed è voluto: giorno di attività contro giorno
 * UTC su Oggi/Ieri, mese di calendario intero contro «dal 1° a oggi», ora
 * locale contro UTC. Le differenze restano dichiarate in `docs/DA-FARE.md`.
 */
describe('le voci del selettore Periodo e i loro intervalli, invariati', () => {
  // Una data a metà mese, lontana da mezzanotte e dal cambio d'ora: i due
  // fusi (attività e UTC) danno lo stesso giorno, e la tabella resta leggibile.
  const RIFERIMENTO = new Date('2026-07-18T10:00:00.000Z');

  it('⭐ ogni voce dei MOVIMENTI risolve l’intervallo di prima (ora locale, giorno di attività)', () => {
    const intervalli = Object.fromEntries(
      MOVEMENT_PERIOD_OPTIONS.map((voce) => [
        voce.label,
        resolveMovementPeriodRange(
          voce.value as MovementPeriodPreset,
          '2026-07-01',
          '2026-07-10',
          RIFERIMENTO,
        ),
      ]),
    );
    expect(intervalli).toEqual({
      Tutti: {},
      Oggi: { from: '2026-07-18', to: '2026-07-18' },
      Ieri: { from: '2026-07-17', to: '2026-07-17' },
      'Ultimi 7 giorni': { from: '2026-07-12', to: '2026-07-18' },
      'Ultimi 30 giorni': { from: '2026-06-19', to: '2026-07-18' },
      'Mese corrente': { from: '2026-07-01', to: '2026-07-31' },
      'Mese scorso': { from: '2026-06-01', to: '2026-06-30' },
      'Anno corrente': { from: '2026-01-01', to: '2026-12-31' },
      'Anno scorso': { from: '2025-01-01', to: '2025-12-31' },
      Personalizzato: { from: '2026-07-01', to: '2026-07-10' },
    });
  });

  it('⭐ ogni voce dei REPORT risolve l’intervallo di prima (UTC, «finora» sui periodi correnti)', () => {
    const intervalli = Object.fromEntries(
      REPORT_PERIOD_OPTIONS.map((voce) => [
        voce.label,
        resolveReportDateRange(
          {
            period: voce.value as ReportPeriodPreset,
            dateFrom: '2026-07-01',
            dateTo: '2026-07-10',
            year: 2025,
            month: 3,
            quarter: 2,
          },
          RIFERIMENTO,
        ),
      ]),
    );
    expect(intervalli).toEqual({
      Oggi: { placedFrom: '2026-07-18', placedTo: '2026-07-18' },
      Ieri: { placedFrom: '2026-07-17', placedTo: '2026-07-17' },
      'Giorno specifico…': { placedFrom: '2026-07-01', placedTo: '2026-07-01' },
      'Ultimi 7 giorni': { placedFrom: '2026-07-12', placedTo: '2026-07-18' },
      'Ultimi 30 giorni': { placedFrom: '2026-06-19', placedTo: '2026-07-18' },
      'Mese corrente': { placedFrom: '2026-07-01', placedTo: '2026-07-18' },
      'Mese scorso': { placedFrom: '2026-06-01', placedTo: '2026-06-30' },
      'Anno corrente': { placedFrom: '2026-01-01', placedTo: '2026-07-18' },
      'Mese…': { placedFrom: '2025-03-01', placedTo: '2025-03-31' },
      'Trimestre…': { placedFrom: '2025-04-01', placedTo: '2025-06-30' },
      'Anno…': { placedFrom: '2025-01-01', placedTo: '2025-12-31' },
      Personalizzato: { placedFrom: '2026-07-01', placedTo: '2026-07-10' },
    });
  });

  /**
   * ⛔ Una voce che chiede un selettore senza che il risolutore lo legga — o il
   * contrario — è un controllo che mente: «Personalizzato» senza Dal/Al non si
   * può compilare, «Mese…» senza mese e anno risolve il mese corrente in silenzio.
   */
  it('i selettori a comparsa di ogni voce sono quelli che il suo risolutore legge', () => {
    const selettori = (voci: readonly { value: string; pickers?: readonly string[] }[]) =>
      Object.fromEntries(voci.filter((v) => v.pickers).map((v) => [v.value, [...v.pickers!]]));
    expect(selettori(MOVEMENT_PERIOD_OPTIONS)).toEqual({
      [MovementPeriodPreset.Custom]: ['range'],
    });
    expect(selettori(REPORT_PERIOD_OPTIONS)).toEqual({
      [ReportPeriodPreset.SpecificDay]: ['day'],
      [ReportPeriodPreset.CalendarMonth]: ['month', 'year'],
      [ReportPeriodPreset.CalendarQuarter]: ['quarter', 'year'],
      [ReportPeriodPreset.CalendarYear]: ['year'],
      [ReportPeriodPreset.Custom]: ['range'],
    });
  });

  it('⚠️ i due modelli condividono i valori di URL delle voci comuni: un collegamento salvato resta valido', () => {
    const comuni = ['today', 'yesterday', '7d', '30d', 'month', 'last_month', 'year', 'custom'];
    const valoriMovimenti = new Set(MOVEMENT_PERIOD_OPTIONS.map((v) => v.value));
    const valoriReport = new Set(REPORT_PERIOD_OPTIONS.map((v) => v.value));
    for (const valore of comuni) {
      expect(valoriMovimenti.has(valore), valore).toBe(true);
      expect(valoriReport.has(valore), valore).toBe(true);
    }
  });
});
