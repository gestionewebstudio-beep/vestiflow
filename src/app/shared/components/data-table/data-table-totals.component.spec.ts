import { Component, signal } from '@angular/core';
import { render } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { DataTableComponent } from './data-table.component';
import type { DataTableSection, DataTableTotals } from './data-table.model';

/**
 * ⭐ **La riga TOTALI copre la larghezza della tabella.**
 *
 * ⛔ **Il difetto che questi test misurano**: segnalato dal proprietario il
 * 31/08/2026 sui Prodotti, con la freccia sulla schermata — l'ultima riga di dati
 * si vedeva **attraverso** la riga totali, che copriva solo la prima colonna.
 *
 * La riga è `position: sticky` in fondo: se le sue celle non coprono tutta la
 * larghezza, il contenuto che scorre sotto **traspare**. Il fondo opaco c'è; a
 * mancare era la larghezza.
 */

interface Riga {
  readonly id: string;
  readonly nome: string;
  readonly varianti: string;
}

/** Le colonne di Prodotti, che è l'elenco su cui il difetto si è visto. */
const COLONNE: readonly ResolvedTableColumn[] = [
  { id: 'name', label: 'Nome', pinned: false },
  { id: 'brand', label: 'Venditore/Brand', pinned: false },
  { id: 'category', label: 'Categoria', pinned: false },
  { id: 'season', label: 'Stagione', pinned: false },
  { id: 'variants', label: 'Varianti', numeric: true, pinned: false },
  { id: 'status', label: 'Stato', pinned: false },
  { id: 'source', label: 'Origine', pinned: false },
  { id: 'shopify', label: 'Shopify', pinned: false },
];

@Component({
  imports: [DataTableComponent],
  template: `
    <app-data-table
      [columns]="colonne"
      [sections]="sezioni"
      [rowId]="rowId"
      [cellText]="cellText"
      [selectionMode]="'multiple'"
      [totals]="totals()"
    />
  `,
})
class OspiteComponent {
  readonly colonne = COLONNE;
  readonly sezioni: readonly DataTableSection<Riga>[] = [
    { id: 'p', rows: [{ id: 'r1', nome: 'The Minimal Snowboard', varianti: '3' }] },
  ];
  readonly totals = signal<DataTableTotals | null>(null);
  readonly rowId = (r: Riga): string => r.id;
  readonly cellText = (r: Riga, id: string): string => (id === 'name' ? r.nome : r.varianti);
}

/** Quante colonne copre in tutto la riga totali. */
function larghezzaDelPiede(): number {
  const riga = document.querySelector('tfoot tr');
  expect(riga, 'la riga totali non è resa').not.toBeNull();
  return [...riga!.querySelectorAll('td')].reduce(
    (somma, cella) => somma + Number(cella.getAttribute('colspan') ?? 1),
    0,
  );
}

/** Le colonne della tabella, contando quella delle caselle. */
const LARGHEZZA_ATTESA = COLONNE.length + 1;

describe('riga totali — copre tutta la tabella', () => {
  /*
    ⛔ **Il caso del difetto**: una sola colonna sommabile, e per giunta non
    l'ultima. Su Prodotti l'unico totale è «Varianti», che è la quinta di otto.
  */
  it('⛔ con UN solo totale copre comunque tutta la larghezza', async () => {
    const reso = await render(OspiteComponent);
    reso.fixture.componentInstance.totals.set({ count: 50, values: { variants: '29' } });
    reso.fixture.detectChanges();

    expect(larghezzaDelPiede()).toBe(LARGHEZZA_ATTESA);
  });

  it('con più totali copre tutta la larghezza', async () => {
    const reso = await render(OspiteComponent);
    reso.fixture.componentInstance.totals.set({
      count: 50,
      values: { variants: '29', status: 'x' },
    });
    reso.fixture.detectChanges();

    expect(larghezzaDelPiede()).toBe(LARGHEZZA_ATTESA);
  });

  /*
    ⚠️ **Il caso limite che il difetto rende evidente**: nessun valore da sommare.
    Il conteggio resta — la riga non sparisce mai — e deve coprire da solo.
  */
  it('⚠️ senza nessun valore il conteggio copre da solo tutta la larghezza', async () => {
    const reso = await render(OspiteComponent);
    reso.fixture.componentInstance.totals.set({ count: 50, values: {} });
    reso.fixture.detectChanges();

    expect(larghezzaDelPiede()).toBe(LARGHEZZA_ATTESA);
  });

  it("l'ultima colonna sommabile non lascia scoperto ciò che la segue", async () => {
    const reso = await render(OspiteComponent);
    reso.fixture.componentInstance.totals.set({ count: 50, values: { shopify: 'x' } });
    reso.fixture.detectChanges();

    expect(larghezzaDelPiede()).toBe(LARGHEZZA_ATTESA);
  });
});
