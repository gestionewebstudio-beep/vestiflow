import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import {
  DocumentLineUnitCellComponent,
  UNIT_OF_MEASURE_MANAGE_LABEL,
} from './document-line-unit-cell.component';

/**
 * **Fotografia del comportamento pubblico** prima di aumentare i consumer.
 *
 * La cella U.M. è un adattatore sottile sopra la cella a ricerca-e-selezione:
 * ciò che le appartiene davvero è la coppia di scelte che l'IVA non ha — testo
 * libero ammesso, e il comando «» Altro…» che CHIEDE invece di aprire.
 *
 * ⛔ I test non cambiano la UI: registrano ciò che il componente promette oggi.
 */
const UNITA: readonly SelectMenuOption[] = [
  { value: 'pz', label: 'pz' },
  { value: 'conf', label: 'conf' },
  { value: 'paio', label: 'paio' },
];

async function apri(
  inputs: Partial<{
    lineIndex: number;
    inputId: string;
    value: string;
    options: readonly SelectMenuOption[];
    disabled: boolean;
    inColumnCycle: boolean;
    ariaLabel: string;
  }> = {},
) {
  const valueChange = vi.fn();
  const manageRequested = vi.fn();
  const lineAdvance = vi.fn();
  const lineRetreat = vi.fn();
  const lineRowAdvance = vi.fn();
  const lineRowRetreat = vi.fn();
  const view = await render(DocumentLineUnitCellComponent, {
    inputs: { lineIndex: 0, options: UNITA, inputId: 'gr-uom-0', ...inputs },
    on: {
      valueChange,
      manageRequested,
      lineAdvance,
      lineRetreat,
      lineRowAdvance,
      lineRowRetreat,
    },
  });
  return {
    view,
    valueChange,
    manageRequested,
    lineAdvance,
    lineRetreat,
    lineRowAdvance,
    lineRowRetreat,
  };
}

function campo(): HTMLInputElement {
  return screen.getByRole('textbox');
}

describe('DocumentLineUnitCellComponent', () => {
  it('è un campo vero e porta l’id che riceve: il giro del fuoco lo raggiunge', async () => {
    await apri({ inputId: 'co-uom-3' });

    expect(campo().id).toBe('co-uom-3');
  });

  it('si annuncia come Unità di misura, e l’etichetta si può cambiare', async () => {
    const { view } = await apri();
    expect(screen.getByRole('textbox', { name: 'Unità di misura' })).toBeVisible();

    await view.rerender({
      inputs: { lineIndex: 0, options: UNITA, inputId: 'gr-uom-0', ariaLabel: 'U.M. riga 4' },
    });

    expect(screen.getByRole('textbox', { name: 'U.M. riga 4' })).toBeVisible();
  });

  it('mostra il valore che riceve', async () => {
    await apri({ value: 'conf' });

    expect(campo().value).toBe('conf');
  });

  it('riceve le unità, non se le carica: senza opzioni resta usabile', async () => {
    await apri({ options: [] });

    expect(campo()).toBeVisible();
    expect(campo().disabled).toBe(false);
  });

  /**
   * ⭐ La differenza vera dall'IVA: l'insieme è APERTO. Quello che si digita
   * resta anche se non è in elenco — sulla riga l'unità è una stringa.
   */
  it('ammette testo libero: un’unità fuori elenco non viene rifiutata', async () => {
    const { valueChange } = await apri();

    await userEvent.type(campo(), 'mazzo');
    await userEvent.tab();

    expect(valueChange).toHaveBeenCalled();
    expect(valueChange.mock.calls.at(-1)?.[0]).toBe('mazzo');
  });

  it('scegliere una voce dell’elenco la consegna al chiamante', async () => {
    const { valueChange } = await apri();

    // L’elenco si apre DIGITANDO: la cella è un campo, non un pulsante.
    campo().focus();
    await userEvent.keyboard('{Control>}a{/Control}pai');
    await userEvent.click(await screen.findByRole('option', { name: 'paio' }));

    expect(valueChange).toHaveBeenCalledWith('paio');
  });

  /**
   * ⭐ «» Altro…» CHIEDE, non apre: il pannello di gestione sta una volta sola
   * nella maschera. Montandolo qui ce ne sarebbe uno per riga.
   */
  it('«Altro…» chiede la gestione e NON cambia il valore', async () => {
    const { manageRequested, valueChange } = await apri({ value: 'pz' });

    campo().focus();
    await userEvent.keyboard('{Control>}a{/Control}zzz');
    await userEvent.click(
      await screen.findByRole('button', { name: UNIT_OF_MEASURE_MANAGE_LABEL }),
    );

    expect(manageRequested).toHaveBeenCalledTimes(1);
    expect(valueChange).not.toHaveBeenCalled();
  });

  it('il comando di gestione non è una voce dell’elenco', async () => {
    await apri();

    campo().focus();
    await userEvent.keyboard('{Control>}a{/Control}p');

    // È un comando in coda fissa, fuori dalla `listbox`: non deve poter essere
    // scelto come se fosse un'unità.
    expect(screen.queryByRole('option', { name: UNIT_OF_MEASURE_MANAGE_LABEL })).toBeNull();
  });

  it('disabilitata non si apre e non emette', async () => {
    const { valueChange } = await apri({ disabled: true, value: 'pz' });

    expect(campo().disabled).toBe(true);
    await userEvent.type(campo(), 'p');
    expect(screen.queryByRole('option')).toBeNull();
    expect(valueChange).not.toHaveBeenCalled();
  });

  it('inoltra la navigazione di riga col proprio indice', async () => {
    const { lineRowAdvance, lineRowRetreat } = await apri({ lineIndex: 4 });
    const input = campo();

    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(lineRowAdvance).toHaveBeenCalledWith(4);

    await userEvent.keyboard('{ArrowUp}');
    expect(lineRowRetreat).toHaveBeenCalledWith(4);
  });

  /**
   * Su card il Tab resta al browser: lì le colonne non esistono, e la scelta si
   * prende toccando.
   */
  it('fuori dal giro delle colonne il Tab non diventa avanzamento di campo', async () => {
    const { lineAdvance } = await apri({ inColumnCycle: false, lineIndex: 2 });

    campo().focus();
    await userEvent.tab();

    expect(lineAdvance).not.toHaveBeenCalled();
  });
});
