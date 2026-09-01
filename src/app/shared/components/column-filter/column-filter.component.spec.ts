import { Component, signal } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import type { ColumnFilterValue } from '@shared/table-columns/column-filter.model';
import type { TableColumnFilterKind } from '@shared/table-columns/table-column.model';

import { ColumnFilterComponent } from './column-filter.component';

@Component({
  imports: [ColumnFilterComponent],
  template: `
    <app-column-filter
      [kind]="kind()"
      [columnLabel]="'Totale'"
      [options]="options()"
      [value]="value()"
      (changed)="changed($event)"
    />
  `,
})
class OspiteComponent {
  readonly kind = signal<TableColumnFilterKind>('range');
  readonly options = signal<readonly string[]>([]);
  readonly value = signal<ColumnFilterValue | null>(null);
  readonly changed = vi.fn();
}

async function apri(kind: TableColumnFilterKind): Promise<OspiteComponent> {
  const reso = await render(OspiteComponent);
  reso.fixture.componentInstance.kind.set(kind);
  reso.fixture.detectChanges();
  return reso.fixture.componentInstance;
}

/**
 * L'ultimo valore emesso.
 *
 * ⛔ **Niente `?? undefined` in coda**, ed è l'errore che questa prova ha
 * trovato in se stessa: `??` scatta anche su `null`, cioè proprio sul valore
 * che i test verificano — «svuotare TOGLIE il filtro». Tre prove fallivano per
 * un difetto dell'helper, non del componente.
 */
function emesso(o: OspiteComponent): ColumnFilterValue | null | undefined {
  const chiamata = o.changed.mock.calls.at(-1);
  return chiamata === undefined ? undefined : (chiamata[0] as ColumnFilterValue | null);
}

describe('filtro di testo', () => {
  it('emette il testo scritto', async () => {
    const o = await apri('text');
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'maglia' } });
    expect(emesso(o)).toEqual({ kind: 'text', text: 'maglia' });
  });

  /*
    ⛔ **Svuotare TOGLIE il filtro**, e deve emettere `null`: un valore vuoto
    lascerebbe il filtro attivo su una stringa vuota, e l'elenco non tornerebbe
    più completo senza che nulla lo spieghi.
  */
  it('⛔ svuotare emette null, non un testo vuoto', async () => {
    const o = await apri('text');
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'x' } });
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: '   ' } });
    expect(emesso(o)).toBeNull();
  });
});

describe('filtro a intervallo', () => {
  /*
    ⚠️ **Due funzioni nominate, non un array indicizzato**:
    `noUncheckedIndexedAccess` rende `daCampo()` possibilmente `undefined`, e
    un `!` per zittirlo toglierebbe proprio la garanzia che quel flag dà.
  */
  const daCampo = (): HTMLElement => screen.getByLabelText('Totale da');
  const aCampo = (): HTMLElement => screen.getByLabelText('Totale a');

  it('emette il solo estremo compilato', async () => {
    const o = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '100' } });
    expect(emesso(o)).toEqual({ kind: 'range', min: 100 });
  });

  /*
    ⛔ **`Number('')` vale ZERO**, ed è la trappola di questo controllo: letto
    così, svuotare il campo «da» imporrebbe un minimo di zero — un filtro che
    nessuno ha chiesto, e che nasconde ogni riga negativa.
  */
  it('⛔ un campo svuotato non diventa un estremo a zero', async () => {
    const o = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '100' } });
    fireEvent.input(daCampo(), { target: { value: '' } });
    expect(emesso(o)).toBeNull();
  });

  /*
    ⚠️ **Lo zero DIGITATO invece è un estremo**: «fino a 0» è il filtro con cui
    si cercano resi e note di credito.
  */
  it('⚠️ uno zero digitato è un estremo, non un vuoto', async () => {
    const o = await apri('range');
    fireEvent.input(aCampo(), { target: { value: '0' } });
    expect(emesso(o)).toEqual({ kind: 'range', max: 0 });
  });

  it('⛔ accetta il segno meno: resi e rettifiche sono righe come le altre', async () => {
    const o = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '-500' } });
    expect(emesso(o)).toEqual({ kind: 'range', min: -500 });
  });

  /*
    ⚠️ **La virgola è il separatore decimale italiano.** Chi digita «12,50» in un
    campo importi non sta sbagliando: `Number('12,50')` darebbe `NaN`.
  */
  it('⚠️ la virgola decimale si legge come un italiano la scrive', async () => {
    const o = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '12,50' } });
    expect(emesso(o)).toEqual({ kind: 'range', min: 12.5 });
  });

  it("tiene l'estremo già impostato quando si compila l'altro", async () => {
    const reso = await render(OspiteComponent);
    const o = reso.fixture.componentInstance;
    o.kind.set('range');
    o.value.set({ kind: 'range', min: 10 });
    reso.fixture.detectChanges();

    fireEvent.input(screen.getByLabelText('Totale a'), { target: { value: '90' } });
    expect(emesso(o)).toEqual({ kind: 'range', min: 10, max: 90 });
  });

  it('un valore non numerico non diventa un estremo', async () => {
    const o = await apri('range');
    fireEvent.input(daCampo(), { target: { value: 'abc' } });
    expect(emesso(o)).toBeNull();
  });
});

describe('filtro a DATE', () => {
  /*
    ⛔ **Due campi data veri, non due caselle numeriche.** Una colonna data
    dichiarata `range` mostrava gli estremi numerici, e su una data non c'è
    numero da scrivere: era il caso di sei colonne «Data» dichiarate così.
  */
  it('⛔ emette gli estremi in ISO, come li scrive un italiano', async () => {
    const o = await apri('date');

    const dal = screen.getByLabelText('Totale dal');
    fireEvent.input(dal, { target: { value: '31/01/2026' } });
    fireEvent.blur(dal);

    expect(emesso(o)).toEqual({ kind: 'date', dateFrom: '2026-01-31' });
  });

  /*
    ⛔ **Svuotare TOGLIE il filtro.** `app-date-input` emette la stringa vuota,
    non `undefined`: senza normalizzarla il filtro resterebbe attivo su un
    estremo vuoto e l'elenco non tornerebbe più intero.
  */
  it('⛔ svuotare un estremo già impostato emette null', async () => {
    const reso = await render(OspiteComponent);
    const o = reso.fixture.componentInstance;
    o.kind.set('date');
    o.value.set({ kind: 'date', dateFrom: '2026-01-31' });
    reso.fixture.detectChanges();

    const dal = screen.getByLabelText('Totale dal');
    fireEvent.input(dal, { target: { value: '' } });
    fireEvent.blur(dal);

    expect(emesso(o)).toBeNull();
  });

  it('tiene l’estremo già impostato quando si compila l’altro', async () => {
    const reso = await render(OspiteComponent);
    const o = reso.fixture.componentInstance;
    o.kind.set('date');
    o.value.set({ kind: 'date', dateFrom: '2026-01-01' });
    reso.fixture.detectChanges();

    const al = screen.getByLabelText('Totale al');
    fireEvent.input(al, { target: { value: '31/01/2026' } });
    fireEvent.blur(al);

    expect(emesso(o)).toEqual({ kind: 'date', dateFrom: '2026-01-01', dateTo: '2026-01-31' });
  });
});

describe('filtro a valori', () => {
  it('offre i valori presenti nelle righe', async () => {
    const reso = await render(OspiteComponent);
    const o = reso.fixture.componentInstance;
    o.kind.set('values');
    o.options.set(['Bozza', 'Confermato']);
    reso.fixture.detectChanges();

    // Il menu è chiuso: si verifica che il controllo esista e sia nominato.
    expect(screen.getByLabelText('Filtra per Totale')).toBeTruthy();
  });
});

/**
 * ⭐ **IL VERSO DEL FILTRO A VALORI** — «Includi» / «Escludi», più «Tutti».
 *
 * ⚠️ **Il pannello si apre premendo il pulsante**: i comandi del verso stanno
 * dentro (`panelLead`), non in barra, perché agiscono sulle opzioni di questo
 * menu (`regole-stile-ui` §5).
 */
describe('filtro a valori — il verso e il «Tutti»', () => {
  async function apriPannello(scelti: readonly string[], escludi = false) {
    const reso = await render(OspiteComponent);
    const o = reso.fixture.componentInstance;
    o.kind.set('values');
    o.options.set(['Bozza', 'Confermato', 'Annullato']);
    o.value.set(
      scelti.length === 0
        ? null
        : { kind: 'values', values: [...scelti], ...(escludi ? { exclude: true } : {}) },
    );
    reso.fixture.detectChanges();
    fireEvent.click(screen.getByRole('button', { name: /Filtra per Totale/ }));
    reso.fixture.detectChanges();
    return { reso, o };
  }

  it('⭐ il pannello offre i due versi, e di serie include', async () => {
    await apriPannello(['Bozza']);

    expect(screen.getByRole('button', { name: 'Includi' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Escludi' })).toBeTruthy();
  });

  /*
    ⭐ **Cambiare verso NON azzera la scelta**: si sceglie «Bozza» e poi si
    decide se vederla o escluderla. Rifare la selezione a ogni cambio di verso
    toglierebbe il senso al confronto fra i due risultati.
  */
  it('⭐ passare a «Escludi» conserva i valori scelti', async () => {
    const { o } = await apriPannello(['Bozza']);

    fireEvent.click(screen.getByRole('button', { name: 'Escludi' }));

    expect(emesso(o)).toEqual({ kind: 'values', values: ['Bozza'], exclude: true });
  });

  it('⭐ tornare a «Includi» toglie il verso, non la scelta', async () => {
    const { o } = await apriPannello(['Bozza'], true);

    fireEvent.click(screen.getByRole('button', { name: 'Includi' }));

    expect(emesso(o)).toEqual({ kind: 'values', values: ['Bozza'] });
  });

  /*
    ⛔ **«Tutti» TOGLIE il filtro.** In questo modello «nessun valore scelto» è
    già «nessuna restrizione»: spuntarli tutti a uno a uno darebbe lo stesso
    risultato con venti clic e un filtro che sembra acceso.
  */
  it('⛔ «Tutti» emette null: il filtro sparisce, non si riempie', async () => {
    const { o } = await apriPannello(['Bozza', 'Confermato'], true);

    fireEvent.click(screen.getByRole('button', { name: /Mostra tutti i valori/ }));

    expect(emesso(o)).toBeNull();
  });

  it('⚠️ senza selezione «Tutti» è spento: non c’è niente da togliere', async () => {
    await apriPannello([]);

    // ⚠️ L'attributo, non la proprietà: `getByRole` restituisce un `HTMLElement`
    //    generico, e il cast a `HTMLButtonElement` il lint lo rifiuta.
    expect(
      screen.getByRole('button', { name: /Mostra tutti i valori/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

  /*
    ⚠️ **Il nome accessibile dice il verso.** Il pulsante mostra solo il nome
    della colonna più un'icona: chi non vede l'icona non saprebbe che quel
    filtro esclude invece di includere, e i due danno risultati opposti.
  */
  it('⚠️ escludendo, il nome accessibile del controllo lo dichiara', async () => {
    const reso = await render(OspiteComponent);
    const o = reso.fixture.componentInstance;
    o.kind.set('values');
    o.options.set(['Bozza']);
    o.value.set({ kind: 'values', values: ['Bozza'], exclude: true });
    reso.fixture.detectChanges();

    expect(screen.getByLabelText(/escludendo i valori scelti/)).toBeTruthy();
  });
});

/**
 * ⛔ **L'ORDINE IN CUI SI LAVORA, NON QUELLO COMODO PER IL TEST.**
 *
 * Trovato in un browser vero il 01/09/2026: le prove qui sopra sceglievano i
 * valori PRIMA del verso, e passavano tutte mentre l'operatore — che preme
 * «Escludi» e POI spunta — otteneva l'esatto contrario di quello che chiedeva.
 *
 * ⚠️ **La causa non era il componente ma dove stava il verso**: a mani vuote si
 * emette `null` (nessuna restrizione), quindi il verso non aveva dove
 * sopravvivere fino alla prima spunta.
 */
describe('filtro a valori — il verso scelto PRIMA dei valori', () => {
  async function apriVuoto() {
    const reso = await render(OspiteComponent);
    const o = reso.fixture.componentInstance;
    o.kind.set('values');
    o.options.set(['Napoli', 'Milano']);
    o.value.set(null);
    reso.fixture.detectChanges();
    fireEvent.click(screen.getByRole('button', { name: /Filtra per Totale/ }));
    reso.fixture.detectChanges();
    return { reso, o };
  }

  it('⛔ «Escludi» a mani vuote non emette un filtro: non c’è niente da restringere', async () => {
    const { o } = await apriVuoto();

    fireEvent.click(screen.getByRole('button', { name: 'Escludi' }));

    expect(emesso(o)).toBeNull();
  });

  it('⭐ ma il verso resta, e la PRIMA voce spuntata esclude', async () => {
    const { reso, o } = await apriVuoto();

    fireEvent.click(screen.getByRole('button', { name: 'Escludi' }));
    reso.fixture.detectChanges();
    fireEvent.click(screen.getByRole('option', { name: 'Napoli' }));

    expect(emesso(o)).toEqual({ kind: 'values', values: ['Napoli'], exclude: true });
  });

  it('⚠️ «Tutti» riporta a «Includi»: chi vuole vedere tutto non sta escludendo', async () => {
    const { reso, o } = await apriVuoto();

    fireEvent.click(screen.getByRole('button', { name: 'Escludi' }));
    reso.fixture.detectChanges();
    fireEvent.click(screen.getByRole('button', { name: /Mostra tutti i valori/ }));
    reso.fixture.detectChanges();
    fireEvent.click(screen.getByRole('option', { name: 'Napoli' }));

    expect(emesso(o)).toEqual({ kind: 'values', values: ['Napoli'] });
  });
});
