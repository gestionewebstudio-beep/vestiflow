import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import { TableViewId } from '@shared/table-columns/table-column.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { DataTableComponent } from './data-table.component';
import type { DataTableSection } from './data-table.model';

/**
 * ⭐ **I filtri di colonna nel motore** (`14` §0.2).
 *
 * Il motore fa due cose e basta: **disegna** il controllo giusto nella colonna
 * giusta, e **scrive** nello store della vista. A filtrare è chi possiede le
 * righe — la stessa separazione dell'ordinamento.
 */

interface Riga {
  readonly id: string;
  readonly stato: string;
  readonly codice: string;
  readonly totale: string;
}

const VISTA = TableViewId.SuppliersList;

const COLONNE: readonly ResolvedTableColumn[] = [
  // `values` per deduzione: non numerica, nessun `display`.
  { id: 'stato', label: 'Stato', pinned: false },
  // `text` per deduzione: porta un `display`.
  { id: 'codice', label: 'Codice', display: 'code', pinned: false },
  // `range` per deduzione: numerica.
  { id: 'totale', label: 'Totale', numeric: true, pinned: false },
  // Dichiarata NON filtrabile.
  { id: 'note', label: 'Note', filter: false, pinned: false },
];

const SEZIONI: readonly DataTableSection<Riga>[] = [
  {
    id: 'g1',
    header: '17 agosto',
    rows: [
      { id: 'a', stato: 'Confermato', codice: 'FT-1', totale: '100,00 €' },
      { id: 'b', stato: 'Bozza', codice: 'FT-2', totale: '50,00 €' },
    ],
  },
  {
    id: 'g2',
    header: '16 agosto',
    rows: [{ id: 'c', stato: 'Annullato', codice: 'FT-3', totale: '25,00 €' }],
  },
];

@Component({
  imports: [DataTableComponent],
  template: `
    <app-data-table
      [columns]="colonne"
      [sections]="sezioni"
      [viewId]="vista"
      [rowId]="rowId"
      [cellText]="cellText"
    />
  `,
})
class OspiteComponent {
  readonly store = inject(ColumnFilterStore);
  readonly colonne = COLONNE;
  readonly sezioni = SEZIONI;
  readonly vista = VISTA;
  readonly rowId = (r: Riga): string => r.id;
  readonly cellText = (r: Riga, id: string): string =>
    id === 'stato' ? r.stato : id === 'codice' ? r.codice : id === 'totale' ? r.totale : '';
}

/**
 * ⚠️ **Lo store è `providedIn: 'root'` e la sua memoria attraversa le prove.**
 * Ogni prova riparte da una vista pulita, altrimenti l'ordine di esecuzione
 * deciderebbe l'esito — il difetto più difficile da leggere in un test rosso.
 */
async function apriConFiltriAccesi(accesi: boolean) {
  const reso = await render(OspiteComponent);
  const store = TestBed.inject(ColumnFilterStore);
  store.azzera(VISTA);
  store.registraOpzioni(VISTA, (columnId) =>
    columnId === 'stato' ? ['Annullato', 'Bozza', 'Confermato'] : [],
  );
  if (store.acceso(VISTA)() !== accesi) {
    store.commuta(VISTA);
  }
  reso.fixture.detectChanges();
  return { reso, store };
}

describe('i controlli compaiono solo a filtri ACCESI', () => {
  /*
    ⚠️ **Spenti, l'intestazione torna alta quanto prima.** È la ragione per cui
    il pulsante «Filtri» esiste: i controlli costano altezza su ogni elenco, e
    chi non filtra non deve pagarla.
  */
  it('⚠️ spenti: nessun controllo nell’intestazione', async () => {
    await apriConFiltriAccesi(false);
    expect(screen.queryByLabelText('Filtra per Stato')).toBeNull();
    expect(screen.queryByLabelText('Filtra per Codice')).toBeNull();
    expect(screen.queryByLabelText('Totale da')).toBeNull();
  });

  it('accesi: ogni colonna filtrabile porta il suo', async () => {
    await apriConFiltriAccesi(true);
    expect(screen.getByLabelText('Filtra per Stato')).toBeTruthy();
    expect(screen.getByLabelText('Filtra per Codice')).toBeTruthy();
    expect(screen.getByLabelText('Totale da')).toBeTruthy();
    expect(screen.getByLabelText('Totale a')).toBeTruthy();
  });

  /*
    ⛔ **`filter: false` significa davvero niente.** È l'unico modo di dire «su
    questa colonna non si filtra», e se il motore lo ignorasse la dichiarazione
    non servirebbe a nulla.
  */
  it('⛔ una colonna dichiarata non filtrabile non ha controllo', async () => {
    await apriConFiltriAccesi(true);
    expect(screen.queryByLabelText('Filtra per Note')).toBeNull();
  });
});

describe('la forma del controllo si DEDUCE dalla colonna', () => {
  /*
    ⭐ La deduzione è già scritta e provata in `table-column-filter.util`: qui si
    verifica che il motore la **usi**, non che sia giusta.
  */
  it('⭐ values → un menu, text → una ricerca, range → due estremi', async () => {
    await apriConFiltriAccesi(true);

    expect(screen.getByLabelText('Filtra per Stato').tagName).not.toBe('INPUT');
    expect(screen.getByLabelText<HTMLInputElement>('Filtra per Codice').type).toBe('search');
    expect(screen.getByLabelText('Totale da')).toBeTruthy();
    expect(screen.getByLabelText('Totale a')).toBeTruthy();
  });
});

describe('le scelte di un filtro a valori', () => {
  /*
    ⛔ **Non vengono dalle sezioni che il motore riceve**, che sono già ristrette:
    le registra chi ha in mano le righe intere. Letto dalle righe filtrate, scelto
    «Bozza» sparirebbe «Confermato» — il filtro si stringerebbe e non si
    allargherebbe più.
  */
  it('⛔ arrivano dallo store, non dalle righe rese', async () => {
    const { reso } = await apriConFiltriAccesi(true);

    const menu = screen.getByLabelText('Filtra per Stato');
    menu.click();
    reso.fixture.detectChanges();

    /*
      ⚠️ **Si guardano le OPZIONI, non il testo della pagina**: «Annullato»
      compare anche nella cella della riga, e un `getByText` ne troverebbe due —
      la prova fallirebbe per ambiguità, non per il difetto che cerca.
    */
    const scelte = screen.getAllByRole('option').map((o) => o.textContent?.trim());
    expect(scelte).toContain('Annullato');
    expect(scelte).toContain('Confermato');
    expect(scelte).toContain('Bozza');
  });
});

describe('il motore PUBBLICA le proprie colonne', () => {
  /*
    ⭐ **Serve al telaio**, che sotto `lg` deve costruire il pannello e non
    conosce le preferenze colonne. Il motore le ha già in mano, quindi le
    espone: senza, il telaio dovrebbe iniettare quel servizio — e con esso
    `AuthService` — su ogni pagina elenco, anche dove filtri non ce ne sono.
  */
  it('⭐ le colonne visibili finiscono nello store della vista', async () => {
    await apriConFiltriAccesi(false);
    const store = TestBed.inject(ColumnFilterStore);

    expect(
      store
        .colonne(VISTA)()
        .map((c) => c.id),
    ).toEqual(['stato', 'codice', 'totale', 'note']);
  });
});

describe('il motore SCRIVE, non filtra', () => {
  it('un valore scelto finisce nello store della vista', async () => {
    const { reso, store } = await apriConFiltriAccesi(true);

    const cerca = screen.getByLabelText<HTMLInputElement>('Filtra per Codice');
    cerca.value = 'FT-2';
    cerca.dispatchEvent(new Event('input'));
    reso.fixture.detectChanges();

    expect(store.stato(VISTA)()['codice']).toEqual({ kind: 'text', text: 'FT-2' });
  });

  /*
    ⭐ **Il motore non tocca le righe**, come per l'ordinamento: le riceve già
    ristrette. Se filtrasse qui, i totali passati dall'esterno resterebbero quelli
    delle righe intere.
  */
  it('⭐ con un filtro attivo le righe rese restano quelle ricevute', async () => {
    const { reso } = await apriConFiltriAccesi(true);
    const store = TestBed.inject(ColumnFilterStore);
    store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: ['Bozza'] } });
    reso.fixture.detectChanges();

    expect(screen.getByText('FT-1')).toBeTruthy();
    expect(screen.getByText('FT-2')).toBeTruthy();
    expect(screen.getByText('FT-3')).toBeTruthy();
  });
});

describe('zero righe per i filtri', () => {
  @Component({
    imports: [DataTableComponent],
    template: `
      <app-data-table
        [columns]="colonne"
        [sections]="vuote"
        [viewId]="vista"
        [rowId]="rowId"
        [cellText]="cellText"
      />
    `,
  })
  class VuotaComponent {
    readonly colonne = COLONNE;
    readonly vuote: readonly DataTableSection<Riga>[] = [{ id: 'g1', rows: [] }];
    readonly vista = VISTA;
    readonly rowId = (r: Riga): string => r.id;
    readonly cellText = (): string => '';
  }

  /*
    ⛔ **La spiegazione sta DENTRO la tabella**, non nello stato vuoto della
    pagina: quello sostituirebbe la tabella e porterebbe via le intestazioni —
    cioè i controlli con cui si toglie il filtro. L'operatore resterebbe in un
    vicolo cieco.
  */
  it('⛔ con un filtro attivo la tabella spiega perché è vuota', async () => {
    const reso = await render(VuotaComponent);
    const store = TestBed.inject(ColumnFilterStore);
    store.imposta(VISTA, { columnId: 'stato', value: { kind: 'values', values: ['Bozza'] } });
    reso.fixture.detectChanges();

    expect(screen.getByText(/Nessuna riga corrisponde ai filtri/)).toBeTruthy();
    // L'intestazione resta: è da lì che si torna indietro.
    expect(screen.getByText('Stato')).toBeTruthy();
  });

  /*
    ⚠️ **Senza filtri attivi non dice niente**, e la condizione doppia serve a
    questo: una tabella momentaneamente vuota — in caricamento, o senza dati —
    annuncerebbe altrimenti una causa che non è la sua.
  */
  it('⚠️ senza filtri attivi non dichiara una causa che non c’è', async () => {
    const reso = await render(VuotaComponent);
    TestBed.inject(ColumnFilterStore).azzera(VISTA);
    reso.fixture.detectChanges();

    expect(screen.queryByText(/Nessuna riga corrisponde ai filtri/)).toBeNull();
  });
});
