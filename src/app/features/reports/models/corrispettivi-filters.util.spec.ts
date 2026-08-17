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
    // ⚠️ Verso l'API viaggia il FLAG, non un insieme vuoto: sono i due stati
    // opposti, e l'array vuoto significa già «tutti». A tradurlo in «nessuna
    // riga» è l'API, all'ultimo passo prima del database.
    const query = corrispettiviFiltersToQuery(filtri);
    expect(query.nessunRisultato).toBe(true);
    expect(query.origini).toBeUndefined();
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
      origini: undefined,
      tipi: undefined,
      sedi: undefined,
      nessunRisultato: undefined,
    });
  });

  it('gli insiemi pieni viaggiano tali e quali', () => {
    expect(
      corrispettiviFiltersToQuery({
        origini: ['store', 'manual_receipt'],
        tipi: ['returns', 'refunds'],
        sedi: ['loc-1', 'loc-2'],
        nessunRisultato: false,
      }),
    ).toEqual({
      origini: ['store', 'manual_receipt'],
      tipi: ['returns', 'refunds'],
      sedi: ['loc-1', 'loc-2'],
      nessunRisultato: undefined,
    });
  });

  /**
   * ⚠️ Il difetto che la traduzione all'indietro avrebbe prodotto, e che ora è
   * impossibile: `{shopify_pos, store}` non condivide un canale, quindi coi
   * vecchi parametri singolari sarebbe uscito «canale: all» — cioè un registro
   * che mostra anche il Corrispettivo manuale, in silenzio.
   */
  it('un insieme che i vecchi parametri non sapevano dire viaggia intero', () => {
    expect(
      corrispettiviFiltersToQuery({
        origini: ['shopify_pos', 'store'],
        tipi: [],
        sedi: [],
        nessunRisultato: false,
      }).origini,
    ).toEqual(['shopify_pos', 'store']);
  });

  it('un vecchio indirizzo arriva all’API come l’insieme che descriveva', () => {
    const query = corrispettiviFiltersToQuery(
      parseCorrispettiviFilters(indirizzo({ ambito: 'fisico_pos', canale: 'shopify' })),
    );

    expect(query).toEqual({
      origini: ['shopify_pos'],
      tipi: undefined,
      sedi: undefined,
      nessunRisultato: undefined,
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

/**
 * ⚠️ **Dalla nuova interfaccia `nessunRisultato` non è più producibile**
 * (`docs/10` §16, passo 5 del blocco A).
 *
 * Quello stato nasce da una CONTRADDIZIONE fra `ambito`, `canale` e `origine`,
 * che erano tre vincoli indipendenti. La schermata ora scrive **un insieme
 * solo** — e cancella i vecchi parametri quando tocca un filtro — quindi non
 * c'è più niente con cui contraddirsi.
 *
 * Questi test misurano la proprietà sul PARSER: qualunque indirizzo fatto di
 * soli parametri plurali dà `nessunRisultato: false`. È la metà verificabile
 * qui; l'altra — che la schermata scriva solo quelli — sta nel suo componente.
 */
describe('la nuova interfaccia non può produrre «nessun risultato»', () => {
  const PLURALI: Record<string, string>[] = [
    {},
    { origini: 'store' },
    { origini: 'store,manual_receipt' },
    { origini: CORRISPETTIVI_ORIGINI.join(',') },
    { tipi: 'returns' },
    { tipi: 'sales,returns,refunds' },
    { sedi: 'loc-1,loc-2' },
    { origini: 'shopify_pos,store', tipi: 'returns,refunds', sedi: 'loc-1' },
    // Anche un insieme di origini che nessun ambito descrive: è proprio il
    // caso che i vecchi parametri non sapevano esprimere.
    { origini: 'shopify_online,store' },
  ];

  it('nessuna combinazione di insiemi genera lo stato contraddittorio', () => {
    for (const params of PLURALI) {
      expect(parseCorrispettiviFilters(indirizzo(params)).nessunRisultato).toBe(false);
    }
  });

  it('valori inventati negli insiemi non lo generano: si scartano e basta', () => {
    // ⚠️ La differenza con i vecchi parametri: lì un vincolo non soddisfatto
    // significava «zero righe», qui una voce inesistente esce dall'insieme e
    // ciò che resta continua a valere.
    const filtri = parseCorrispettiviFilters(indirizzo({ origini: 'inventata', tipi: 'boh' }));

    expect(filtri.nessunRisultato).toBe(false);
    expect(filtri.origini).toEqual([]);
  });

  it('lo stato resta raggiungibile SOLO dai vecchi indirizzi', () => {
    // È l'altra faccia: finché i vecchi collegamenti devono funzionare, il
    // campo serve. Sparirà con loro, non prima.
    expect(
      parseCorrispettiviFilters(indirizzo({ ambito: 'online', origine: 'store' })).nessunRisultato,
    ).toBe(true);
  });
});
