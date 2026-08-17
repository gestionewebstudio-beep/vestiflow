import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';

import {
  corrispettiviFiltersToQuery,
  parseCorrispettiviFilters,
} from './corrispettivi-filters.util';

/**
 * I filtri del Registro Corrispettivi, letti in un punto solo.
 *
 * ⚠️ Il difetto che questa util chiude: la schermata passava quattro filtri
 * nell'indirizzo dell'anteprima di stampa, e l'anteprima ne leggeva **zero** —
 * più un `onlineOnly` che nessuno mandava e che l'API non conosce. Il foglio
 * rispondeva a una domanda diversa da quella a schermo, e sembrava giusto.
 */
describe('parseCorrispettiviFilters', () => {
  it('legge i cinque filtri dall’indirizzo', () => {
    const filters = parseCorrispettiviFilters(
      convertToParamMap({
        ambito: 'fisico_pos',
        canale: 'vestiflow',
        origine: 'manual_receipt',
        rowType: 'returns',
        locationId: 'loc-1',
      }),
    );

    expect(filters).toEqual({
      ambito: 'fisico_pos',
      canale: 'vestiflow',
      origine: 'manual_receipt',
      rowType: 'returns',
      locationId: 'loc-1',
    });
  });

  /**
   * ⚠️ **`canale` si legge ancora, anche se il chip non c'è più.**
   *
   * È stato tolto dalla barra filtri il 17/08/2026 perché ridondante — l'origine
   * lo determina già per intero — ma resta nel modello, nell'API e
   * nell'indirizzo: un collegamento salvato con `canale=shopify`, o una stampa
   * aperta da un URL vecchio, deve continuare a filtrare come prima. Togliere la
   * lettura sarebbe stato ridefinire il dato, non semplificare la UI.
   */
  it('«canale» continua a valere dall’indirizzo anche senza il suo chip', () => {
    expect(parseCorrispettiviFilters(convertToParamMap({ canale: 'shopify' })).canale).toBe(
      'shopify',
    );
  });

  it('«all» è il predefinito di tutti e cinque', () => {
    expect(parseCorrispettiviFilters(convertToParamMap({}))).toEqual({
      ambito: 'all',
      canale: 'all',
      origine: 'all',
      rowType: 'all',
      locationId: 'all',
    });
  });

  it('un valore inventato ricade su «all», non passa all’API', () => {
    // Un indirizzo si modifica a mano: `ambito=qualsiasi` non deve arrivare
    // fino al DTO dell'API per farsi rifiutare con un 400.
    const filters = parseCorrispettiviFilters(
      convertToParamMap({ ambito: 'qualsiasi', canale: 'tiktok', rowType: 'boh' }),
    );

    expect(filters.ambito).toBe('all');
    expect(filters.canale).toBe('all');
    expect(filters.rowType).toBe('all');
  });
});

describe('corrispettiviFiltersToQuery', () => {
  it('traduce «all» in assenza dove l’API la pretende', () => {
    const query = corrispettiviFiltersToQuery({
      ambito: 'all',
      canale: 'all',
      origine: 'all',
      rowType: 'all',
      locationId: 'all',
    });

    // Ambito e canale restano «all»: è un valore legittimo, e `buildParams` lo
    // omette da sé. Origine, tipo e sede no — «all» non è un id di sede.
    expect(query).toEqual({
      ambito: 'all',
      canale: 'all',
      origine: undefined,
      rowType: undefined,
      locationId: undefined,
    });
  });

  it('porta i filtri veri così come sono', () => {
    expect(
      corrispettiviFiltersToQuery({
        ambito: 'fisico_pos',
        canale: 'vestiflow',
        origine: 'manual_receipt',
        rowType: 'returns',
        locationId: 'loc-1',
      }),
    ).toEqual({
      ambito: 'fisico_pos',
      canale: 'vestiflow',
      origine: 'manual_receipt',
      rowType: 'returns',
      locationId: 'loc-1',
    });
  });
});
