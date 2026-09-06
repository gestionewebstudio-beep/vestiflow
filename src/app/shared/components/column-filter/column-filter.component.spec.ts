import { Component, signal } from '@angular/core';
import { fireEvent, render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import type { ColumnFilterValue } from '@shared/table-columns/column-filter.model';
import type { TableColumnFilterKind } from '@shared/table-columns/table-column.model';

import { ColumnFilterComponent } from './column-filter.component';

/**
 * ⭐ **UN SOLO CONTROLLO PER OGNI COLONNA** — proprietario, 01/09/2026:
 * «andrebbe creato un unico pezzo da applicare sulle colonne».
 *
 * ⛔ **Queste prove erano scritte sui QUATTRO controlli di prima** — un campo di
 * ricerca nudo per il testo, due caselle per gli intervalli, due campi data —
 * e cercavano quei controlli **nell'intestazione**. Ora tutto vive dentro il
 * pannello, che si apre: le prove aprono il pannello, come fa l'operatore.
 */
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
  readonly kind = signal<TableColumnFilterKind>('values');
  readonly options = signal<readonly string[]>([]);
  readonly value = signal<ColumnFilterValue | null>(null);
  readonly changed = vi.fn();
}

/**
 * L'ultimo valore emesso.
 *
 * ⛔ **Niente `?? undefined` in coda**: `??` scatta anche su `null`, cioè
 * proprio sul valore che queste prove verificano — «svuotare TOGLIE il filtro».
 */
function emesso(o: OspiteComponent): ColumnFilterValue | null | undefined {
  const chiamata = o.changed.mock.calls.at(-1);
  return chiamata === undefined ? undefined : (chiamata[0] as ColumnFilterValue | null);
}

/** Apre il pannello del filtro: è lì che stanno tutti i comandi. */
async function apri(
  kind: TableColumnFilterKind,
  opzioni: { readonly valori?: readonly string[]; readonly valore?: ColumnFilterValue } = {},
) {
  const reso = await render(OspiteComponent);
  const o = reso.fixture.componentInstance;
  o.kind.set(kind);
  o.options.set(opzioni.valori ?? []);
  o.value.set(opzioni.valore ?? null);
  reso.fixture.detectChanges();
  fireEvent.click(screen.getByRole('button', { name: /Filtra per Totale/ }));
  reso.fixture.detectChanges();
  return { reso, o };
}

describe('il controllo è UNO, e non dipende dal tipo di colonna', () => {
  /*
    ⛔ **La forma la decideva la PRESENTAZIONE**: `display: 'code'` o
    `'truncate'` mandavano la colonna a «testo», quindi si poteva solo scrivere;
    senza `display` si poteva solo spuntare. «Alcuni funzionano in un modo ed
    altri in un altro, e non ha senso.»
  */
  /*
    ⚠️ **Un `render` per prova, e non uno per tipo dentro un ciclo**: il TestBed
    si configura una volta sola, e un secondo `render` nello stesso `it` risponde
    «Cannot configure the test module when it has already been instantiated».
  */
  for (const kind of ['values', 'text', 'range', 'date'] as const) {
    it(`⭐ la colonna «${kind}» offre l'elenco dei valori, il verso e il «Tutti»`, async () => {
      await apri(kind, { valori: ['Alfa', 'Beta'] });

      expect(screen.getByRole('option', { name: 'Alfa' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Escludi' })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Mostra tutti i valori/ })).toBeTruthy();
    });
  }

  /*
    ⚠️ **Il `kind` non è sparito: dice CHE COSA il pannello offre in più.** Oggi
    sono gli estremi, su una data o su un numero.

    ⛔ **Le scorciatoie di periodo sono state tolte** il 01/09/2026: duplicavano
    il filtro «Periodo» che la barra ha già — «avere nei filtri gli stessi filtri
    presenti nel periodo mi sembra ripetitivo».
  */
  it('⚠️ gli estremi numerici stanno sulla colonna a intervallo', async () => {
    await apri('range');
    expect(screen.getByLabelText('Totale da')).toBeTruthy();
  });

  it('⚠️ e non su una colonna a valori', async () => {
    await apri('values');
    expect(screen.queryByLabelText('Totale da')).toBeNull();
  });
});

describe('le restrizioni convivono nello stesso valore', () => {
  it('⭐ spuntare un valore restringe per uguaglianza', async () => {
    const { o } = await apri('values', { valori: ['Bozza', 'Confermato'] });

    fireEvent.click(screen.getByRole('option', { name: 'Bozza' }));

    expect(emesso(o)).toMatchObject({ values: ['Bozza'] });
  });

  /*
    ⭐ **Scrivere restringe SENZA dover spuntare**, ed è la metà che mancava:
    «città contiene il sistema per selezionare o filtrare, ma altri campi no».
  */
  it('⭐ scrivere nella ricerca restringe le righe, non solo l’elenco', async () => {
    const { o } = await apri('text', { valori: ['Rossi', 'Bianchi'] });

    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'ros' } });

    expect(emesso(o)).toMatchObject({ text: 'ros' });
  });

  it('⭐ testo e spunte insieme restano insieme: scrivere non cancella la scelta', async () => {
    const { o } = await apri('values', {
      valori: ['Rossi', 'Bianchi'],
      valore: { kind: 'values', values: ['Rossi'] },
    });

    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'ro' } });

    expect(emesso(o)).toMatchObject({ values: ['Rossi'], text: 'ro' });
  });

  it('⛔ svuotare la ricerca senza altre restrizioni toglie il filtro', async () => {
    const { reso, o } = await apri('text', { valori: ['Rossi'] });

    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'ros' } });
    reso.fixture.detectChanges();
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: '  ' } });

    expect(emesso(o)).toBeNull();
  });
});

describe('gli estremi numerici', () => {
  const daCampo = (): HTMLElement => screen.getByLabelText('Totale da');
  const aCampo = (): HTMLElement => screen.getByLabelText('Totale a');

  it('emette il solo estremo compilato', async () => {
    const { o } = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '100' } });
    expect(emesso(o)).toMatchObject({ min: 100 });
  });

  /*
    ⛔ **`Number('')` vale ZERO**: letto così, svuotare il campo «da» imporrebbe
    un minimo di zero — un filtro che nessuno ha chiesto, e che nasconde ogni
    riga negativa.
  */
  it('⛔ un campo svuotato non diventa un estremo a zero', async () => {
    const { reso, o } = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '100' } });
    reso.fixture.detectChanges();
    fireEvent.input(daCampo(), { target: { value: '' } });
    expect(emesso(o)).toBeNull();
  });

  it('⚠️ uno zero digitato è un estremo, non un vuoto', async () => {
    const { o } = await apri('range');
    fireEvent.input(aCampo(), { target: { value: '0' } });
    expect(emesso(o)).toMatchObject({ max: 0 });
  });

  it('⛔ accetta il segno meno: resi e rettifiche sono righe come le altre', async () => {
    const { o } = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '-500' } });
    expect(emesso(o)).toMatchObject({ min: -500 });
  });

  it('⚠️ la virgola decimale si legge come un italiano la scrive', async () => {
    const { o } = await apri('range');
    fireEvent.input(daCampo(), { target: { value: '12,50' } });
    expect(emesso(o)).toMatchObject({ min: 12.5 });
  });

  it('tiene l’estremo già impostato quando si compila l’altro', async () => {
    const { o } = await apri('range', { valore: { kind: 'range', min: 10 } });
    fireEvent.input(aCampo(), { target: { value: '90' } });
    expect(emesso(o)).toMatchObject({ min: 10, max: 90 });
  });
});

describe('gli estremi data', () => {
  it('⛔ si digitano in GG/MM/AAAA e viaggiano in ISO', async () => {
    const { o } = await apri('date');

    const dal = screen.getByLabelText('Totale dal');
    fireEvent.input(dal, { target: { value: '31/01/2026' } });
    fireEvent.blur(dal);

    expect(emesso(o)).toMatchObject({ dateFrom: '2026-01-31' });
  });

  /*
    ⛔ **Svuotare TOGLIE l'estremo**: `app-date-input` emette la stringa vuota,
    non `undefined`, e senza normalizzarla il filtro resterebbe attivo su un
    estremo vuoto.
  */
  it('⛔ svuotare un estremo già impostato lo toglie davvero', async () => {
    const { o } = await apri('date', { valore: { kind: 'date', dateFrom: '2026-01-31' } });

    const dal = screen.getByLabelText('Totale dal');
    fireEvent.input(dal, { target: { value: '' } });
    fireEvent.blur(dal);

    expect(emesso(o)).toBeNull();
  });

  it('tiene l’estremo già impostato quando si compila l’altro', async () => {
    const { o } = await apri('date', { valore: { kind: 'date', dateFrom: '2026-01-01' } });

    const al = screen.getByLabelText('Totale al');
    fireEvent.input(al, { target: { value: '31/01/2026' } });
    fireEvent.blur(al);

    expect(emesso(o)).toMatchObject({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });
  });
});

describe('il verso e il «Tutti»', () => {
  it('⭐ passare a «Escludi» conserva i valori scelti', async () => {
    const { o } = await apri('values', {
      valori: ['Bozza'],
      valore: { kind: 'values', values: ['Bozza'] },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Escludi' }));

    expect(emesso(o)).toMatchObject({ values: ['Bozza'], exclude: true });
  });

  it('⭐ tornare a «Includi» toglie il verso, non la scelta', async () => {
    const { o } = await apri('values', {
      valori: ['Bozza'],
      valore: { kind: 'values', values: ['Bozza'], exclude: true },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Includi' }));

    expect(emesso(o)).toMatchObject({ values: ['Bozza'], exclude: false });
  });

  /*
    ⛔ **Il verso scelto PRIMA dei valori** — trovato in un browser il
    01/09/2026: a mani vuote si emette `null`, quindi il verso non aveva dove
    sopravvivere fino alla prima spunta e la sequenza naturale dava l'opposto.
  */
  it('⭐ «Escludi» a mani vuote non filtra, ma la prima voce spuntata esclude', async () => {
    const { reso, o } = await apri('values', { valori: ['Napoli', 'Milano'] });

    fireEvent.click(screen.getByRole('button', { name: 'Escludi' }));
    expect(emesso(o)).toBeNull();

    reso.fixture.detectChanges();
    fireEvent.click(screen.getByRole('option', { name: 'Napoli' }));

    expect(emesso(o)).toMatchObject({ values: ['Napoli'], exclude: true });
  });

  it('⛔ «Tutti» emette null: il filtro sparisce, non si riempie', async () => {
    const { o } = await apri('values', {
      valori: ['Bozza'],
      valore: { kind: 'values', values: ['Bozza'], exclude: true },
    });

    fireEvent.click(screen.getByRole('button', { name: /Mostra tutti i valori/ }));

    expect(emesso(o)).toBeNull();
  });

  it('⚠️ senza restrizioni «Tutti» è spento: non c’è niente da togliere', async () => {
    await apri('values', { valori: ['Bozza'] });

    expect(
      screen.getByRole('button', { name: /Mostra tutti i valori/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

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
