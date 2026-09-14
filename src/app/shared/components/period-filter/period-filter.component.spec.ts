import { Component, signal } from '@angular/core';
import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PeriodFilterComponent } from './period-filter.component';
import type { PeriodFilterOption } from './period-filter.model';

/**
 * ⭐ **Il selettore Periodo condiviso** (11/09/2026): il controllo dei
 * Corrispettivi, con le voci che ogni schermata gli passa. Queste prove
 * verificano il CONTROLLO — quali selettori compaiono, che cosa emette — non
 * i confini dei periodi, che restano della schermata e del suo risolutore.
 */
const VOCI: readonly PeriodFilterOption[] = [
  { value: '', label: 'Tutti' },
  { value: '30d', label: 'Ultimi 30 giorni' },
  { value: 'day', label: 'Giorno specifico…', pickers: ['day'] },
  { value: 'cal_month', label: 'Mese…', pickers: ['month', 'year'] },
  { value: 'cal_quarter', label: 'Trimestre…', pickers: ['quarter', 'year'] },
  { value: 'custom', label: 'Personalizzato', pickers: ['range'] },
];

@Component({
  imports: [PeriodFilterComponent],
  template: `
    <app-period-filter
      idPrefix="prova"
      [options]="options"
      [value]="value()"
      [dateFrom]="dateFrom()"
      [dateTo]="dateTo()"
      [datesAlways]="datesAlways()"
      (valueChange)="valueChange($event)"
      (dayChange)="dayChange($event)"
      (dateFromChange)="dateFromChange($event)"
      (dateToChange)="dateToChange($event)"
      (monthChange)="monthChange($event)"
      (yearChange)="yearChange($event)"
    />
  `,
})
class OspiteComponent {
  readonly options = VOCI;
  readonly value = signal<string>('30d');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly datesAlways = signal(false);
  readonly valueChange = vi.fn();
  readonly dayChange = vi.fn();
  readonly dateFromChange = vi.fn();
  readonly dateToChange = vi.fn();
  readonly monthChange = vi.fn();
  readonly yearChange = vi.fn();
}

async function monta(stato: Partial<{ value: string; datesAlways: boolean }> = {}) {
  const reso = await render(OspiteComponent);
  const o = reso.fixture.componentInstance;
  if (stato.value !== undefined) {
    o.value.set(stato.value);
  }
  if (stato.datesAlways !== undefined) {
    o.datesAlways.set(stato.datesAlways);
  }
  reso.fixture.detectChanges();
  return { o, reso };
}

const campoData = (nome: string) => screen.queryByRole('textbox', { name: nome });

describe('PeriodFilterComponent', () => {
  it('mostra il valore scelto nel pulsante e le voci della schermata nella tendina', async () => {
    await monta();
    const utente = userEvent.setup();
    const pulsante = screen.getByRole('button', { name: /Filtra per periodo/ });
    expect(pulsante).toHaveTextContent(/Ultimi 30 giorni/);

    await utente.click(pulsante);
    const tendina = screen.getByRole('listbox', { name: 'Filtra per periodo' });
    expect(
      within(tendina)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual([
      'Tutti',
      'Ultimi 30 giorni',
      'Giorno specifico…',
      'Mese…',
      'Trimestre…',
      'Personalizzato',
    ]);
  });

  it('⛔ nessun selettore in più finché la voce non lo chiede', async () => {
    await monta({ value: '30d' });
    expect(campoData('Data inizio')).toBeNull();
    expect(campoData('Data fine')).toBeNull();
    expect(campoData('Giorno')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mese' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Anno' })).toBeNull();
  });

  it('«Personalizzato» fa comparire la coppia Dal/Al, e le date escono dai propri output', async () => {
    const { o } = await monta({ value: 'custom' });
    expect(campoData('Data inizio')).not.toBeNull();
    expect(campoData('Data fine')).not.toBeNull();
    expect(campoData('Giorno')).toBeNull();

    const utente = userEvent.setup();
    await utente.type(campoData('Data inizio')!, '01/09/2026');
    await utente.tab();
    expect(o.dateFromChange).toHaveBeenLastCalledWith('2026-09-01');
  });

  it('«Giorno specifico» chiede UN giorno, non due', async () => {
    await monta({ value: 'day' });
    expect(campoData('Giorno')).not.toBeNull();
    expect(campoData('Data inizio')).toBeNull();
  });

  it('«Mese…» chiede mese e anno, «Trimestre…» trimestre e anno', async () => {
    await monta({ value: 'cal_month' });
    expect(screen.getByRole('button', { name: 'Mese' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Anno' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Trimestre' })).toBeNull();
  });

  it('⭐ con `datesAlways` la coppia Dal/Al resta visibile qualunque sia il preset (la Cassa)', async () => {
    await monta({ value: '30d', datesAlways: true });
    expect(campoData('Data inizio')).not.toBeNull();
    expect(campoData('Data fine')).not.toBeNull();
  });

  it('scegliere una voce emette il suo valore; «Tutti» (valore vuoto) arriva come null, che le schermate già traducono', async () => {
    const { o } = await monta();
    const utente = userEvent.setup();
    await utente.click(screen.getByRole('button', { name: /Filtra per periodo/ }));
    await utente.click(screen.getByRole('option', { name: 'Personalizzato' }));
    expect(o.valueChange).toHaveBeenLastCalledWith('custom');

    await utente.click(screen.getByRole('button', { name: /Filtra per periodo/ }));
    await utente.click(screen.getByRole('option', { name: 'Tutti' }));
    // ⚠️ È la semantica del select-menu (`option.value || null`): ogni schermata
    //    la assorbe con `$event ?? ''` o `?? All`, come faceva prima.
    expect(o.valueChange).toHaveBeenLastCalledWith(null);
  });
});
