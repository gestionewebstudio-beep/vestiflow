import { Component, signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TestBed } from '@angular/core/testing';

import { ViewportService } from '@core/services/viewport.service';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { TableViewId } from '@shared/table-columns/table-column.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { ListPageComponent } from './list-page.component';

/**
 * ⭐ **La macchina degli stati è dello SHELL, non del consumer.**
 *
 * È il guadagno principale del telaio: quei quattro rami erano scritti undici
 * volte, identici. Se si rompono qui, si rompono ovunque — quindi sono la parte
 * che queste prove presidiano per prima.
 */

/** Un consumer finto che riempie tutti gli slot, per verificare la proiezione. */
@Component({
  imports: [ListPageComponent],
  template: `
    <app-list-page
      pageTitle="Fornitori"
      [loading]="loading"
      [error]="error"
      [isEmpty]="isEmpty"
      [skeletonColumns]="5"
      [emptyTitle]="emptyTitle"
      (retry)="onRetry()"
    >
      <button pageActions type="button">Nuovo fornitore</button>
      <div filters>un filtro</div>
      <div warnings>un avviso</div>
      <table data>
        <tbody>
          <tr>
            <td>una riga</td>
          </tr>
        </tbody>
      </table>
      <div empty>vuoto su misura</div>
      <div summary>1–4 di 4</div>
      <div listActions>azioni di elenco</div>
    </app-list-page>
  `,
})
class ConsumerFintoComponent {
  loading = false;
  error: string | null = null;
  isEmpty = false;
  emptyTitle: string | undefined = undefined;
  readonly onRetry = vi.fn();
}

function monta(stato: Partial<ConsumerFintoComponent> = {}) {
  return render(ConsumerFintoComponent, { componentProperties: stato });
}

describe('ListPageComponent — la macchina degli stati', () => {
  it('⭐ caricando mostra lo scheletro, e NON i dati', async () => {
    await monta({ loading: true });

    expect(document.querySelector('app-table-skeleton')).not.toBeNull();
    expect(screen.queryByText('una riga')).toBeNull();
  });

  it('⭐ in errore mostra il messaggio, e NON i dati', async () => {
    await monta({ error: 'Connessione assente' });

    expect(screen.getByText('Connessione assente')).toBeVisible();
    expect(screen.queryByText('una riga')).toBeNull();
  });

  it('⭐ l’errore batte il vuoto: un elenco che non ha caricato non è vuoto', async () => {
    // ⚠️ È l'ordine dei rami, e conta: dire «nessun risultato» quando la
    //    richiesta è fallita manda l'operatore a cercare un filtro sbagliato.
    await monta({ error: 'Connessione assente', isEmpty: true });

    expect(screen.getByText('Connessione assente')).toBeVisible();
    expect(screen.queryByText('vuoto su misura')).toBeNull();
  });

  it('⭐ e il caricamento batte l’errore precedente', async () => {
    await monta({ loading: true, error: 'Connessione assente' });

    expect(document.querySelector('app-table-skeleton')).not.toBeNull();
    expect(screen.queryByText('Connessione assente')).toBeNull();
  });

  it('✅ a regime mostra i dati', async () => {
    await monta();

    expect(screen.getByText('una riga')).toBeVisible();
    expect(document.querySelector('app-table-skeleton')).toBeNull();
  });

  it('✅ «Riprova» chiede al consumer di ricaricare', async () => {
    const { fixture } = await monta({ error: 'Connessione assente' });

    await userEvent.click(screen.getByRole('button', { name: 'Riprova' }));

    expect(fixture.componentInstance.onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ListPageComponent — lo stato vuoto ha due forme', () => {
  it('⭐ senza `emptyTitle` usa quello proiettato dal consumer', async () => {
    await monta({ isEmpty: true });

    expect(screen.getByText('vuoto su misura')).toBeVisible();
    expect(document.querySelector('app-empty-state')).toBeNull();
  });

  it('⭐ con `emptyTitle` usa quello standard, e non entrambi', async () => {
    await monta({ isEmpty: true, emptyTitle: 'Nessun fornitore' });

    expect(screen.getByText('Nessun fornitore')).toBeVisible();
    expect(screen.queryByText('vuoto su misura')).toBeNull();
  });
});

describe('ListPageComponent — le zone', () => {
  // ⚠️ **Un montaggio per prova.** `TestBed` non si riconfigura dentro un solo
  //    `it`: un ciclo che monta quattro volte fallisce, e non per il motivo che
  //    la prova vuole misurare.
  it.each([
    ['caricando', { loading: true }],
    ['in errore', { error: 'Connessione assente' }],
    ['vuoto', { isEmpty: true }],
    ['a regime', {}],
  ])('⭐ %s: testata, strumenti, avvisi, totali e funzioni restano', async (_nome, stato) => {
    // ⚠️ Non stanno dentro i rami: la testata deve restare mentre l'elenco
    //    carica, o la pagina «sparisce» a ogni ricarica.
    await monta(stato);

    expect(screen.getByRole('heading', { name: 'Fornitori' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Nuovo fornitore' })).toBeVisible();
    expect(screen.getByText('un filtro')).toBeVisible();
    expect(screen.getByText('un avviso')).toBeVisible();
    expect(screen.getByText('1–4 di 4')).toBeVisible();
    expect(screen.getByText('azioni di elenco')).toBeVisible();
  });

  it('⛔ nessun sottotitolo: il telaio non ne rende, e nessuno può passarlo', async () => {
    // Decisione del proprietario del 29/08/2026: «non servono, recuperiamo
    // spazio». Un input rimosso è più forte di una convenzione.
    await render(ListPageComponent, {
      inputs: { pageTitle: 'Clienti', loading: false, skeletonColumns: 4 },
    });

    expect(screen.getByRole('heading', { name: 'Clienti' })).toBeVisible();
    expect(document.querySelector('.list-page__subtitle')).toBeNull();
  });
});

/**
 * ⭐ **Il pannello filtri compatto, e la casella degli overlay.**
 *
 * ⛔ Il telaio non ha una casella senza nome: il contenuto proiettato che non
 * trova uno slot Angular lo **elimina dal DOM**, senza errori e senza test
 * rossi. Misurato il 29/08/2026 — due pannelli persi in silenzio. Queste prove
 * inchiodano le caselle che li hanno rimessi al loro posto.
 */
@Component({
  imports: [ListPageComponent],
  template: `
    <app-list-page
      pageTitle="Ordini fornitore"
      [loading]="false"
      [skeletonColumns]="5"
      [activeFilterCount]="attivi"
      (filtersCleared)="onAzzera()"
    >
      <div period>periodo in barra</div>
      <div filters>un filtro</div>
      <div data>le righe</div>
      <div overlays>un pannello di azione</div>
    </app-list-page>
  `,
})
class ConsumerVestiComponent {
  attivi = 0;
  readonly onAzzera = vi.fn();
}

async function montaVesti(opzioni: { compatta?: boolean; attivi?: number } = {}) {
  return render(ConsumerVestiComponent, {
    componentProperties: { attivi: opzioni.attivi ?? 0 },
    providers: [
      { provide: ViewportService, useValue: { compact: signal(opzioni.compatta ?? false) } },
    ],
  });
}

describe('ListPageComponent — le due vesti dei filtri', () => {
  it('⭐ `[overlays]` arriva nel DOM: senza slot Angular lo scarterebbe', async () => {
    await montaVesti();

    expect(screen.getByText('un pannello di azione')).toBeVisible();
  });

  it('⭐ `[period]` sta in barra, e ci resta anche nella veste compatta', async () => {
    await montaVesti({ compatta: true });

    const periodo = screen.getByText('periodo in barra');
    expect(periodo).toBeVisible();
    // ⚠️ Periodo e Ricerca non entrano nel pannello: sono i due esterni alle
    //    colonne (`14` §0.2). Se finisse dentro, sarebbe nascosto di default.
    expect(periodo.closest('.list-page__filters')).toBeNull();
  });

  it('⭐ il pannello nasce CHIUSO e «Filtri» lo apre', async () => {
    await montaVesti({ compatta: true });
    const pannello = document.querySelector('.list-page__filters');

    expect(pannello).not.toBeNull();
    expect(pannello?.classList.contains('list-page__filters--open')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));

    expect(pannello?.classList.contains('list-page__filters--open')).toBe(true);
    expect(pannello?.getAttribute('role')).toBe('dialog');
  });

  it('⛔ chiudere il pannello NON azzera: si perderebbe ciò che si è appena scelto', async () => {
    const { fixture } = await montaVesti({ compatta: true });
    const consumer = fixture.componentInstance;

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Vedi risultati' }));

    expect(document.querySelector('.list-page__filters--open')).toBeNull();
    expect(consumer.onAzzera).not.toHaveBeenCalled();
  });

  it('⭐ «Azzera filtri» del pannello azzera, ed è esplicito', async () => {
    const { fixture } = await montaVesti({ compatta: true });

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));

    expect(fixture.componentInstance.onAzzera).toHaveBeenCalledTimes(1);
  });

  it('⭐ su scrivania spegnere «Filtri» AZZERA — ha preso il posto di «Azzera filtri»', async () => {
    const { fixture } = await montaVesti();
    const bottone = screen.getByRole('button', { name: /Filtri/ });

    await userEvent.click(bottone); // acceso: non azzera
    expect(fixture.componentInstance.onAzzera).not.toHaveBeenCalled();

    await userEvent.click(bottone); // spento: azzera
    expect(fixture.componentInstance.onAzzera).toHaveBeenCalledTimes(1);
  });

  it('⭐ il conteggio compare sul pulsante solo se c’è', async () => {
    await montaVesti({ attivi: 2 });

    expect(screen.getByRole('button', { name: /Filtri\s*\(2\)/ })).toBeVisible();
  });

  it('⭐ nella veste estesa i filtri NON sono un pannello', async () => {
    await montaVesti();
    const filtri = document.querySelector('.list-page__filters');

    expect(filtri?.classList.contains('list-page__filters--panel')).toBe(false);
    expect(filtri?.getAttribute('role')).toBeNull();
    expect(screen.getByText('un filtro')).toBeVisible();
  });
});

/**
 * ⭐ **I FILTRI DI COLONNA NEL TELAIO** (`14` §0.2).
 *
 * Il telaio ne fa due cose: **conta** quelli attivi sul pulsante, e sotto `lg`
 * **li mostra nel pannello** — dove le intestazioni di colonna non esistono.
 */

const COLONNE_VISTA: readonly ResolvedTableColumn[] = [
  { id: 'stato', label: 'Stato', pinned: false },
  { id: 'codice', label: 'Codice', display: 'code', pinned: false },
  // ⛔ Dichiarata non filtrabile: non deve comparire nel pannello.
  { id: 'note', label: 'Note', filter: false, pinned: false },
];

function preferenzeConVista() {
  return {
    registerView: vi.fn(),
    columnDefs: vi.fn(() => COLONNE_VISTA),
    visibleColumns: vi.fn(() => signal(COLONNE_VISTA).asReadonly()),

    visibleColumnIds: vi.fn(() => COLONNE_VISTA.map((c) => c.id)),
    state: vi.fn(() =>
      signal({
        presetId: 'default',
        columnOrder: COLONNE_VISTA.map((c) => c.id),
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
  imports: [ListPageComponent],
  template: `
    <app-list-page
      pageTitle="Fornitori"
      [loading]="false"
      [skeletonColumns]="5"
      [activeFilterCount]="attivi"
      [columnsViewId]="vista"
    >
      <div data>le righe</div>
    </app-list-page>
  `,
})
class ConsumerColonneComponent {
  attivi = 0;
  readonly vista = TableViewId.SuppliersList;
}

async function montaColonne(opzioni: { compatta?: boolean; attivi?: number } = {}) {
  const reso = await render(ConsumerColonneComponent, {
    componentProperties: { attivi: opzioni.attivi ?? 0 },
    providers: [
      { provide: ViewportService, useValue: { compact: signal(opzioni.compatta ?? false) } },
      { provide: TableColumnPreferenceService, useValue: preferenzeConVista() },
    ],
  });
  const store = TestBed.inject(ColumnFilterStore);
  store.azzera(TableViewId.SuppliersList);
  /*
    ⚠️ **Le colonne le pubblica il MOTORE TABELLA**, che qui non c'è: il consumer
    di prova proietta un `<div data>`. Registrarle a mano è quindi la fedeltà
    giusta — si verifica che il telaio renda ciò che lo store espone, non che il
    motore lo popoli (quello ha la sua prova).
  */
  store.registraColonne(TableViewId.SuppliersList, COLONNE_VISTA);
  reso.fixture.detectChanges();
  return { reso, store };
}

describe('ListPageComponent — i filtri di colonna', () => {
  /*
    ⭐ **Sotto `lg` il controllo di colonna diventa una voce di pannello**: lì le
    intestazioni non esistono, quindi non c'è dove metterlo.
  */
  it('⭐ nel pannello compatto c’è una voce per colonna filtrabile', async () => {
    const { reso } = await montaColonne({ compatta: true });

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ }));
    reso.fixture.detectChanges();

    expect(screen.getByLabelText('Filtra per Stato')).toBeTruthy();
    expect(screen.getByLabelText('Filtra per Codice')).toBeTruthy();
    // ⛔ `filter: false` vale anche qui.
    expect(screen.queryByLabelText('Filtra per Note')).toBeNull();
  });

  /*
    ⛔ **Sopra `lg` NON si rendono**, e non con un `display: none`: là i controlli
    vivono nelle intestazioni di colonna, e averli in due posti insieme è «la
    stessa riga esiste due volte» (`regole-stile-ui` §9).
  */
  it('⛔ nella veste estesa il pannello non li duplica', async () => {
    await montaColonne();

    expect(screen.queryByLabelText('Filtra per Stato')).toBeNull();
    expect(screen.queryByLabelText('Filtra per Codice')).toBeNull();
  });

  /*
    ⛔ **Il badge somma dominio e colonne.** Durante la migrazione un elenco può
    avere entrambi: contarne uno solo direbbe «nessun filtro» a un elenco
    ristretto, che è il difetto per cui il badge esiste.
  */
  it('⛔ il conteggio somma i filtri di dominio e quelli di colonna', async () => {
    const { reso, store } = await montaColonne({ attivi: 2 });

    store.imposta(TableViewId.SuppliersList, {
      columnId: 'stato',
      value: { kind: 'values', values: ['Bozza'] },
    });
    reso.fixture.detectChanges();

    expect(screen.getByRole('button', { name: /Filtri\s*\(3\)/ })).toBeVisible();
  });

  /*
    ⛔ **Spegnere «Filtri» azzera anche quelli di colonna** (`14` §0.2): un filtro
    attivo il cui controllo non si vede è lo stato che la regola vieta.
  */
  it('⛔ su scrivania spegnere «Filtri» cancella i filtri di colonna', async () => {
    const { reso, store } = await montaColonne();

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ })); // acceso
    store.imposta(TableViewId.SuppliersList, {
      columnId: 'stato',
      value: { kind: 'values', values: ['Bozza'] },
    });
    reso.fixture.detectChanges();
    expect(store.conteggio(TableViewId.SuppliersList)()).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: /Filtri/ })); // spento
    expect(store.conteggio(TableViewId.SuppliersList)()).toBe(0);
  });
});
