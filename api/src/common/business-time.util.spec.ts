import { describe, expect, it } from 'vitest';

import {
  annoDiAttivita,
  dataCivile,
  giornoDiAttivita,
  giornoSuccessivo,
  inizioGiornoDiAttivita,
  intervalloDiGiorni,
} from './business-time.util';

/**
 * ⛔ **Queste prove valgono solo se sono INDIPENDENTI dal fuso del processo**,
 * ed è la proprietà che devono dimostrare prima di ogni altra.
 *
 * ⭐ **La dimostrazione è che passano in due posti diversi**: il corridore
 * GitHub gira in **UTC**, la macchina di sviluppo in **Europe/Rome**. Le attese
 * qui sotto sono valori assoluti: se il codice leggesse `TZ` del processo, una
 * delle due esecuzioni sarebbe rossa.
 *
 * ⚠️ Per la stessa ragione non si usa `new Date(anno, mese, giorno)` né
 * `toISOString().slice(0, 10)` nemmeno nelle attese: entrambi passano per il
 * fuso locale, e proverebbero il codice contro sé stesso.
 */
describe('business-time — il giorno dell’attività', () => {
  it('la mezzanotte di Roma cambia giorno, quella di Greenwich no', () => {
    // 00:30 del 7 settembre a Roma (CEST, +2) è ancora il 6 in UTC.
    expect(giornoDiAttivita(new Date('2026-09-06T22:30:00.000Z'))).toBe('2026-09-07');
    // Un minuto prima è ancora il 6: 23:59 locali.
    expect(giornoDiAttivita(new Date('2026-09-06T21:59:00.000Z'))).toBe('2026-09-06');
    // E a metà giornata i due fusi concordano.
    expect(giornoDiAttivita(new Date('2026-09-06T12:00:00.000Z'))).toBe('2026-09-06');
  });

  it('il cambio d’ANNO segue Roma, non UTC', () => {
    // 00:30 del 1º gennaio a Roma (CET, +1) è il 31 dicembre in UTC.
    const capodanno = new Date('2026-12-31T23:30:00.000Z');
    expect(giornoDiAttivita(capodanno)).toBe('2027-01-01');
    // ⭐ È l'anno che finisce nella SERIE di numerazione.
    expect(annoDiAttivita(giornoDiAttivita(capodanno))).toBe(2027);
    // Un'ora prima si è ancora nel 2026, e la serie è quella vecchia.
    const primaDi = new Date('2026-12-31T22:30:00.000Z');
    expect(giornoDiAttivita(primaDi)).toBe('2026-12-31');
    expect(annoDiAttivita(giornoDiAttivita(primaDi))).toBe(2026);
  });

  it('l’inizio del giorno è la mezzanotte di Roma, con l’ora legale giusta', () => {
    // Inverno: Roma è +1.
    expect(inizioGiornoDiAttivita('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    // Estate: Roma è +2.
    expect(inizioGiornoDiAttivita('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  /**
   * ⭐ **A dare 23 o 25 ore è il calcolo NEL FUSO**, non la forma
   * dell'intervallo: gli estremi sono due mezzanotti civili, e la distanza fra
   * loro è quella che il calendario dice. Un intervallo chiuso costruito sugli
   * stessi confini coprirebbe le stesse ore.
   */
  it('⛔ il giorno del cambio d’ora NON dura 24 ore, e i confini lo riflettono', () => {
    // 29 marzo 2026: alle 02:00 locali si va alle 03:00. Il giorno dura 23 ore.
    const inizioMarzo = inizioGiornoDiAttivita('2026-03-29');
    const fineMarzo = inizioGiornoDiAttivita(giornoSuccessivo('2026-03-29'));
    expect(inizioMarzo.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(fineMarzo.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect((fineMarzo.getTime() - inizioMarzo.getTime()) / 3_600_000).toBe(23);

    // 25 ottobre 2026: alle 03:00 locali si torna alle 02:00. Il giorno dura 25 ore.
    const inizioOttobre = inizioGiornoDiAttivita('2026-10-25');
    const fineOttobre = inizioGiornoDiAttivita(giornoSuccessivo('2026-10-25'));
    expect(inizioOttobre.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(fineOttobre.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect((fineOttobre.getTime() - inizioOttobre.getTime()) / 3_600_000).toBe(25);
  });

  it('il giorno successivo attraversa cambio d’ora, fine mese e fine anno', () => {
    expect(giornoSuccessivo('2026-03-29')).toBe('2026-03-30');
    expect(giornoSuccessivo('2026-10-25')).toBe('2026-10-26');
    expect(giornoSuccessivo('2026-02-28')).toBe('2026-03-01');
    expect(giornoSuccessivo('2028-02-28')).toBe('2028-02-29'); // bisestile
    expect(giornoSuccessivo('2026-12-31')).toBe('2027-01-01');
  });

  it('⭐ l’intervallo è [inizio, inizio del giorno dopo), e i giorni COMBACIANO', () => {
    // Il confine superiore di un giorno è il confine inferiore del successivo:
    // niente vuoti, niente sovrapposizioni. È la proprietà che la forma
    // semiaperta dà e quella chiusa no.
    const sei = intervalloDiGiorni('2026-09-06', '2026-09-06')!;
    const sette = intervalloDiGiorni('2026-09-07', '2026-09-07')!;
    expect(sei.lt!.getTime()).toBe(sette.gte!.getTime());
  });

  it('⭐ l’estremo superiore non dipende dalla risoluzione della colonna', () => {
    const solo7 = intervalloDiGiorni('2026-09-07', '2026-09-07')!;
    expect(solo7.gte!.toISOString()).toBe('2026-09-06T22:00:00.000Z');
    expect(solo7.lt!.toISOString()).toBe('2026-09-07T22:00:00.000Z');

    // ⛔ La vendita delle 00:30 locali del 7 — quella che prima finiva «al 6» —
    //    cade dentro l'intervallo del 7.
    const vendita = new Date('2026-09-06T22:30:00.000Z');
    expect(vendita >= solo7.gte!).toBe(true);
    expect(vendita < solo7.lt!).toBe(true);

    /*
      ⭐ **Il punto della forma semiaperta.** PostgreSQL memorizza i timestamp
      al MICROSECONDO: un estremo chiuso a `23:59:59.999` scarterebbe in
      silenzio gli ultimi 999 µs del giorno. Qui l'estremo è l'inizio del
      giorno dopo, quindi non c'è nessuna risoluzione da indovinare — e
      qualunque istante prima di quel confine appartiene al giorno chiesto.
    */
    const ultimoIstante = new Date(solo7.lt!.getTime() - 1);
    expect(giornoDiAttivita(ultimoIstante)).toBe('2026-09-07');
  });

  it('estremi facoltativi: nessuno dei due significa nessun vincolo', () => {
    expect(intervalloDiGiorni()).toBeUndefined();
    expect(intervalloDiGiorni('2026-09-07')).toEqual({
      gte: new Date('2026-09-06T22:00:00.000Z'),
    });
    expect(intervalloDiGiorni(undefined, '2026-09-07')).toEqual({
      lt: new Date('2026-09-07T22:00:00.000Z'),
    });
  });

  it('⛔ per una colonna DATE la mezzanotte giusta è UTC, non quella di Roma', () => {
    // La colonna `@db.Date` non ha ora né fuso: PostgreSQL prende la parte UTC.
    expect(dataCivile('2026-09-07').toISOString()).toBe('2026-09-07T00:00:00.000Z');
    expect(dataCivile('2027-01-01').toISOString()).toBe('2027-01-01T00:00:00.000Z');

    /*
      ⛔ **La confusione che questa prova impedisce.** Passare a una colonna
      DATE l'inizio del giorno di Roma la archivierebbe col giorno PRIMA: è il
      difetto di partenza, con un travestimento nuovo.
    */
    const inizioRoma = inizioGiornoDiAttivita('2026-09-07');
    expect(inizioRoma.toISOString().slice(0, 10)).toBe('2026-09-06');
    expect(dataCivile('2026-09-07').toISOString().slice(0, 10)).toBe('2026-09-07');
    expect(inizioRoma.getTime()).not.toBe(dataCivile('2026-09-07').getTime());
  });

  it('⭐ vendita a mezzanotte: giorno, anno di numerazione e colonna DATE concordano', () => {
    // 00:30 del 1º gennaio a Roma: l'istante è ancora nel 2026 per UTC.
    const istante = new Date('2026-12-31T23:30:00.000Z');
    const giorno = giornoDiAttivita(istante);

    expect(giorno).toBe('2027-01-01');
    expect(annoDiAttivita(giorno)).toBe(2027);
    expect(dataCivile(giorno).toISOString()).toBe('2027-01-01T00:00:00.000Z');

    // ⚠️ E l'ISTANTE resta l'istante: non viene sostituito da una mezzanotte.
    expect(istante.toISOString()).toBe('2026-12-31T23:30:00.000Z');
  });

  it('un giorno malformato si rifiuta invece di scivolare a una data qualunque', () => {
    expect(() => dataCivile('07/09/2026')).toThrow(RangeError);
    expect(() => inizioGiornoDiAttivita('07/09/2026')).toThrow(RangeError);
    expect(() => inizioGiornoDiAttivita('2026-9-7')).toThrow(RangeError);
    expect(() => inizioGiornoDiAttivita('')).toThrow(RangeError);
  });
});
