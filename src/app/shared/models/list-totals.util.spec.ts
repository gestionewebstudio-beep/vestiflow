import { describe, expect, it } from 'vitest';

import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { totaliDiElenco } from './list-totals.util';

/**
 * ⭐ **Questi test presidiano tre decisioni, non una funzione.**
 *
 * L'ambito che segue la selezione, la visibilità che decide cosa si somma, e il
 * fatto che qui si SOMMA e basta: sono le tre cose che, riscritte elenco per
 * elenco, divergerebbero senza che nessuno se ne accorga.
 */
describe('totali di un elenco', () => {
  interface Riga {
    readonly id: string;
    readonly pezzi: number;
    readonly importo: number;
  }

  const RIGHE: readonly Riga[] = [
    { id: 'a', pezzi: 3, importo: 1000 },
    { id: 'b', pezzi: 5, importo: 250 },
    { id: 'c', pezzi: 2, importo: 40 },
  ];

  /*
    ⚠️ La funzione legge SOLO `id`: il resto è quanto basta a soddisfare il tipo.
    Un `as unknown as` avrebbe nascosto il giorno in cui servisse un altro campo.
  */
  const colonna = (id: string): ResolvedTableColumn => ({ id, label: id, pinned: false });

  const CAMPI = {
    pezzi: { valore: (r: Riga) => r.pezzi, formato: (n: number) => String(n) },
    importo: { valore: (r: Riga) => r.importo, formato: (n: number) => `${n} €` },
  };

  const totali = (selezionati: readonly string[], colonne: readonly string[]) =>
    totaliDiElenco(RIGHE, {
      rowId: (r) => r.id,
      selectedIds: new Set(selezionati),
      columns: colonne.map(colonna),
      campi: CAMPI,
    });

  it('senza selezione somma TUTTO il risultato filtrato', () => {
    expect(totali([], ['pezzi', 'importo'])).toEqual({
      count: 3,
      values: { pezzi: '10', importo: '1290 €' },
    });
  });

  /**
   * ⛔ **Il caso che una somma scritta a mano sbaglia più spesso**: con una
   * selezione l'ambito cambia, e il conteggio deve cambiare con lui — un
   * conteggio che resta a «3 voci» mentre gli importi sono di una riga sola è
   * peggio di nessun totale.
   */
  it('con una selezione somma SOLO le righe scelte, conteggio compreso', () => {
    expect(totali(['a', 'c'], ['pezzi', 'importo'])).toEqual({
      count: 2,
      values: { pezzi: '5', importo: '1040 €' },
    });
  });

  it('una colonna spenta non ha totale', () => {
    const esito = totali([], ['pezzi']);

    expect(esito.values).toEqual({ pezzi: '10' });
    expect(esito.values['importo']).toBeUndefined();
  });

  /**
   * ⚠️ Una colonna visibile che non è sommabile — un nome, una categoria — non
   * deve produrre una casella vuota sotto di sé: semplicemente non c'è.
   */
  it('una colonna senza campo dichiarato non somma e non lascia buchi', () => {
    expect(totali([], ['nome', 'pezzi']).values).toEqual({ pezzi: '10' });
  });

  it('un elenco vuoto dice zero voci, non «nessun totale»', () => {
    const esito = totaliDiElenco<Riga>([], {
      rowId: (r) => r.id,
      selectedIds: new Set(),
      columns: [colonna('pezzi')],
      campi: CAMPI,
    });

    expect(esito).toEqual({ count: 0, values: { pezzi: '0' } });
  });

  /**
   * ⛔ **La selezione può contenere righe che il filtro non mostra più**: si
   * spunta una riga, si stringe la ricerca, e quell'id resta nella selezione. Il
   * totale deve riguardare ciò che è a schermo, non un id fantasma.
   */
  it('ignora gli id selezionati che non sono fra le righe', () => {
    expect(totali(['a', 'sparita'], ['pezzi'])).toEqual({
      count: 1,
      values: { pezzi: '3' },
    });
  });
});
