import { describe, expect, it } from 'vitest';

import { giornoDiAttivita, giornoDiAttivitaSpostato } from './business-day.util';

/**
 * ⛔ **Le attese sono ASSOLUTE**, e devono restare tali: se il codice leggesse
 * il fuso del browser, il corridore CI (UTC) e la macchina di sviluppo
 * (Europe/Rome) darebbero risultati diversi e una delle due esecuzioni sarebbe
 * rossa. È la stessa proprietà che prova `business-time.util.spec.ts` sull'API,
 * e le due devono concordare: è quello il punto.
 */
describe('business-day — «oggi» è quello dell’attività', () => {
  it('la mezzanotte di Roma cambia giorno, quella del browser no', () => {
    // 00:30 del 7 settembre a Roma (CEST, +2) è ancora il 6 in UTC.
    expect(giornoDiAttivita(new Date('2026-09-06T22:30:00.000Z'))).toBe('2026-09-07');
    expect(giornoDiAttivita(new Date('2026-09-06T21:59:00.000Z'))).toBe('2026-09-06');
    // Inverno: Roma è +1.
    expect(giornoDiAttivita(new Date('2026-01-14T23:30:00.000Z'))).toBe('2026-01-15');
    expect(giornoDiAttivita(new Date('2026-01-14T22:30:00.000Z'))).toBe('2026-01-14');
  });

  it('«ieri» attraversa mese, anno e cambio d’ora', () => {
    const ieriDi = (istante: string) => giornoDiAttivitaSpostato(-1, new Date(istante));
    expect(ieriDi('2026-09-07T10:00:00.000Z')).toBe('2026-09-06');
    expect(ieriDi('2026-03-01T10:00:00.000Z')).toBe('2026-02-28');
    expect(ieriDi('2027-01-01T10:00:00.000Z')).toBe('2026-12-31');
    // 30 marzo: il giorno prima è il 29, che dura 23 ore.
    expect(ieriDi('2026-03-30T10:00:00.000Z')).toBe('2026-03-29');
    // 26 ottobre: il giorno prima è il 25, che dura 25 ore.
    expect(ieriDi('2026-10-26T10:00:00.000Z')).toBe('2026-10-25');
  });

  it('⛔ «ieri» chiesto a mezzanotte non salta un giorno', () => {
    // 00:30 del 7 a Roma: «ieri» è il 6, non il 5.
    expect(giornoDiAttivitaSpostato(-1, new Date('2026-09-06T22:30:00.000Z'))).toBe('2026-09-06');
    // E nella notte del cambio d'ora, quando il giorno prima dura 25 ore.
    expect(giornoDiAttivitaSpostato(-1, new Date('2026-10-25T23:30:00.000Z'))).toBe('2026-10-25');
  });

  it('spostamento zero è oggi', () => {
    const istante = new Date('2026-09-06T22:30:00.000Z');
    expect(giornoDiAttivitaSpostato(0, istante)).toBe(giornoDiAttivita(istante));
  });
});
