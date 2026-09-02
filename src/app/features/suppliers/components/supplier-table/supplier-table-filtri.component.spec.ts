import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Supplier } from '@core/models/supplier.model';
import { ViewportService } from '@core/services/viewport.service';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { SUPPLIER_LIST_COLUMN_DEFS } from '../../models/supplier-table-columns.config';

import { SupplierTableComponent } from './supplier-table.component';

/**
 * ⭐ **IL PILOTA DEI FILTRI DI COLONNA, DA CAPO A FONDO** (`14` §0.2).
 *
 * ⛔ **Le prove di unità non bastavano, e questa è la lezione**: motore, telaio e
 * store avevano ognuno la propria prova verde, e sull'elenco vero **non filtrava
 * niente**. Un contratto a tre parti si rompe nel punto in cui le tre si
 * incontrano, che è l'unico posto che nessuna delle tre prove guardava.
 *
 * Qui si monta la composizione reale — telaio + tabella dumb + motore — e si fa
 * quello che fa l'operatore: accendere «Filtri», scrivere, contare le righe.
 */

const VISTA = TableViewId.SuppliersList;

/*
  ⭐ **Le colonne VERE dell'elenco, non un facsimile.**

  ⛔ La prima stesura le scriveva a mano, e per questo **non vedeva il difetto**:
  senza `filter` dichiarato ogni colonna deduce `values`, e «Ragione sociale»
  diventava un menu con un valore per riga. Legandole alle dichiarazioni reali, la
  forma del controllo è quella che l'operatore trova davvero.
*/
const COLONNE: readonly ResolvedTableColumn[] = SUPPLIER_LIST_COLUMN_DEFS.filter(
  (def) => def.defaultVisible !== false,
).map((def) => ({ ...def, pinned: false }));

function fornitore(id: string, code: string, name: string, city: string): Supplier {
  return {
    id,
    code,
    name,
    city,
    vatNumber: `IT${code}`,
    email: `${id}@esempio.it`,
    isActive: true,
  } as Supplier;
}

const FORNITORI: readonly Supplier[] = [
  fornitore('a', 'F-001', 'Rossi Tessuti', 'Napoli'),
  fornitore('b', 'F-002', 'Bianchi Moda', 'Milano'),
  fornitore('c', 'F-003', 'Verdi Filati', 'Napoli'),
];

function preferenzeFinte() {
  return {
    registerView: vi.fn(),
    columnDefs: vi.fn(() => COLONNE),
    visibleColumns: vi.fn(() => signal(COLONNE).asReadonly()),
    visibleColumnIds: vi.fn(() => COLONNE.map((c) => c.id)),
    state: vi.fn(() =>
      signal({
        presetId: 'default',
        columnOrder: COLONNE.map((c) => c.id),
        hiddenColumnIds: [] as string[],
        pinnedColumnIds: [] as string[],
        columnWidths: {},
      }).asReadonly(),
    ),
    presetMap: vi.fn(() => ({})),
    isColumnVisible: vi.fn(() => true),
    moveColumn: vi.fn(),
    toggleColumn: vi.fn(),
    togglePin: vi.fn(),
    applyPreset: vi.fn(),
    resetToDefault: vi.fn(),
    // Le larghezze si conservano (`14` §22.3): il motore le chiede al servizio.
    // Qui non si salva niente, e ogni colonna resta al proprio ripiego.
    columnWidth: vi.fn((_vista: unknown, _colonna: string, ripiego: number) => ripiego),
    setColumnWidths: vi.fn(),
  };
}

@Component({
  imports: [ListPageComponent, SupplierTableComponent],
  template: `
    <app-list-page
      pageTitle="Fornitori"
      [loading]="false"
      [skeletonColumns]="3"
      [columnsViewId]="vista"
    >
      <app-supplier-table data [viewId]="vista" [suppliers]="fornitori" [columns]="colonne" />
    </app-list-page>
  `,
})
class PaginaFintaComponent {
  readonly vista = VISTA;
  readonly fornitori = FORNITORI;
  readonly colonne = COLONNE;
}

async function apri(compatta = false) {
  const reso = await render(PaginaFintaComponent, {
    providers: [
      { provide: ViewportService, useValue: { compact: signal(compatta) } },
      { provide: TableColumnPreferenceService, useValue: preferenzeFinte() },
    ],
  });
  return { reso, store: TestBed.inject(ColumnFilterStore) };
}

/** Le righe di dato rese adesso (l'intestazione non conta). */
function righeVisibili(): number {
  return document.querySelectorAll('tbody tr.data-table__row').length;
}

describe('Fornitori — i filtri di colonna, come li usa l’operatore', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('⛔ a filtri spenti nessun controllo, e tutte le righe', async () => {
    await apri();

    expect(screen.queryByLabelText('Filtra per Ragione sociale')).toBeNull();
    expect(righeVisibili()).toBe(3);
  });

  /*
    ⭐ **Il gesto vero**: si preme «Filtri», compaiono i controlli nelle
    intestazioni. È il passaggio che nessuna prova di unità copriva — il telaio
    scrive nello store, il motore lo legge, e i due si parlano solo qui.
  */
  it('⭐ «Filtri» accende i controlli nelle intestazioni', async () => {
    const { reso } = await apri();

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();

    expect(screen.getByLabelText('Filtra per Ragione sociale')).toBeTruthy();
    expect(screen.getByLabelText('Filtra per Codice')).toBeTruthy();
    expect(screen.getByLabelText('Filtra per Città')).toBeTruthy();
  });

  /*
    ⛔ **E l'elenco si stringe DAVVERO.** È il difetto che la guardia
    `check:filtri-colonna` presidia: controlli accesi che non restringono niente
    sono un comando che finge di funzionare.
  */
  it('⛔ scrivere in un filtro restringe le righe', async () => {
    const { reso } = await apri();

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();

    await userEvent.type(screen.getByLabelText('Filtra per Ragione sociale'), 'rossi');
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(1);
    /*
      ⚠️ **La cella, non il testo della pagina**: sotto la riga vive anche la
      **card** (`appRowCard`), che porta lo stesso nome. Un `getByText` ne trova
      due e fallisce per ambiguità invece che per il difetto — è la conseguenza
      diretta delle due vesti che convivono nel DOM.
    */
    expect(document.querySelector('td[data-label="Ragione sociale"]')?.textContent?.trim()).toBe(
      'Rossi Tessuti',
    );
  });

  /*
    ⭐ **Le scelte di un filtro a valori sono quelle PRESENTI**: «Napoli» e
    «Milano», non un elenco dichiarato altrove.
  */
  it('⭐ un filtro a valori offre i valori della colonna', async () => {
    const { reso } = await apri();

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();

    await userEvent.click(screen.getByLabelText('Filtra per Città'));
    reso.fixture.detectChanges();

    const scelte = screen.getAllByRole('option').map((o) => o.textContent?.trim());
    expect(scelte).toContain('Napoli');
    expect(scelte).toContain('Milano');
  });

  /*
    ⛔ **Sceglierlo deve RESTRINGERE**, e vederlo nell'elenco non lo dimostra: le
    due cose passano per strade diverse — le scelte le registra chi ha le righe,
    la selezione la scrive il motore. Una prova che si ferma all'elenco delle
    voci lascia scoperta proprio la metà che agisce.
  */
  it('⛔ scegliere un valore dal menu restringe le righe', async () => {
    const { reso } = await apri();

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();

    await userEvent.click(screen.getByLabelText('Filtra per Città'));
    reso.fixture.detectChanges();

    await userEvent.click(screen.getByRole('option', { name: 'Milano' }));
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(1);
  });

  /*
    ⛔ **Spegnere «Filtri» azzera**, e l'elenco torna intero: è la regola che
    impedisce di restare con un elenco ristretto da un controllo invisibile.
  */
  it('⛔ spegnere «Filtri» rimette tutte le righe', async () => {
    const { reso } = await apri();

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();
    await userEvent.type(screen.getByLabelText('Filtra per Ragione sociale'), 'rossi');
    reso.fixture.detectChanges();
    expect(righeVisibili()).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(3);
    expect(screen.queryByLabelText('Filtra per Ragione sociale')).toBeNull();
  });

  /*
    ⛔ **Zero risultati non fa sparire la tabella**: l'intestazione resta, perché
    è da lì che si torna indietro.
  */
  it('⛔ senza risultati la tabella spiega, e i controlli restano', async () => {
    const { reso } = await apri();

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();

    // ⚠️ Il testo si scrive nella ricerca del PANNELLO, che va aperto.
    await userEvent.click(screen.getByRole('button', { name: 'Filtra per Ragione sociale' }));
    reso.fixture.detectChanges();
    await userEvent.type(screen.getByLabelText('Cerca fra i valori di Ragione sociale'), 'zzz');
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(0);
    expect(screen.getByText(/Nessuna riga corrisponde ai filtri/)).toBeTruthy();
    /*
      ⚠️ **`getByRole`, non `getByLabelText`**: aperto, il pannello porta lo
      stesso `aria-label` del trigger — l'etichetta ne troverebbe due.
    */
    expect(screen.getByRole('button', { name: 'Filtra per Ragione sociale' })).toBeTruthy();
  });
});
