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
      nessunRisultato: false,
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
   * ⚠️ **Il caso che distingue «nessun risultato» da «nessuna restrizione».**
   *
   * Ambito e origine erano filtri indipendenti, quindi potevano negarsi:
   * `?ambito=online&origine=store` rendeva **zero righe**. Riportarlo come
   * insieme vuoto direbbe il contrario — «tutti» — e far vincere il vincolo
   * più fine darebbe tutte le Vendite al banco: in un caso più righe di prima,
   * nell'altro pure. La compatibilità è proprio ciò che si sta preservando.
   */
  it('un indirizzo contraddittorio resta a zero righe, come prima', () => {
    const filtri = parseCorrispettiviFilters(indirizzo({ ambito: 'online', origine: 'store' }));

    expect(filtri.nessunRisultato).toBe(true);
    // E la domanda che parte porta due vincoli che si negano: l'intersezione
    // che l'API già calcola resta vuota, com'era.
    const query = corrispettiviFiltersToQuery(filtri);
    expect(query.ambito).toBe('online');
    expect(query.origine).toBe('store');
  });

  it('contraddizione fra ambito e canale: anche quella è zero righe', () => {
    const filtri = parseCorrispettiviFilters(indirizzo({ ambito: 'online', canale: 'vestiflow' }));

    expect(filtri.nessunRisultato).toBe(true);
  });

  /** ⚠️ Un filtro che semplicemente non restringe NON è una contraddizione. */
  it('senza vincoli non c’è nessuna contraddizione da segnalare', () => {
    expect(parseCorrispettiviFilters(indirizzo({})).nessunRisultato).toBe(false);
    expect(
      parseCorrispettiviFilters(indirizzo({ ambito: 'all', canale: 'all' })).nessunRisultato,
    ).toBe(false);
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
    expect(
      corrispettiviFiltersToQuery({ origini: [], tipi: [], sedi: [], nessunRisultato: false }),
    ).toEqual({
      ambito: 'all',
      canale: 'all',
      origine: undefined,
      rowType: undefined,
      locationId: undefined,
    });
  });

  it('un insieme di uno viaggia come il vecchio parametro singolo', () => {
    expect(
      corrispettiviFiltersToQuery({
        origini: ['store'],
        tipi: ['returns'],
        sedi: ['loc-1'],
        nessunRisultato: false,
      }),
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
      corrispettiviFiltersToQuery({
        origini: [],
        tipi: ['returns', 'refunds'],
        sedi: [],
        nessunRisultato: false,
      }).rowType,
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

describe('«tutti» e «niente» non condividono mai la stessa scrittura', () => {
  /**
   * ⚠️ Le due righe di questa tabella sono la ragione d'essere di
   * `nessunRisultato`. Se un giorno collassassero — se «nessun risultato»
   * tornasse a essere un insieme vuoto — il Registro mostrerebbe TUTTO dove
   * deve mostrare niente, e nessun errore lo segnalerebbe.
   */
  it('nessun filtro chiede tutte le righe; la contraddizione non ne chiede nessuna', () => {
    const tutti = parseCorrispettiviFilters(indirizzo({}));
    const niente = parseCorrispettiviFilters(indirizzo({ ambito: 'online', origine: 'store' }));

    expect(tutti.origini).toEqual([]);
    expect(tutti.nessunRisultato).toBe(false);

    // Stesso insieme vuoto di origini, significato opposto: a distinguerli è
    // **solo** il flag. È il motivo per cui non può sparire nel plurale.
    expect(niente.origini).toEqual([]);
    expect(niente.nessunRisultato).toBe(true);
  });

  /**
   * I filtri normali non producono mai un insieme vuoto verso l'API: o portano
   * un valore, o non compaiono. `in: []` in Prisma non è «tutti», è «niente».
   */
  it('nessun filtro normale genera un insieme vuoto sul filo', () => {
    const casi = [
      indirizzo({}),
      indirizzo({ origini: CORRISPETTIVI_ORIGINI.join(',') }),
      indirizzo({ tipi: 'sales,returns,refunds' }),
      indirizzo({ origini: 'store', tipi: 'sales', sedi: 'loc-1' }),
    ];

    for (const params of casi) {
      const filtri = parseCorrispettiviFilters(params);
      if (filtri.nessunRisultato) continue;

      for (const valore of Object.values(corrispettiviFiltersToQuery(filtri))) {
        expect(Array.isArray(valore) && valore.length === 0).toBe(false);
      }
    }
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
