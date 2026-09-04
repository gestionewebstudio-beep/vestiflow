import { describe, expect, it } from 'vitest';

import { ordinaPerColonne } from './column-sort.util';

interface Riga {
  readonly id: string;
  readonly nome: string;
  readonly importoTesto: string;
  readonly importoMinor: number | null;
  readonly dataTesto: string;
  readonly dataIso: string | null;
}

function riga(p: Partial<Riga> & { id: string }): Riga {
  return {
    nome: '',
    importoTesto: '',
    importoMinor: null,
    dataTesto: '',
    dataIso: null,
    ...p,
  };
}

const cellText = (r: Riga, columnId: string): string =>
  columnId === 'nome' ? r.nome : columnId === 'importo' ? r.importoTesto : r.dataTesto;

const numeroDi = (r: Riga, columnId: string): number | null =>
  columnId === 'importo' ? r.importoMinor : null;

const dataDi = (r: Riga, columnId: string): string | null =>
  columnId === 'data' ? r.dataIso : null;

const ids = (righe: readonly Riga[]): string[] => righe.map((r) => r.id);

describe('ordinaPerColonne', () => {
  it('senza chiavi non tocca niente, e non copia', () => {
    const righe = [riga({ id: 'a' }), riga({ id: 'b' })];
    expect(ordinaPerColonne(righe, [], { cellText })).toBe(righe);
  });

  it('su un elenco vuoto non fa niente', () => {
    const vuoto: readonly Riga[] = [];
    expect(ordinaPerColonne(vuoto, [{ columnId: 'nome', direction: 'asc' }], { cellText })).toBe(
      vuoto,
    );
  });

  it('ordina il testo col collatore italiano', () => {
    const righe = [
      riga({ id: 'z', nome: 'Zurigo' }),
      riga({ id: 'a', nome: 'Àncona' }),
      riga({ id: 'b', nome: 'Bari' }),
    ];
    const ordinate = ordinaPerColonne(righe, [{ columnId: 'nome', direction: 'asc' }], {
      cellText,
    });
    // ⚠️ «Àncona» prima di «Bari»: un confronto binario la metterebbe dopo «Zurigo».
    expect(ids(ordinate)).toEqual(['a', 'b', 'z']);
  });

  it('usa l’estrattore numerico quando c’è, e rispetta il verso', () => {
    const righe = [
      riga({ id: 'medio', importoTesto: '10,00 €', importoMinor: 1000 }),
      riga({ id: 'basso', importoTesto: '-25,00 €', importoMinor: -2500 }),
      riga({ id: 'alto', importoTesto: '3,66 €', importoMinor: 366 }),
    ];
    const opzioni = { cellText, numeroDi, dataDi };

    expect(ids(ordinaPerColonne(righe, [{ columnId: 'importo', direction: 'asc' }], opzioni))).toEqual([
      'basso',
      'alto',
      'medio',
    ]);
    expect(
      ids(ordinaPerColonne(righe, [{ columnId: 'importo', direction: 'desc' }], opzioni)),
    ).toEqual(['medio', 'alto', 'basso']);
  });

  it('⛔ ordina le date come date, non come testo', () => {
    const righe = [
      riga({ id: 'dic', dataTesto: '31/12/2025', dataIso: '2025-12-31' }),
      riga({ id: 'gen', dataTesto: '01/01/2026', dataIso: '2026-01-01' }),
      riga({ id: 'ago', dataTesto: '29/08/2026', dataIso: '2026-08-29' }),
    ];
    // Come testo, «01/01/2026» verrebbe prima di «29/08/2026» e «31/12/2025» per ultimo.
    expect(
      ids(ordinaPerColonne(righe, [{ columnId: 'data', direction: 'asc' }], { cellText, dataDi })),
    ).toEqual(['dic', 'gen', 'ago']);
  });

  /*
    ⚠️ **La prima riga può non rispondere.** Guardando solo lei, una colonna data
    con la prima cella vuota si ordinerebbe come testo — e nessuno se ne
    accorgerebbe finché le date non cadono in mesi diversi.
  */
  it('⚠️ cerca la prima riga che RISPONDE, non semplicemente la prima', () => {
    const righe = [
      riga({ id: 'vuota', dataTesto: '—', dataIso: null }),
      riga({ id: 'gen', dataTesto: '01/01/2026', dataIso: '2026-01-01' }),
      riga({ id: 'dic', dataTesto: '31/12/2025', dataIso: '2025-12-31' }),
    ];
    const ordinate = ordinaPerColonne(righe, [{ columnId: 'data', direction: 'asc' }], {
      cellText,
      dataDi,
    });
    // Dicembre 2025 prima di gennaio 2026: è un confronto fra date, non fra stringhe.
    expect(ids(ordinate).indexOf('dic')).toBeLessThan(ids(ordinate).indexOf('gen'));
  });

  /*
    ⭐ **IL RIPIEGO NUMERICO** — proprietario, 01/09/2026: «considerare anche il
    segno negativo nell'ordinamento delle colonne».

    ⛔ Senza estrattore, il confronto testuale su una colonna di importi è quasi
    casuale: «10,98 €» prima di «3,66 €», e i resi in mezzo ai positivi.
  */
  describe('senza estrattore, un numero scritto si ordina lo stesso', () => {
    const senzaEstrattore = { cellText };

    it('⭐ legge gli importi all’italiana, segno compreso', () => {
      const righe = [
        riga({ id: 'dieci', importoTesto: '10,98 €' }),
        riga({ id: 'reso', importoTesto: '-25,00 €' }),
        riga({ id: 'tre', importoTesto: '3,66 €' }),
        riga({ id: 'mille', importoTesto: '1.234,50 €' }),
      ];
      expect(
        ids(ordinaPerColonne(righe, [{ columnId: 'importo', direction: 'asc' }], senzaEstrattore)),
      ).toEqual(['reso', 'tre', 'dieci', 'mille']);
    });

    /*
      ⛔ **Un solo segnaposto non spegne il ripiego.** È l'errore gemello di quello
      corretto nell'elenco valori del filtro: un «—» è l'assenza di un valore, non
      un valore di un'altra specie.
    */
    it('⭐ e un «—» in mezzo non lo spegne', () => {
      const righe = [
        riga({ id: 'vuoto', importoTesto: '—' }),
        riga({ id: 'dieci', importoTesto: '10,98 €' }),
        riga({ id: 'tre', importoTesto: '3,66 €' }),
      ];
      const ordinate = ids(
        ordinaPerColonne(righe, [{ columnId: 'importo', direction: 'asc' }], senzaEstrattore),
      );
      expect(ordinate.indexOf('tre')).toBeLessThan(ordinate.indexOf('dieci'));
    });

    /*
      ⛔ **L'assenza sta a un ESTREMO, non in mezzo.** Valeva `0`, e con una
      colonna che porta resi finiva **fra i negativi e i positivi**: una riga
      senza importo si leggeva come una riga da zero euro.

      ⚠️ È la convenzione dichiarata dal motore di confronto (`sort-values.util`,
      «l'assenza deve stare a un estremo») e già usata dal percorso gemello con
      estrattore, cinque righe più su nella stessa funzione.
    */
    it('⛔ e il segnaposto va a un ESTREMO, non fra i negativi e i positivi', () => {
      const righe = [
        riga({ id: 'reso', importoTesto: '-25,00 €' }),
        riga({ id: 'vuoto', importoTesto: '—' }),
        riga({ id: 'dieci', importoTesto: '10,98 €' }),
      ];
      expect(
        ids(ordinaPerColonne(righe, [{ columnId: 'importo', direction: 'asc' }], senzaEstrattore)),
      ).toEqual(['vuoto', 'reso', 'dieci']);
    });

    /*
      ⚠️ **La metà che conta**: se il ripiego scattasse su una colonna di parole,
      `numeroItaliano` tornerebbe `null` per tutte e l'elenco resterebbe nell'ordine
      di partenza — un ordinamento che non ordina, con la freccia accesa.
    */
    it('⚠️ e NON scatta su una colonna di parole', () => {
      const righe = [
        riga({ id: 'z', nome: 'Zurigo' }),
        riga({ id: 'b', nome: 'Bari' }),
        riga({ id: 'a', nome: 'Àncona' }),
      ];
      expect(
        ids(ordinaPerColonne(righe, [{ columnId: 'nome', direction: 'asc' }], senzaEstrattore)),
      ).toEqual(['a', 'b', 'z']);
    });
  });

  it('a parità sulla prima chiave decide la seconda', () => {
    const righe = [
      riga({ id: 'b2', nome: 'Bari', importoTesto: '2,00 €', importoMinor: 200 }),
      riga({ id: 'a1', nome: 'Àncona', importoTesto: '1,00 €', importoMinor: 100 }),
      riga({ id: 'b1', nome: 'Bari', importoTesto: '1,00 €', importoMinor: 100 }),
    ];
    const ordinate = ordinaPerColonne(
      righe,
      [
        { columnId: 'nome', direction: 'asc' },
        { columnId: 'importo', direction: 'desc' },
      ],
      { cellText, numeroDi, dataDi },
    );
    expect(ids(ordinate)).toEqual(['a1', 'b2', 'b1']);
  });
});
