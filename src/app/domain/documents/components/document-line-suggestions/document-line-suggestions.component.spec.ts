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
  }> = {},
) {
  const picked = vi.fn();
  await render(DocumentLineSuggestionsComponent, {
    inputs: { items: ITEMS, ...inputs },
    on: { picked },
  });
  return { picked };
}

describe('DocumentLineSuggestionsComponent', () => {
  it('mostra titolo e dettaglio; il dettaglio manca quando non fornito', async () => {
    await setup();

    expect(screen.getByText('Maglietta cotone — M · Rosso')).toBeVisible();
    expect(screen.getByText('SKU-01 · Disp. 7')).toBeVisible();
    const second = screen.getByText('Maglietta cotone — L · Blu').closest('li');
    expect(second?.querySelectorAll('span')).toHaveLength(1);
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
});
