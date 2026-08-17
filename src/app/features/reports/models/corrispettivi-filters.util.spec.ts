import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  CORRISPETTIVI_ORIGINI,
  corrispettiviFiltersToQuery,
  originiPerAmbito,
  parseCorrispettiviFilters,
} from './corrispettivi-filters.util';

/**
 * I filtri del Registro come INSIEMI (`docs/10` §16).
 *
 * ⚠️ Questi test presidiano tre difetti che **non si vedono**: un indirizzo
 * salvato che comincia a rendere più righe di prima, la stessa schermata
 * raggiungibile da due indirizzi diversi, e un «Tutti» che diventa «nessuna
 * riga». Nessuno dei tre produce un errore: l'applicazione continua a
 * funzionare, e risponde a una domanda diversa.
 */

function indirizzo(params: Record<string, string>) {
  return convertToParamMap(params);
}

describe('insieme vuoto = nessuna restrizione', () => {
  it('senza parametri i tre filtri sono vuoti, cioè «tutti»', () => {
    expect(parseCorrispettiviFilters(indirizzo({}))).toEqual({
      origini: [],
      tipi: [],
      sedi: [],
    });
  });

  /**
   * ⚠️ Altrimenti `origini=a,b,c,d` e l'assenza del parametro sarebbero due
   * scritture della stessa domanda — due indirizzi per la stessa schermata, che
   * è come nascono le divergenze fra elenco e stampa.
   */
  it('un insieme che contiene TUTTI i valori si normalizza a vuoto', () => {
    const filtri = parseCorrispettiviFilters(
      indirizzo({ origini: CORRISPETTIVI_ORIGINI.join(','), tipi: 'sales,returns,refunds' }),
    );

    expect(filtri.origini).toEqual([]);
    expect(filtri.tipi).toEqual([]);
  });

  it('i valori inventati non entrano nell’insieme', () => {
    const filtri = parseCorrispettiviFilters(
      indirizzo({ origini: 'store,inventata', tipi: 'boh' }),
    );

    expect(filtri.origini).toEqual(['store']);
    expect(filtri.tipi).toEqual([]);
  });
});

describe('compatibilità con i vecchi indirizzi', () => {
  /**
   * ⚠️ **Il difetto che questo test esiste per fermare.** Ambito e canale si
   * combinavano per INTERSEZIONE. Tradurli uno per uno e unire i risultati
   * darebbe {store, shopify_pos, manual_receipt, shopify_online} — quattro
   * origini invece di una, cioè un registro che mostra più righe di quelle che
   * l'indirizzo salvato descriveva. E nessun errore lo segnalerebbe.
   */
  it('ambito + canale si intersecano, non si uniscono', () => {
    const filtri = parseCorrispettiviFilters(
      indirizzo({ ambito: 'fisico_pos', canale: 'shopify' }),
    );

    expect(filtri.origini).toEqual(['shopify_pos']);
  });

  it('ambito da solo dà le origini di quell’ambito', () => {
    expect(parseCorrispettiviFilters(indirizzo({ ambito: 'online' })).origini).toEqual([
      'shopify_online',
    ]);
    expect(parseCorrispettiviFilters(indirizzo({ ambito: 'fisico_pos' })).origini).toEqual([
      'shopify_pos',
      'store',
      'manual_receipt',
    ]);
  });

  /**
   * ⚠️ Un indirizzo che si contraddice — ed erano filtri indipendenti, quindi
   * possibile. Prima rendeva zero righe; lasciarlo diventare l'insieme vuoto
   * direbbe il CONTRARIO, perché vuoto ora significa «tutti»: l'intero
   * registro dove prima non c'era niente. Vince il vincolo più fine.
   */
  it('un indirizzo contraddittorio non si allarga a «tutti»', () => {
    const filtri = parseCorrispettiviFilters(indirizzo({ ambito: 'online', origine: 'store' }));

    expect(filtri.origini).toEqual(['store']);
  });

  it('contraddizione fra ambito e canale: resta il canale, non tutto', () => {
    const filtri = parseCorrispettiviFilters(indirizzo({ ambito: 'online', canale: 'vestiflow' }));

    expect(filtri.origini).toEqual(['store', 'manual_receipt']);
  });

  /** `refundsOnly` era una congiunzione travestita da booleano. */
  it('refundsOnly diventa l’insieme {resi, rimborsi}', () => {
    expect(parseCorrispettiviFilters(indirizzo({ refundsOnly: 'true' })).tipi).toEqual([
      'returns',
      'refunds',
    ]);
  });

  it('rowType singolo diventa un insieme di uno', () => {
    expect(parseCorrispettiviFilters(indirizzo({ rowType: 'returns' })).tipi).toEqual(['returns']);
  });

  it('locationId diventa un insieme di una sede', () => {
    expect(parseCorrispettiviFilters(indirizzo({ locationId: 'loc-1' })).sedi).toEqual(['loc-1']);
  });

  it('il plurale vince sul vecchio parametro quando ci sono entrambi', () => {
    const filtri = parseCorrispettiviFilters(
      indirizzo({ origini: 'store', ambito: 'online', tipi: 'sales', rowType: 'returns' }),
    );

    expect(filtri.origini).toEqual(['store']);
    expect(filtri.tipi).toEqual(['sales']);
  });
});

describe('la domanda che parte verso l’API', () => {
  /**
   * ⚠️ Vuoto = filtro OMESSO, mai passato vuoto: su un `in: []` di Prisma
   * «vuoto» non significa «tutti», significa NIENTE.
   */
  it('gli insiemi vuoti non diventano un filtro', () => {
    expect(corrispettiviFiltersToQuery({ origini: [], tipi: [], sedi: [] })).toEqual({
      ambito: 'all',
      canale: 'all',
      origine: undefined,
      rowType: undefined,
      locationId: undefined,
    });
  });

  it('un insieme di uno viaggia come il vecchio parametro singolo', () => {
    expect(
      corrispettiviFiltersToQuery({ origini: ['store'], tipi: ['returns'], sedi: ['loc-1'] }),
    ).toEqual({
      ambito: 'fisico_pos',
      canale: 'vestiflow',
      origine: 'store',
      rowType: 'returns',
      locationId: 'loc-1',
    });
  });

  /**
   * L'unico insieme a due elementi raggiungibile oggi, e la ragione per cui la
   * traduzione all'indietro regge: si riscrive esattamente com'era.
   */
  it('{resi, rimborsi} non si spaccia per un tipo solo', () => {
    expect(
      corrispettiviFiltersToQuery({ origini: [], tipi: ['returns', 'refunds'], sedi: [] }).rowType,
    ).toBeUndefined();
  });

  it('andata e ritorno: un vecchio indirizzo torna la stessa domanda di prima', () => {
    const query = corrispettiviFiltersToQuery(
      parseCorrispettiviFilters(indirizzo({ ambito: 'fisico_pos', canale: 'shopify' })),
    );

    expect(query).toEqual({
      ambito: 'fisico_pos',
      canale: 'shopify',
      origine: 'shopify_pos',
      rowType: undefined,
      locationId: undefined,
    });
  });
});

describe('Ambito è una scorciatoia, non un filtro', () => {
  it('«Tutti» non restringe niente', () => {
    expect(originiPerAmbito('all')).toEqual([]);
  });

  it('le scorciatoie spuntano le origini del loro ambito', () => {
    expect(originiPerAmbito('online')).toEqual(['shopify_online']);
    // Il Corrispettivo manuale sta fra le fisiche: scelta di dominio (§16).
    expect(originiPerAmbito('fisico_pos')).toEqual(['shopify_pos', 'store', 'manual_receipt']);
  });
});
