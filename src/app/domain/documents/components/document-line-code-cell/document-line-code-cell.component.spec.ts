import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DocumentLineCodeCellComponent,
  type DocumentLineCodeCommit,
} from './document-line-code-cell.component';

/**
 * La cella non consegna l'evento al form: decide da sé ed emette **esiti**. Qui
 * si prova l'esito, che è il contratto vero fra cella e maschera.
 */
async function apri(options: { readonly suggestionsOpen?: boolean } = {}) {
  const commit = vi.fn<(evento: DocumentLineCodeCommit) => void>();
  const lineRetreat = vi.fn();
  const suggestionPick = vi.fn();
  await render(DocumentLineCodeCellComponent, {
    inputs: {
      lineIndex: 3,
      inputId: 'cella',
      ariaLabel: 'SKU',
      value: 'MAG-M',
      suggestions: options.suggestionsOpen
        ? [
            {
              variantId: 'var-1',
              productId: 'p',
              sku: 'MAG-M',
              articleCode: 'ART',
              productName: 'Maglietta',
              title: 'Maglietta M',
              variantLabel: '',
              sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
            },
          ]
        : [],
      suggestionsOpen: options.suggestionsOpen ?? false,
    },
    on: { commit, lineRetreat, suggestionPick },
  });
  return { commit, lineRetreat, suggestionPick, campo: screen.getByRole('textbox') };
}

describe('DocumentLineCodeCellComponent', () => {
  // §4.5: Invio registra e RESTA. Prima i due tasti emettevano lo stesso esito,
  // quindi il form non poteva distinguerli e Invio navigava — nella stessa riga
  // faceva una cosa diversa a seconda della colonna.
  it('Invio conferma e chiede di RESTARE', async () => {
    const user = userEvent.setup();
    const { commit, campo } = await apri();

    campo.focus();
    await user.keyboard('{Enter}');

    expect(commit).toHaveBeenCalledWith({ lineIndex: 3, advance: false });
  });

  it('Tab conferma e chiede di ANDARE AVANTI', async () => {
    const user = userEvent.setup();
    const { commit, campo } = await apri();

    campo.focus();
    await user.keyboard('{Tab}');

    expect(commit).toHaveBeenCalledWith({ lineIndex: 3, advance: true });
  });

  it('Shift+Tab non conferma: torna al campo precedente', async () => {
    const user = userEvent.setup();
    const { commit, lineRetreat, campo } = await apri();

    campo.focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(lineRetreat).toHaveBeenCalledWith(3);
    expect(commit).not.toHaveBeenCalled();
  });

  // A scelta aperta Invio prende la voce evidenziata: non è una conferma del
  // testo digitato, è la risoluzione dell'ambiguità.
  it('a scelta aperta Invio prende la voce, non conferma il testo', async () => {
    const user = userEvent.setup();
    const { commit, suggestionPick, campo } = await apri({ suggestionsOpen: true });

    campo.focus();
    await user.keyboard('{Enter}');

    expect(suggestionPick).toHaveBeenCalledWith({ lineIndex: 3, variantId: 'var-1' });
    expect(commit).not.toHaveBeenCalled();
  });
});
