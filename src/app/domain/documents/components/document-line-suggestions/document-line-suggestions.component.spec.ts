import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentLineSuggestionsComponent } from './document-line-suggestions.component';
import type { DocumentLineSuggestionItem } from './document-line-suggestions.model';

const ITEMS: readonly DocumentLineSuggestionItem[] = [
  { title: 'Maglietta cotone — M · Rosso', detail: 'SKU-01 · Disp. 7' },
  { title: 'Maglietta cotone — L · Blu' },
];

async function setup(
  inputs: Partial<{
    items: readonly DocumentLineSuggestionItem[];
    activeIndex: number | null;
    placement: 'below' | 'above';
    tailLabel: string;
  }> = {},
) {
  const picked = vi.fn();
  const tailPicked = vi.fn();
  await render(DocumentLineSuggestionsComponent, {
    inputs: { items: ITEMS, ...inputs },
    on: { picked, tailPicked },
  });
  return { picked, tailPicked };
}

describe('DocumentLineSuggestionsComponent', () => {
  /**
   * ⚠️ **Qui si contavano gli `<span>` della voce** (`toHaveLength(1)`), ed è
   * una misura della struttura interna: al primo cambio di markup fallisce anche
   * se il comportamento è identico — ed è successo il 02/09/2026, quando la voce
   * è passata a tre zone. `regole-qualita` lo dice: «VIETATO testare
   * implementation detail. Testa il comportamento osservabile».
   *
   * Il comportamento è: chi ha un dettaglio lo mostra, chi non ce l'ha no.
   */
  it('mostra titolo e dettaglio; il dettaglio manca quando non fornito', async () => {
    await setup();

    expect(screen.getByText('Maglietta cotone — M · Rosso')).toBeVisible();
    expect(screen.getByText('SKU-01 · Disp. 7')).toBeVisible();
    expect(screen.getByText('Maglietta cotone — L · Blu')).toBeVisible();
    expect(screen.queryByText(/SKU-02/)).toBeNull();
  });

  it('il click su una voce emette il suo indice', async () => {
    const user = userEvent.setup();
    const { picked } = await setup();

    await user.click(screen.getByText('Maglietta cotone — L · Blu'));

    expect(picked).toHaveBeenCalledWith(1);
  });

  it('Invio sulla voce focalizzata emette il suo indice', async () => {
    const user = userEvent.setup();
    const { picked } = await setup();

    screen.getByText('Maglietta cotone — M · Rosso').closest('li')?.focus();
    await user.keyboard('{Enter}');

    expect(picked).toHaveBeenCalledWith(0);
  });

  it('la voce attiva porta aria-selected', async () => {
    await setup({ activeIndex: 1 });

    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });

  // Decisione 11/08/2026: senza risultati il pannello NON si apre, e non
  // mostra nessun messaggio di vuoto. Non trovare nulla non è un errore — si
  // continua a compilare la riga, e la creazione dell'articolo ha vie proprie.
  it('a lista vuota il pannello non compare', async () => {
    await setup({ items: [] });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  // §4.3: la voce-comando sta FUORI dall'elenco filtrato. Messa dentro, il
  // filtro se la mangia al primo carattere — cioè proprio quando serve.
  it('la coda resta anche quando il filtro ha svuotato l’elenco', async () => {
    const user = userEvent.setup();
    const { tailPicked } = await setup({ items: [], tailLabel: '» Altro…' });

    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: '» Altro…' }));

    expect(tailPicked).toHaveBeenCalled();
  });

  // Un lettore di schermo annuncerebbe un comando come un valore scegliibile:
  // la coda è un <button>, e sta fuori dalla listbox.
  it('la coda non è una voce dell’elenco', async () => {
    await setup({ tailLabel: '» Altro…' });

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '» Altro…' })).toBeVisible();
  });
});
