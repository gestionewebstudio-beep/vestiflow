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
