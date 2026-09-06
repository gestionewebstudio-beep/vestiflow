import { describe, expect, it } from 'vitest';

import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { raggruppaPerGiorno } from './list-grouping.util';

interface Riga {
  readonly id: string;
  readonly data: string | null;
  readonly totale: number;
}

const colonna = (id: string): ResolvedTableColumn => ({ id, label: id, pinned: false });

const COLONNE = [colonna('data'), colonna('totale')];

const CAMPI = {
  totale: { valore: (r: Riga) => r.totale, formato: (n: number) => `${n} €` },
};

const base = {
  giornoDi: (r: Riga) => r.data,
  etichetta: (g: string) => `il ${g}`,
  columns: COLONNE,
};

describe('raggruppaPerGiorno', () => {
  it('accorpa le righe consecutive dello stesso giorno', () => {
    const sezioni = raggruppaPerGiorno<Riga>(
      [
        { id: 'a', data: '2026-08-17T10:00:00Z', totale: 25 },
        { id: 'b', data: '2026-08-17T18:00:00Z', totale: 100 },
        { id: 'c', data: '2026-08-16T09:00:00Z', totale: 7 },
      ],
      base,
    );

    expect(sezioni.map((s) => s.id)).toEqual(['2026-08-17', '2026-08-16']);
    expect(sezioni[0]!.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(sezioni[0]!.header).toBe('il 2026-08-17');
    expect(sezioni[1]!.rows.map((r) => r.id)).toEqual(['c']);
  });

  it('somma nel piede solo le colonne dichiarate, e formatta una volta sola', () => {
    const sezioni = raggruppaPerGiorno<Riga>(
      [
        { id: 'a', data: '2026-08-17', totale: 25 },
        { id: 'b', data: '2026-08-17', totale: 100 },
      ],
      { ...base, campi: CAMPI, emphasis: 'totale' },
    );

    expect(sezioni).toHaveLength(1);
    expect(sezioni[0]!.footer).toEqual({
      label: 'Totale il 2026-08-17',
      emphasis: 'totale',
      values: { totale: '125 €' },
    });
  });

  /*
    ⭐ «Si somma ciò che è VISIBILE» (`regole-stile-ui` §5): una colonna spenta dal
    selettore Colonne non ha un totale, esattamente come nella riga totali.
  */
  it('non somma una colonna che il selettore ha spento', () => {
    const sezioni = raggruppaPerGiorno<Riga>([{ id: 'a', data: '2026-08-17', totale: 25 }], {
      ...base,
      columns: [colonna('data')],
      campi: CAMPI,
    });

    expect(sezioni[0]!.footer).toBeUndefined();
  });

  /*
    ⛔ Senza campi sommabili il gruppo ha la sola intestazione: un piede vuoto
    sarebbe una riga in più che non dice niente, moltiplicata per ogni giornata.
  */
  it('senza campi non emette il piede', () => {
    const sezioni = raggruppaPerGiorno<Riga>([{ id: 'a', data: '2026-08-17', totale: 25 }], base);
    expect(sezioni[0]!.footer).toBeUndefined();
    expect(sezioni[0]!.header).toBe('il 2026-08-17');
  });

  /*
    ⚠️ **Raggruppa CONSECUTIVI, non ordina.** Due righe dello stesso giorno
    separate da una terza fanno due gruppi: è voluto — ordinare qui scavalcherebbe
    l'ordinamento scelto dall'operatore — ed è la ragione per cui il
    raggruppamento spegne l'ordinamento libero.
  */
  it('non riordina: righe dello stesso giorno non contigue restano due gruppi', () => {
    const sezioni = raggruppaPerGiorno<Riga>(
      [
        { id: 'a', data: '2026-08-17', totale: 1 },
        { id: 'b', data: '2026-08-16', totale: 1 },
        { id: 'c', data: '2026-08-17', totale: 1 },
      ],
      base,
    );

    expect(sezioni.map((s) => s.id)).toEqual(['2026-08-17', '2026-08-16', '2026-08-17']);
  });

  /** Una riga senza data non sparisce: finisce nel gruppo «senza data». */
  it('tiene le righe senza data invece di perderle', () => {
    const sezioni = raggruppaPerGiorno<Riga>([{ id: 'a', data: null, totale: 5 }], {
      ...base,
      etichetta: (g) => (g === '' ? 'Senza data' : g),
    });

    expect(sezioni).toHaveLength(1);
    expect(sezioni[0]!.header).toBe('Senza data');
    expect(sezioni[0]!.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('su un elenco vuoto non inventa gruppi', () => {
    expect(raggruppaPerGiorno<Riga>([], { ...base, campi: CAMPI })).toEqual([]);
  });
});
