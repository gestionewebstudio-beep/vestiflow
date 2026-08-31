import { describe, expect, it } from 'vitest';

import {
  applicaFiltriDiColonna,
  countActiveColumnFilters,
  isColumnFilterActive,
  valoriDistinti,
} from './column-filter.model';
import type { ColumnFilterState } from './column-filter.model';

interface Riga {
  readonly id: string;
  readonly stato: string;
  readonly nome: string;
  readonly totale: number;
}

const RIGHE: readonly Riga[] = [
  { id: 'a', stato: 'Confermato', nome: 'Maglia cotone', totale: 1000 },
  { id: 'b', stato: 'Bozza', nome: 'Àncora blu', totale: -500 },
  { id: 'c', stato: 'Confermato', nome: 'Zoccolo', totale: 250 },
  { id: 'd', stato: 'Annullato', nome: 'maglia lana', totale: 0 },
];

const cellText = (r: Riga, id: string): string =>
  id === 'stato' ? r.stato : id === 'nome' ? r.nome : String(r.totale);

const numeroDi = (r: Riga, id: string): number | null => (id === 'totale' ? r.totale : null);

const ids = (righe: readonly Riga[]): string[] => righe.map((r) => r.id);

describe('un filtro è ATTIVO solo se restringe', () => {
  /*
    ⛔ **Il vuoto è «nessun filtro», non «valore vuoto».** Confonderli renderebbe
    impossibile togliere un filtro: il controllo resterebbe acceso e vuoto, e
    l'elenco tornerebbe zero righe.
  */
  it('⛔ un controllo aperto e lasciato vuoto non è un filtro', () => {
    expect(isColumnFilterActive({ kind: 'values', values: [] })).toBe(false);
    expect(isColumnFilterActive({ kind: 'text', text: '   ' })).toBe(false);
    expect(isColumnFilterActive({ kind: 'range' })).toBe(false);
    expect(isColumnFilterActive(undefined)).toBe(false);
  });

  it('con un valore restringe', () => {
    expect(isColumnFilterActive({ kind: 'values', values: ['Bozza'] })).toBe(true);
    expect(isColumnFilterActive({ kind: 'text', text: 'mag' })).toBe(true);
    expect(isColumnFilterActive({ kind: 'range', min: 0 })).toBe(true);
    expect(isColumnFilterActive({ kind: 'range', max: 0 })).toBe(true);
  });

  /*
    ⚠️ **Zero è un estremo legittimo**, e va detto: scritto con un `if (min)` il
    filtro «da 0 in su» non scatterebbe mai, perché `0` è falso.
  */
  it('⚠️ un estremo a ZERO è un filtro, non un vuoto', () => {
    expect(isColumnFilterActive({ kind: 'range', min: 0, max: 0 })).toBe(true);
  });

  it('il conteggio è quello del badge «Filtri (n)»', () => {
    const stato: ColumnFilterState = {
      stato: { kind: 'values', values: ['Bozza'] },
      nome: { kind: 'text', text: '' },
      totale: { kind: 'range', min: 100 },
    };
    expect(countActiveColumnFilters(stato)).toBe(2);
  });
});

describe('applicaFiltriDiColonna', () => {
  it('senza filtri restituisce le righe INTATTE', () => {
    expect(applicaFiltriDiColonna(RIGHE, {}, { cellText })).toBe(RIGHE);
  });

  it('un filtro a valori tiene solo quelli scelti', () => {
    const out = applicaFiltriDiColonna(
      RIGHE,
      { stato: { kind: 'values', values: ['Confermato'] } },
      { cellText },
    );
    expect(ids(out)).toEqual(['a', 'c']);
  });

  it('più valori sulla stessa colonna sono un OR', () => {
    const out = applicaFiltriDiColonna(
      RIGHE,
      { stato: { kind: 'values', values: ['Bozza', 'Annullato'] } },
      { cellText },
    );
    expect(ids(out)).toEqual(['b', 'd']);
  });

  /*
    ⭐ **Due colonne sono un AND**: si restringe, non si allarga. È l'unica
    lettura che rende prevedibile aggiungere un filtro.
  */
  it('⭐ due colonne filtrate insieme si RESTRINGONO', () => {
    const out = applicaFiltriDiColonna(
      RIGHE,
      {
        stato: { kind: 'values', values: ['Confermato'] },
        nome: { kind: 'text', text: 'zocc' },
      },
      { cellText },
    );
    expect(ids(out)).toEqual(['c']);
  });

  /*
    ⚠️ **Il testo NON distingue maiuscole e accenti di battitura**: chi cerca
    «maglia» deve trovare «Maglia cotone» e «maglia lana». Un confronto sensibile
    al caso è il difetto più comune di un filtro di testo.
  */
  it('⚠️ il testo ignora le maiuscole', () => {
    const out = applicaFiltriDiColonna(
      RIGHE,
      { nome: { kind: 'text', text: 'MAGLIA' } },
      { cellText },
    );
    expect(ids(out)).toEqual(['a', 'd']);
  });

  describe('intervallo', () => {
    it('rispetta il minimo, il massimo e li include', () => {
      expect(
        ids(
          applicaFiltriDiColonna(
            RIGHE,
            { totale: { kind: 'range', min: 250 } },
            { cellText, numeroDi },
          ),
        ),
      ).toEqual(['a', 'c']);
      expect(
        ids(
          applicaFiltriDiColonna(
            RIGHE,
            { totale: { kind: 'range', max: 250 } },
            { cellText, numeroDi },
          ),
        ),
      ).toEqual(['b', 'c', 'd']);
    });

    /*
      ⛔ **I NEGATIVI sono righe come le altre.** Un reso o una nota di credito
      hanno totale negativo, e un filtro «fino a 0» deve prenderli: è il caso in
      cui si cerca proprio quelli.
    */
    it('⛔ un intervallo che scende sotto zero prende i negativi', () => {
      const out = applicaFiltriDiColonna(
        RIGHE,
        { totale: { kind: 'range', min: -1000, max: 0 } },
        { cellText, numeroDi },
      );
      expect(ids(out)).toEqual(['b', 'd']);
    });

    /*
      ⚠️ **Senza estrattore la colonna NON filtra**, invece di filtrare male:
      meglio non restringere che restringere per un confronto che non sappiamo
      fare — un `range` su un testo darebbe zero righe senza dire perché.
    */
    it('⚠️ senza `numeroDi` la colonna lascia passare tutto', () => {
      const out = applicaFiltriDiColonna(
        RIGHE,
        { totale: { kind: 'range', min: 500 } },
        { cellText },
      );
      expect(ids(out)).toEqual(['a', 'b', 'c', 'd']);
    });
  });
});

describe('valoriDistinti', () => {
  it('elenca i valori presenti, senza ripetizioni', () => {
    expect(valoriDistinti(RIGHE, 'stato', cellText)).toEqual(['Annullato', 'Bozza', 'Confermato']);
  });

  /*
    ⚠️ **Ordinati come li legge un italiano**: «Àncora» viene prima di «Zoccolo»,
    e non dopo — che è dove la metterebbe un confronto binario sui codepoint
    (`'À'` vale 192, oltre ogni lettera ASCII).

    ⚠️ **E il CASO non conta prima della lettera**: «Maglia cotone» precede
    «maglia lana» perché confronta `c` con `l`, non `M` con `m`. Scrivendo
    questa prova avevo asserito l'ordine sbagliato — è la stessa lezione del
    segno meno: si verifica cosa fa `Intl`, non cosa sembra ragionevole.
  */
  it('⚠️ ordina secondo la lingua, non i codepoint', () => {
    expect(valoriDistinti(RIGHE, 'nome', cellText)).toEqual([
      'Àncora blu',
      'Maglia cotone',
      'maglia lana',
      'Zoccolo',
    ]);
  });

  it('salta le celle vuote: non sono una scelta', () => {
    const conVuoti = [...RIGHE, { id: 'e', stato: '  ', nome: '', totale: 0 }];
    expect(valoriDistinti(conVuoti, 'stato', cellText)).toHaveLength(3);
  });
});
