import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { ViewportService } from '@core/services/viewport.service';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { GOODS_RECEIPT_LIST_COLUMN_DEFS } from '../../models/document-table-columns.config';

import { DocumentTableComponent } from './document-table.component';

/**
 * ⭐ **I FILTRI DI COLONNA SU ARRIVI MERCE, come li usa l'operatore.**
 *
 * ⛔ **Segnalato dal proprietario il 01/09/2026 a schermo**: «i filtri non
 * funzionano». Erano cablati e provati sul pilota, ma qui gli **estrattori**
 * coprivano tre colonne su cinque — e una colonna numerica senza `numeroDi`
 * mostra i due campi da–a e non restringe niente.
 *
 * ⚠️ **Le colonne sono quelle VERE dell'elenco**, non un facsimile: è la sola
 * forma di prova che vede un estrattore mancante, perché il difetto sta proprio
 * nella corrispondenza fra le colonne dichiarate e quelle coperte.
 */

const VISTA = TableViewId.GoodsReceiptDocumentsList;

const COLONNE: readonly ResolvedTableColumn[] = GOODS_RECEIPT_LIST_COLUMN_DEFS.filter(
  (def) => def.defaultVisible !== false,
).map((def) => ({ ...def, pinned: false }));

function arrivo(
  id: string,
  reference: string,
  supplierName: string,
  documentDate: string,
  lineCount: number,
  totalMinor: number,
): DocumentRecord {
  return {
    id,
    type: DocumentType.GoodsReceipt,
    reference,
    supplierName,
    documentDate,
    lineCount,
    status: 'confirmed',
    subtotal: { amountMinor: totalMinor, currencyCode: 'EUR' },
    tax: { amountMinor: 0, currencyCode: 'EUR' },
    total: { amountMinor: totalMinor, currencyCode: 'EUR' },
    lines: [],
    locationName: id === 'c' ? 'Magazzino test 4' : 'Magazzino test 3',
  } as unknown as DocumentRecord;
}

const ARRIVI: readonly DocumentRecord[] = [
  arrivo('a', 'CAR-0013', 'fornitore test 1', '2026-08-17', 1, 1830),
  arrivo('b', 'CAR-0009', 'fornitore test 2', '2026-08-11', 7, 5368),
  arrivo('c', 'CAR-0004', 'fornitore test 1', '2026-08-04', 3, 1332),
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
  };
}

@Component({
  imports: [ListPageComponent, DocumentTableComponent],
  template: `
    <app-list-page
      pageTitle="Arrivi merce"
      [loading]="false"
      [skeletonColumns]="6"
      [columnsViewId]="vista"
    >
      <app-document-table data [viewId]="vista" [documents]="arrivi" [columns]="colonne" />
    </app-list-page>
  `,
})
class PaginaFintaComponent {
  readonly vista = VISTA;
  readonly arrivi = ARRIVI;
  readonly colonne = COLONNE;
}

async function apriConFiltri() {
  const reso = await render(PaginaFintaComponent, {
    providers: [
      { provide: ViewportService, useValue: { compact: signal(false) } },
      { provide: TableColumnPreferenceService, useValue: preferenzeFinte() },
    ],
  });
  TestBed.inject(ColumnFilterStore).azzera(VISTA);
  await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
  reso.fixture.detectChanges();
  return reso;
}

function righeVisibili(): number {
  return document.querySelectorAll('tbody tr.data-table__row').length;
}

/**
 * ⚠️ **I comandi stanno DENTRO il pannello**, da quando il controllo di filtro
 * è uno solo (01/09/2026): la prova lo apre, come fa l'operatore.
 */
async function apriPannello(nomeColonna: string, reso: { fixture: { detectChanges(): void } }) {
  await userEvent.click(screen.getByLabelText(`Filtra per ${nomeColonna}`));
  reso.fixture.detectChanges();
}

describe('Arrivi merce — i filtri di colonna', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('il numero documento si filtra scrivendone un pezzo', async () => {
    const reso = await apriConFiltri();

    await apriPannello('N.', reso);
    await userEvent.type(screen.getByLabelText('Cerca fra i valori di N.'), '0009');
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(1);
  });

  it('il soggetto si filtra scrivendone un pezzo', async () => {
    const reso = await apriConFiltri();

    await apriPannello('Soggetto', reso);
    await userEvent.type(screen.getByLabelText('Cerca fra i valori di Soggetto'), 'test 1');
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(2);
  });

  /*
    ⛔ **Qui c'era la prova sulla colonna «Righe»**, tolta col 01/09/2026 insieme
    alla colonna — «non serve a nulla, può essere rimossa ovunque». Diceva una
    cosa che resta vera e che la prova qui sotto continua a dire: un filtro a
    intervallo su una colonna numerica deve restringere davvero, e senza il suo
    estrattore mostra due campi che non fanno niente.
  */
  it('il totale documento si filtra per intervallo, in unità minori', async () => {
    const reso = await apriConFiltri();

    /*
      ⚠️ **In unità MINORI**: 1500 significa 15,00 €, e sotto c'è la sola riga da
      13,32 €. Scrivendo la prova avevo messo 2000 aspettandomi una riga sola —
      ma 18,30 € e 13,32 € ci stanno entrambe sotto. Il codice aveva ragione.
    */
    await apriPannello('Tot. documento', reso);
    await userEvent.type(screen.getByLabelText('Tot. documento a'), '1500');
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(1);
  });

  /*
    ⭐ **Il menu a valori è l'ultimo dei tre controlli**, e su questo elenco è
    «Sede»: le scelte sono i valori PRESENTI, e sceglierne uno deve restringere.
  */
  it('⭐ la sede si sceglie dal menu, e restringe', async () => {
    const reso = await apriConFiltri();

    await userEvent.click(screen.getByLabelText('Filtra per Sede'));
    reso.fixture.detectChanges();

    const scelte = screen.getAllByRole('option').map((o) => o.textContent?.trim());
    expect(scelte).toContain('Magazzino test 3');

    await userEvent.click(screen.getByRole('option', { name: 'Magazzino test 3' }));
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(2);
  });

  /*
    ⚠️ **La data si confronta in ISO**, non sul testo mostrato: «17 ago 2026»
    come stringa non si ordina.
  */
  it('⚠️ la data del documento si filtra per intervallo', async () => {
    const reso = await apriConFiltri();

    await apriPannello('Data', reso);
    const dal = screen.getByLabelText('Data dal');
    await userEvent.type(dal, '11/08/2026');
    dal.dispatchEvent(new Event('blur'));
    reso.fixture.detectChanges();

    expect(righeVisibili()).toBe(2);
  });
});
