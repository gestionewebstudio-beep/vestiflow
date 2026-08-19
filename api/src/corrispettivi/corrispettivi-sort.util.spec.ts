import { describe, expect, it } from 'vitest';

import {
  compareCorrispettiviRowsAsc,
  compareCorrispettiviRowsDesc,
  type CorrispettivoSortable,
} from './corrispettivi-sort.util';

/**
 * L'ordine canonico del Registro (17/08/2026).
 *
 * ⚠️ **Il difetto che questi test presidiano non era un ordine brutto: era un
 * ordine INESISTENTE.** Due sorgenti su quattro portano una data economica
 * `DATE`, che letta come `DateTime` è mezzanotte: due Corrispettivi manuali
 * dello stesso giorno pareggiavano, `Array.sort` lasciava l'ordine di
 * concatenazione delle quattro query, e quell'ordine il database non lo
 * garantisce. Lo stesso periodo poteva tornare diverso a ogni caricamento.
 */

/** Una riga del canale: data economica e istante coincidono. */
function canale(rowId: string, istante: string): CorrispettivoSortable {
  return { rowId, occurredAt: new Date(istante), eventAt: new Date(istante) };
}

/** Una riga a data-giorno (banco, manuale): mezzanotte più l'istante vero. */
function aGiorno(rowId: string, giorno: string, registrata: string): CorrispettivoSortable {
  return {
    rowId,
    occurredAt: new Date(`${giorno}T00:00:00.000Z`),
    eventAt: new Date(registrata),
  };
}

describe('ordine canonico — primo livello: il GIORNO economico', () => {
  it('i giorni scendono, e le righe di uno stesso giorno restano contigue', () => {
    const righe = [
      canale('sale:a', '2026-08-16T09:00:00.000Z'),
      aGiorno('manual:b', '2026-08-17', '2026-08-17T18:10:00.000Z'),
      canale('sale:c', '2026-08-17T14:32:00.000Z'),
      aGiorno('store:d', '2026-08-16', '2026-08-16T19:02:00.000Z'),
    ];

    const ordinate = [...righe].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId);

    // 17 agosto prima del 16, e le due righe del 17 attaccate fra loro: è ciò
    // che permetterà i subtotali giornalieri senza toccare la semantica.
    expect(ordinate).toEqual(['manual:b', 'sale:c', 'store:d', 'sale:a']);
  });

  /**
   * ⚠️ È la ragione per cui il primo livello è il giorno e non l'istante. Con
   * l'istante grezzo, `manual:b` — registrato alle 18:10 — sarebbe finito
   * **sotto** la vendita delle 14:32, perché la sua data economica è una
   * mezzanotte. Un artefatto del tipo di colonna, presentato come ordine dei
   * fatti.
   */
  it('una riga a data-giorno non finisce in fondo al suo giorno per via della mezzanotte', () => {
    const manuale = aGiorno('manual:b', '2026-08-17', '2026-08-17T18:10:00.000Z');
    const vendita = canale('sale:c', '2026-08-17T14:32:00.000Z');

    expect([vendita, manuale].sort(compareCorrispettiviRowsDesc)[0]!.rowId).toBe('manual:b');
  });
});

describe('ordine canonico — secondo livello: l’istante reale', () => {
  /** L'anomalia misurata a schermo: il n. 1 compariva prima del n. 2. */
  it('due registrazioni dello stesso giorno seguono l’istante di salvataggio', () => {
    const primo = aGiorno('manual:uno', '2026-08-17', '2026-08-17T17:55:00.000Z');
    const secondo = aGiorno('manual:due', '2026-08-17', '2026-08-17T18:10:00.000Z');

    // In ingresso nell'ordine sbagliato: è il comparatore a doverli sistemare,
    // non l'ordine in cui il database li ha resi.
    expect([primo, secondo].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId)).toEqual([
      'manual:due',
      'manual:uno',
    ]);
  });

  it('vendita e sua rettifica dello stesso giorno seguono l’ora reale, senza priorità di tipo', () => {
    const vendita = canale('sale:x', '2026-08-14T10:00:00.000Z');
    const reso = canale('refund:x', '2026-08-14T16:30:00.000Z');

    // Il reso è dopo perché è avvenuto dopo — non perché «i resi vanno sopra».
    expect([vendita, reso].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId)).toEqual([
      'refund:x',
      'sale:x',
    ]);
    // E invertendo gli istanti si inverte l'esito: nessuna gerarchia fra tipi.
    const resoPrima = canale('refund:y', '2026-08-14T08:00:00.000Z');
    const venditaDopo = canale('sale:y', '2026-08-14T11:00:00.000Z');
    expect([resoPrima, venditaDopo].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId)).toEqual([
      'sale:y',
      'refund:y',
    ]);
  });
});

describe('ordine canonico — terzo livello: stabilità', () => {
  /**
   * Il caso reale: righe importate dalla stessa sincronizzazione, con lo stesso
   * `createdAt` al millisecondo. Senza un terzo livello l'ordine ricadrebbe su
   * quello dell'array, che è quello delle query.
   */
  it('a parità di giorno E istante l’ordine è comunque sempre lo stesso', () => {
    const a = aGiorno('manual:aaa', '2026-08-17', '2026-08-17T18:10:00.000Z');
    const b = aGiorno('manual:bbb', '2026-08-17', '2026-08-17T18:10:00.000Z');

    expect([a, b].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId)).toEqual([
      'manual:aaa',
      'manual:bbb',
    ]);
    // ⚠️ Il punto: partendo dall'ordine OPPOSTO si arriva allo stesso risultato.
    // È questo che rende due caricamenti identici.
    expect([b, a].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId)).toEqual([
      'manual:aaa',
      'manual:bbb',
    ]);
  });

  it('lo stesso insieme, mescolato, dà sempre la stessa sequenza', () => {
    const righe = [
      canale('sale:a', '2026-08-16T09:00:00.000Z'),
      aGiorno('manual:b', '2026-08-17', '2026-08-17T18:10:00.000Z'),
      canale('sale:c', '2026-08-17T14:32:00.000Z'),
      aGiorno('store:d', '2026-08-16', '2026-08-16T19:02:00.000Z'),
      aGiorno('manual:e', '2026-08-17', '2026-08-17T17:55:00.000Z'),
    ];
    const atteso = [...righe].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId);

    // Sei permutazioni diverse dello stesso insieme: la sequenza non cambia.
    for (let taglio = 0; taglio < righe.length; taglio += 1) {
      const mescolate = [...righe.slice(taglio), ...righe.slice(0, taglio)];
      expect(mescolate.sort(compareCorrispettiviRowsDesc).map((r) => r.rowId)).toEqual(atteso);
    }
    expect([...righe].reverse().sort(compareCorrispettiviRowsDesc).map((r) => r.rowId)).toEqual(
      atteso,
    );
  });
});

describe('ordine canonico — il verso crescente dell’export', () => {
  /**
   * Il file per il commercialista si legge dal primo giorno, ma deve contenere
   * **le stesse righe nello stesso ordine relativo** di ciò che si è guardato:
   * un registro che si riconcilia col proprio riepilogo non può riordinarsi
   * strada facendo.
   */
  it('è l’inverso esatto del decrescente, riga per riga', () => {
    const righe = [
      canale('sale:a', '2026-08-16T09:00:00.000Z'),
      aGiorno('manual:b', '2026-08-17', '2026-08-17T18:10:00.000Z'),
      canale('sale:c', '2026-08-17T14:32:00.000Z'),
      aGiorno('store:d', '2026-08-16', '2026-08-16T19:02:00.000Z'),
    ];

    const desc = [...righe].sort(compareCorrispettiviRowsDesc).map((r) => r.rowId);
    const asc = [...righe].sort(compareCorrispettiviRowsAsc).map((r) => r.rowId);

    expect(asc).toEqual([...desc].reverse());
  });

  it('anche crescente è stabile: partendo mescolato dà la stessa sequenza', () => {
    const a = aGiorno('manual:aaa', '2026-08-17', '2026-08-17T18:10:00.000Z');
    const b = aGiorno('manual:bbb', '2026-08-17', '2026-08-17T18:10:00.000Z');

    expect([a, b].sort(compareCorrispettiviRowsAsc).map((r) => r.rowId)).toEqual([
      'manual:aaa',
      'manual:bbb',
    ]);
    expect([b, a].sort(compareCorrispettiviRowsAsc).map((r) => r.rowId)).toEqual([
      'manual:aaa',
      'manual:bbb',
    ]);
  });
});
