import { Component, signal } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { DataTableCellDirective } from './data-table-cell.directive';
import { DataTableComponent } from './data-table.component';
import type { DataTableSection, DataTableSort } from './data-table.model';

interface Riga {
  readonly id: string;
  readonly sku: string;
  readonly qta: string;
}

const COLONNE: readonly ResolvedTableColumn[] = [
  { id: 'sku', label: 'SKU', pinned: false },
  { id: 'qta', label: 'Quantità', numeric: true, pinned: false },
];

const RIGHE: readonly Riga[] = [
  { id: 'r1', sku: 'AAA', qta: '3' },
  { id: 'r2', sku: 'BBB', qta: '5' },
];

/** Ospite minimo: il motore ha bisogno di un contesto per i template di cella. */
@Component({
  imports: [DataTableComponent],
  template: `
    <app-data-table
      [columns]="colonne"
      [sections]="sezioni()"
      [rowId]="rowId"
      [cellText]="cellText"
      [selectionMode]="selectionMode()"
      [selectedIds]="selectedIds()"
      [rowClickable]="rowClickable()"
      [rowClickableWhen]="rowClickableWhen"
      [rowLabel]="rowLabel"
      [sortable]="sortable()"
      [sort]="sort()"
      (sortChange)="sortChange($event)"
      (selectionChange)="selectionChange($event)"
    >
    </app-data-table>
  `,
})
class OspiteComponent {
  readonly colonne = COLONNE;
  readonly sezioni = signal<readonly DataTableSection<Riga>[]>([{ id: 'unica', rows: RIGHE }]);
  readonly selectionMode = signal<'none' | 'multiple'>('none');
  readonly selectedIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly rowClickable = signal(false);
  /** Solo la prima riga si apre: la seconda è informativa, come nel Registro. */
  readonly rowClickableWhen = (row: Riga): boolean => row.id === 'r1';
  readonly rowLabel = (row: Riga): string => `Apri ${row.sku}`;
  readonly sortable = signal(false);
  readonly sort = signal<readonly DataTableSort[]>([]);

  readonly rowId = (row: Riga): string => row.id;
  readonly cellText = (row: Riga, columnId: string): string =>
    columnId === 'sku' ? row.sku : row.qta;

  readonly sortChange = vi.fn();
  readonly selectionChange = vi.fn();
}

/**
 * ⚠️ Ospite separato, e non un `@if` nell'altro: un `ng-template` dentro un
 * blocco condizionale **non è contenuto proiettato** al primo render, quindi la
 * query sul contenuto non lo troverebbe mai. È il genere di dettaglio che fa
 * sembrare rotta una funzione che funziona.
 */
@Component({
  imports: [DataTableComponent, DataTableCellDirective],
  template: `
    <app-data-table [columns]="colonne" [sections]="sezioni" [rowId]="rowId" [cellText]="cellText">
      <ng-template appCell="sku" let-row>
        <span data-testid="cella-ricca">★ {{ row.sku }}</span>
      </ng-template>
    </app-data-table>
  `,
})
class OspiteConTemplateComponent {
  readonly colonne = COLONNE;
  readonly sezioni: readonly DataTableSection<Riga>[] = [{ id: 'unica', rows: RIGHE }];
  readonly rowId = (row: Riga): string => row.id;
  readonly cellText = (row: Riga, columnId: string): string =>
    columnId === 'sku' ? row.sku : row.qta;
}

async function apri(): Promise<OspiteComponent> {
  const reso = await render(OspiteComponent);
  return reso.fixture.componentInstance;
}

/**
 * ⛔ Il motore non conosce nessun dominio: queste prove parlano solo di
 * colonne, sezioni e stato. Se un giorno servisse nominare un tipo documento
 * per farle passare, il motore è diventato un componente di feature travestito.
 */
describe('DataTableComponent', () => {
  it('rende le colonne e le righe', async () => {
    await apri();

    expect(screen.getByRole('columnheader', { name: 'SKU' })).toBeTruthy();
    expect(screen.getByText('AAA')).toBeTruthy();
    expect(screen.getByText('BBB')).toBeTruthy();
  });

  /**
   * ⭐ La regola che tiene in piedi tutto il progetto: **una tabella piatta è
   * una sezione degenere**. Se questa prova cadesse, il motore avrebbe due modi
   * di rendere il corpo invece di uno.
   */
  it('⭐ una lista piatta è una sezione senza testa né piede', async () => {
    const ospite = await apri();

    // Nessuna riga di struttura: solo l'intestazione tabella e le due righe.
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(ospite.sezioni()).toHaveLength(1);
  });

  describe('sezioni con intestazione e piede', () => {
    it('rende la testa di gruppo a piena larghezza', async () => {
      const ospite = await apri();
      ospite.sezioni.set([{ id: 'g1', header: '17 agosto 2026', rows: RIGHE }]);

      expect(await screen.findByText('17 agosto 2026')).toBeTruthy();
    });

    /**
     * ⭐ Il `colspan` dell'etichetta è **derivato dal modello colonne**, non
     * scritto a mano: qui il piede valorizza la sola «Quantità», quindi
     * l'etichetta copre l'unica colonna che la precede.
     */
    it('⭐ il colspan del piede si deduce da quali colonne portano un totale', async () => {
      const ospite = await apri();
      ospite.sezioni.set([
        {
          id: 'g1',
          rows: RIGHE,
          footer: { label: 'Totale giornata', values: { qta: '8' } },
        },
      ]);

      const etichetta = await screen.findByText('Totale giornata');
      expect(etichetta.getAttribute('colspan')).toBe('1');
      expect(screen.getByText('8')).toBeTruthy();
    });
  });

  describe('ordinamento', () => {
    /**
     * ⭐ Le affordance compaiono **solo se la pagina le accende**: un elenco la
     * cui API non sa ordinare non deve marcare `sortable: false` su ogni
     * colonna — è il caso dei Movimenti.
     */
    it('⭐ spento: l’intestazione non è un pulsante', async () => {
      await apri();
      expect(screen.queryByRole('button', { name: /SKU/ })).toBeNull();
    });

    it('acceso: emette il ciclo e annuncia lo stato', async () => {
      const ospite = await apri();
      ospite.sortable.set(true);

      const intestazione = await screen.findByRole('button', { name: /SKU/ });
      fireEvent.click(intestazione);

      expect(ospite.sortChange).toHaveBeenCalledWith([{ columnId: 'sku', direction: 'asc' }]);
    });

    /**
     * ⭐ La prova che descrive la convenzione da gestionale: premere una seconda
     * colonna non azzera la prima — la scavalca, e la prima decide a parità.
     */
    it('⭐ una seconda colonna scavalca la prima, che resta come chiave secondaria', async () => {
      const ospite = await apri();
      ospite.sortable.set(true);
      ospite.sort.set([{ columnId: 'qta', direction: 'asc' }]);

      fireEvent.click(await screen.findByRole('button', { name: /SKU/ }));

      expect(ospite.sortChange).toHaveBeenCalledWith([
        { columnId: 'sku', direction: 'asc' },
        { columnId: 'qta', direction: 'asc' },
      ]);
    });

    /**
     * ⚠️ Con una chiave sola il numero NON compare: un «1» perenne accanto alla
     * freccia non informa di nulla. Compare da due in su, dove è l’unica cosa
     * che dice quale colonna comanda.
     */
    it('⚠️ il numero della chiave compare solo da due in su', async () => {
      const ospite = await apri();
      ospite.sortable.set(true);
      ospite.sort.set([{ columnId: 'sku', direction: 'asc' }]);

      expect(await screen.findByRole('button', { name: /SKU/ })).toBeTruthy();
      expect(screen.queryByText('1')).toBeNull();

      ospite.sort.set([
        { columnId: 'sku', direction: 'asc' },
        { columnId: 'qta', direction: 'desc' },
      ]);

      expect(await screen.findByText('1')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
    });

    it('annuncia aria-sort sulla SOLA colonna primaria', async () => {
      const ospite = await apri();
      ospite.sortable.set(true);
      ospite.sort.set([
        { columnId: 'sku', direction: 'desc' },
        { columnId: 'qta', direction: 'asc' },
      ]);

      const celle = await screen.findAllByRole('columnheader');
      expect(celle[0]?.getAttribute('aria-sort')).toBe('descending');
      // ⚠️ La secondaria NON lo annuncia: il suo posto è il nome del pulsante.
      expect(celle[1]?.getAttribute('aria-sort')).toBe('none');
      expect(
        screen.getByRole('button', { name: /Quantità: ordinamento crescente, chiave 2 di 2/ }),
      ).toBeTruthy();
    });
  });

  describe('selezione', () => {
    it('spenta: nessuna casella', async () => {
      await apri();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('accesa: una casella per riga più quella di testata', async () => {
      const ospite = await apri();
      ospite.selectionMode.set('multiple');

      expect(await screen.findAllByRole('checkbox')).toHaveLength(3);
    });

    it('la casella di riga emette la riga, non il solo id', async () => {
      const ospite = await apri();
      ospite.selectionMode.set('multiple');

      const caselle = await screen.findAllByRole('checkbox');
      fireEvent.click(caselle[1]!);

      expect(ospite.selectionChange).toHaveBeenCalledWith({ row: RIGHE[0], selected: true });
    });
  });

  /**
   * ⛔ Il testo semplice resta comodo (`cellText`); il template serve dove la
   * cella non è testo. Se il motore accettasse solo stringhe, pill, link e
   * monospace sparirebbero da tutti i riepiloghi.
   */
  it('⛔ un template di colonna vince sul testo semplice, su OGNI riga', async () => {
    await render(OspiteConTemplateComponent);

    const celle = screen.getAllByTestId('cella-ricca');
    expect(celle).toHaveLength(RIGHE.length);
    expect(celle[0]).toHaveTextContent('★ AAA');
    expect(celle[1]).toHaveTextContent('★ BBB');
  });
});

/**
 * ⛔ **Hover, cursore e fuoco distinguono un comando da un'informazione.**
 *
 * Il motore ha righe che intenzionalmente non si aprono — nel Registro
 * Corrispettivi solo le registrazioni manuali hanno una maschera dove andare —
 * e il mixin condiviso metteva l'hover su ogni `tr`: una riga informativa si
 * illuminava sotto il puntatore promettendo un'interazione che non arriva.
 *
 * ⚠️ Il CSS non si può asserire da qui. Quello che si fissa è il **gancio**: la
 * classe e il `tabindex` che dicono quali righe sono comandi. Se sparisse la
 * classe, lo stile smetterebbe di agire in silenzio — che è il modo in cui
 * questo genere di difetto passa (`14` §H14).
 */
describe('DataTableComponent — quali righe sono comandi', () => {
  it('⛔ spento: nessuna riga si dichiara cliccabile, e nessuna è una fermata del Tab', async () => {
    await apri();

    const righe = screen.getAllByRole('row').slice(1);
    expect(righe.every((riga) => !riga.classList.contains('data-table__row--clickable'))).toBe(
      true,
    );
    expect(righe.every((riga) => riga.getAttribute('tabindex') === null)).toBe(true);
  });

  it('⭐ acceso con un predicato: si marca solo la riga che si apre davvero', async () => {
    const ospite = await apri();
    ospite.rowClickable.set(true);
    // L'etichetta di riga esiste solo dove la riga si apre: aspettarla è anche
    // il modo di far arrivare il rilevamento prima di leggere il DOM.
    await screen.findByRole('row', { name: 'Apri AAA' });

    const righe = screen.getAllByRole('row').slice(1);
    expect(righe[0]?.classList.contains('data-table__row--clickable')).toBe(true);
    expect(righe[1]?.classList.contains('data-table__row--clickable')).toBe(false);
    // Un solo predicato governa mano e tastiera: non può esistere una riga che
    // si apre col mouse e non col Tab.
    expect(righe[0]?.getAttribute('tabindex')).toBe('0');
    expect(righe[1]?.getAttribute('tabindex')).toBeNull();
  });

  it('⛔ la riga selezionata si dichiara tale: il mixin ha la tinta, mancava il gancio', async () => {
    const ospite = await apri();
    ospite.selectionMode.set('multiple');
    ospite.selectedIds.set(new Set(['r2']));
    await screen.findAllByRole('checkbox');

    const righe = screen.getAllByRole('row').slice(1);
    expect(righe[0]?.classList.contains('is-selected')).toBe(false);
    expect(righe[1]?.classList.contains('is-selected')).toBe(true);
  });
});
