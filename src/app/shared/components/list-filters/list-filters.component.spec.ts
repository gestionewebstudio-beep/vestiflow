import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ViewportService } from '@core/services/viewport.service';

import { ListFiltersComponent } from './list-filters.component';
import type { ListFilterDef } from './list-filter.model';

/**
 * ⭐ **I due comandi del pannello mobile appartengono al contenitore.**
 *
 * «Azzera filtri» e «Vedi risultati» sono meccanica dello `SlidePanel`, non
 * filtri: ogni elenco che apre un pannello ha gli stessi due, e ripeterli in ogni
 * consumer è la duplicazione che questo componente toglie.
 *
 * ⛔ E sono **solo** della veste mobile: sul desktop i filtri stanno in linea e
 * non c'è nessun pannello da chiudere.
 */

/** Il viewport si pilota: la veste dipende da lui, non dalla larghezza vera. */
function montaCon(
  compact: boolean,
  filtri: readonly ListFilterDef[] = [],
  resetVisible = true,
  on: Record<string, (v: never) => void> = {},
) {
  const stretto = signal(compact);
  return render(ListFiltersComponent, {
    inputs: { filters: filtri, values: {}, panelOpen: true, resetVisible },
    on,
    providers: [{ provide: ViewportService, useValue: { compact: stretto } }],
  });
}

const UN_FILTRO: readonly ListFilterDef[] = [
  { key: 'status', label: 'Stato', kind: 'select', options: [{ value: 'a', label: 'A' }] },
];

describe('ListFiltersComponent — i comandi del pannello mobile', () => {
  let panelOpenChange: ReturnType<typeof vi.fn<(v: boolean) => void>>;
  let resetRequested: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    panelOpenChange = vi.fn<(v: boolean) => void>();
    resetRequested = vi.fn<() => void>();
  });

  async function monta(compact: boolean, resetVisible = true) {
    return montaCon(compact, UN_FILTRO, resetVisible, {
      panelOpenChange,
      resetRequested,
    });
  }

  it('⭐ «Vedi risultati» c’è nella veste mobile', async () => {
    await monta(true);

    expect(screen.getByRole('button', { name: 'Vedi risultati' })).toBeVisible();
  });

  it('⛔ e NON esiste sul desktop: non c’è nessun pannello da chiudere', async () => {
    await monta(false);

    expect(screen.queryByRole('button', { name: 'Vedi risultati' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Azzera filtri' })).toBeNull();
  });

  it('⭐ il clic CHIUDE il pannello, e basta', async () => {
    await monta(true);

    await userEvent.click(screen.getByRole('button', { name: 'Vedi risultati' }));

    expect(panelOpenChange).toHaveBeenCalledWith(false);
  });

  it('⛔ non tocca i filtri e non chiede un azzeramento', async () => {
    const onChange = vi.fn();
    await montaCon(true, [{ ...UN_FILTRO[0]!, onChange }], true, {
      resetRequested,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Vedi risultati' }));

    // ⚠️ I filtri hanno già scritto mentre l'operatore li cambiava: questo è solo
    //    il gesto di tornare a guardare l'elenco.
    expect(onChange).not.toHaveBeenCalled();
    expect(resetRequested).not.toHaveBeenCalled();
  });

  it('✅ «Azzera filtri» invece chiede l’azzeramento al consumer', async () => {
    await monta(true);

    await userEvent.click(screen.getByRole('button', { name: 'Azzera filtri' }));

    expect(resetRequested).toHaveBeenCalledTimes(1);
  });

  it('⚠️ «Azzera filtri» sparisce quando il consumer dice di no', async () => {
    // La condizione include la RICERCA libera, che il contenitore non conosce:
    // calcolarla qui la farebbe sparire dove oggi compare.
    await monta(true, false);

    expect(screen.queryByRole('button', { name: 'Azzera filtri' })).toBeNull();
    // ⭐ «Vedi risultati» resta: non dipende dai filtri attivi.
    expect(screen.getByRole('button', { name: 'Vedi risultati' })).toBeVisible();
  });
});

describe('ListFiltersComponent — una sola rappresentazione attiva', () => {
  it('⛔ mobile: i filtri stanno nel pannello, non anche in linea', async () => {
    await montaCon(true, UN_FILTRO);

    // `14` §17.4: la stessa riga non deve esistere in due DOM attivi, o uno
    // screen reader la annuncia due volte e il Tab ci passa due volte.
    expect(screen.getAllByRole('button', { name: 'Filtra per Stato' })).toHaveLength(1);
  });

  it('⛔ desktop: i filtri stanno in linea, e il pannello non è nel DOM', async () => {
    await montaCon(false, UN_FILTRO);

    expect(screen.getAllByRole('button', { name: 'Filtra per Stato' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Filtri/ })).toBeNull();
  });
});
