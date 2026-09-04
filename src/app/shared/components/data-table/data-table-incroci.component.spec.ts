import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { DataTableComponent } from './data-table.component';
import type { DataTableSection, DataTableTotals } from './data-table.model';

/**
 * ⭐ **Gli INCROCI del motore tabella**, e non le singole funzioni.
 *
 * `data-table.component.spec.ts` prova una cosa alla volta: le sezioni, la
 * selezione, la riga totali, il titolo della card. Ognuna funziona da sola — ed è
 * esattamente la ragione per cui un difetto nella loro combinazione non lo vede
 * nessuno.
 *
 * Le combinazioni sono nate tutte in giornata (31/08/2026): il raggruppamento è
 * arrivato su sei elenchi che avevano già selezione, riga totali e card. Qui si
 * verifica che stiano insieme.
 */

interface Riga {
  readonly id: string;
  readonly giorno: string;
  readonly nome: string;
  readonly totale: string;
}

const COLONNE: readonly ResolvedTableColumn[] = [
  { id: 'nome', label: 'Nome', pinned: false, cardTitle: true },
  { id: 'totale', label: 'Totale', numeric: true, pinned: false },
];

/** Due giornate, tre righe: la prima ne ha due, la seconda una. */
const SEZIONI: readonly DataTableSection<Riga>[] = [
  {
    id: '2026-08-17',
    header: '17 agosto 2026',
    rows: [
      { id: 'r1', giorno: '2026-08-17', nome: 'Alfa', totale: '10,00 €' },
      { id: 'r2', giorno: '2026-08-17', nome: 'Beta', totale: '15,00 €' },
    ],
    footer: {
      label: 'Totale 17 agosto 2026',
      emphasis: 'totale',
      values: { totale: '25,00 €' },
    },
  },
  {
    id: '2026-08-16',
    header: '16 agosto 2026',
    rows: [{ id: 'r3', giorno: '2026-08-16', nome: 'Gamma', totale: '7,00 €' }],
    footer: { label: 'Totale 16 agosto 2026', emphasis: 'totale', values: { totale: '7,00 €' } },
  },
];

@Component({
  imports: [DataTableComponent],
  template: `
    <app-data-table
      [columns]="colonne()"
      [sections]="sezioni()"
      [rowId]="rowId"
      [cellText]="cellText"
      [selectionMode]="'multiple'"
      [selectedIds]="selectedIds()"
      [totals]="totals()"
      (selectionChange)="selectionChange($event)"
      (selectAllChange)="selectAllChange($event)"
    />
  `,
})
class OspiteComponent {
  readonly colonne = signal<readonly ResolvedTableColumn[]>(COLONNE);
  readonly sezioni = signal<readonly DataTableSection<Riga>[]>(SEZIONI);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly totals = signal<DataTableTotals | null>(null);

  readonly rowId = (row: Riga): string => row.id;
  readonly cellText = (row: Riga, columnId: string): string =>
    columnId === 'nome' ? row.nome : row.totale;

  readonly selectionChange = vi.fn();
  readonly selectAllChange = vi.fn();
}

async function apri(): Promise<OspiteComponent> {
  const reso = await render(OspiteComponent);
  return reso.fixture.componentInstance;
}

/** Le sole caselle di RIGA: quella di testata ha un'etichetta diversa. */
function caselleDiRiga(): HTMLInputElement[] {
  return screen
    .getAllByRole<HTMLInputElement>('checkbox')
    .filter((c) => !/tutt/i.test(c.getAttribute('aria-label') ?? ''));
}

function casellaDiTesta(): HTMLInputElement {
  return screen
    .getAllByRole<HTMLInputElement>('checkbox')
    .find((c) => /tutt/i.test(c.getAttribute('aria-label') ?? ''))!;
}

describe('motore tabella — selezione × raggruppamento', () => {
  /*
    ⛔ **La casella di testata guarda TUTTE le sezioni, non la prima.**

    `visibleRowIds` appiattisce le sezioni: se guardasse `sections()[0].rows`,
    selezionare le due righe del 17 agosto direbbe «tutte» mentre il 16 agosto
    resta fuori — e l'operatore premerebbe un'azione su tre righe credendone
    selezionate tre.
  */
  it('⛔ «tutte selezionate» conta le righe di OGNI giornata, non della prima', async () => {
    const ospite = await apri();

    ospite.selectedIds.set(new Set(['r1', 'r2']));
    await new Promise((r) => setTimeout(r, 0));
    expect(casellaDiTesta().checked).toBe(false);
    expect(casellaDiTesta().indeterminate).toBe(true);

    ospite.selectedIds.set(new Set(['r1', 'r2', 'r3']));
    await new Promise((r) => setTimeout(r, 0));
    expect(casellaDiTesta().checked).toBe(true);
    expect(casellaDiTesta().indeterminate).toBe(false);
  });

  /*
    ⛔ **Le fasce di gruppo non sono righe selezionabili.** Una casella
    sull'intestazione di giornata o sul suo subtotale prometterebbe di
    selezionare un gruppo, cosa che il contratto della selezione non fa.
  */
  it('⛔ intestazione e subtotale di giornata NON hanno una casella', async () => {
    await apri();
    // Tre righe di dato, tre caselle: le due intestazioni e i due piedi non ne hanno.
    expect(caselleDiRiga()).toHaveLength(3);
  });

  it('la casella di riga funziona anche dentro un gruppo, e nomina la riga', async () => {
    const ospite = await apri();
    const ultima = caselleDiRiga().at(-1)!;

    ultima.click();

    /*
      ⚠️ Si asserisce sull'argomento REALE, non con un matcher annidato: quello
      restituisce `any`, e un `any` in un'asserzione toglie proprio la verifica
      che il test dovrebbe fare.
    */
    const [evento] = ospite.selectionChange.mock.calls.at(-1) as [
      { readonly row: Riga; readonly selected: boolean },
    ];
    expect(evento.row.id).toBe('r3');
    expect(evento.selected).toBe(true);
  });
});

describe('motore tabella — riga totali × raggruppamento', () => {
  /*
    ⭐ **Sono due cose diverse e convivono**: il piede di GRUPPO chiude la
    giornata, la riga TOTALI chiude l'elenco. Il primo sta nel `tbody`, la
    seconda nel `tfoot`.

    ⚠️ Se un giorno una delle due sparisse rendendo l'altra, questo test lo dice.
  */
  it('⭐ i subtotali di giornata e la riga totali dell’elenco stanno insieme', async () => {
    const ospite = await apri();
    ospite.totals.set({ count: 3, values: { totale: '32,00 €' } });
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Totale 17 agosto 2026')).toBeTruthy();
    expect(screen.getByText('Totale 16 agosto 2026')).toBeTruthy();
    // ⚠️ 25,00 € è il solo subtotale del 17: nessuna sua riga vale quella cifra.
    expect(screen.getByText('25,00 €')).toBeTruthy();
    /*
      ⭐ **7,00 € compare DUE volte, ed è la prova che serve**: la riga Gamma e il
      subtotale della giornata che la contiene da sola. Una giornata di una riga
      sola mostra lo stesso numero due volte — se ne comparisse uno, o il piede
      non c'è o la riga è sparita dentro di lui.
    */
    expect(screen.getAllByText('7,00 €')).toHaveLength(2);

    // La riga totali vive nel piede di tabella, non fra le righe.
    const piede = document.querySelector('tfoot')!;
    expect(piede.textContent).toContain('3 voci');
    expect(piede.textContent).toContain('32,00 €');
  });

  /*
    ⚠️ **La riga totali segue la selezione; i subtotali di giornata NO.**

    È il comportamento del Registro Corrispettivi, dove i subtotali arrivano
    dall'API e valgono per la giornata intera. Fissarlo in un test serve a non
    «correggerlo» per sbaglio: un subtotale che seguisse la selezione direbbe
    quanto vale una parte di giornata, che non è una domanda che qualcuno pone.
  */
  it('⚠️ con una selezione cambia la riga totali, non i subtotali di giornata', async () => {
    const ospite = await apri();
    ospite.selectedIds.set(new Set(['r3']));
    ospite.totals.set({ count: 1, values: { totale: '7,00 €' } });
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('tfoot')!.textContent).toContain('1 voce');
    // Il 17 agosto continua a valere 25,00 €, che nessuno ha selezionato.
    expect(screen.getByText('Totale 17 agosto 2026')).toBeTruthy();
    expect(screen.getByText('25,00 €')).toBeTruthy();
  });
});

describe('motore tabella — colonne spente × raggruppamento', () => {
  /*
    ⭐ **«Si somma ciò che è VISIBILE»** vale per il piede di gruppo quanto per la
    riga totali: una colonna che il selettore Colonne ha spento non ha subtotale,
    e il suo valore non deve comparire da nessuna parte.
  */
  it('⛔ spenta la colonna, sparisce anche il suo subtotale di giornata', async () => {
    const ospite = await apri();
    ospite.colonne.set([{ id: 'nome', label: 'Nome', pinned: false, cardTitle: true }]);
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText('Totale 17 agosto 2026')).toBeTruthy();
    expect(screen.queryByText('25,00 €')).toBeNull();
  });

  /*
    ⚠️ **Il colspan dell'etichetta si ricalcola sulle colonne rimaste.** È il
    pezzo che si rompe in silenzio quando si spegne una colonna: il piede scivola
    di una cella e i numeri non sono più sotto la loro intestazione.
  */
  it('il piede resta largo quanto la tabella anche a colonne cambiate', async () => {
    const ospite = await apri();
    ospite.colonne.set([{ id: 'nome', label: 'Nome', pinned: false, cardTitle: true }]);
    await new Promise((r) => setTimeout(r, 0));

    const piede = document.querySelector('.data-table__section-total')!;
    const celle = [...piede.querySelectorAll('td')];
    const larghezza = celle.reduce(
      (somma, cella) => somma + Number(cella.getAttribute('colspan') ?? 1),
      0,
    );
    // 1 colonna + la colonna della selezione.
    expect(larghezza).toBe(2);
  });
});

describe('motore tabella — titolo card × raggruppamento', () => {
  /*
    ⭐ Il titolo della card è una proprietà della COLONNA, quindi vale in ogni
    riga di ogni gruppo. ⛔ Non deve finire sulle celle delle fasce di gruppo, che
    card non sono.
  */
  it('⭐ ogni riga di ogni giornata ha il suo titolo, le fasce di gruppo no', async () => {
    await apri();

    const titoli = document.querySelectorAll('.data-table__cell--card-title');
    expect(titoli).toHaveLength(3);
    expect([...titoli].map((t) => t.textContent?.trim())).toEqual(['Alfa', 'Beta', 'Gamma']);
  });
});
