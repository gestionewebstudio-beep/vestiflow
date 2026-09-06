import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentLineQuickRowComponent } from './document-line-quick-row.component';

/**
 * **Fotografia del comportamento pubblico**, scritta prima di aumentare i
 * consumer: oggi la riga di inserimento la usano due maschere (Ordine cliente e
 * Vendita/Reso al banco), e prima di portarcene altre serve una rete che dica
 * cosa il componente promette.
 *
 * ⛔ I test NON cambiano la UI e non introducono astrazioni: registrano ciò che
 * il componente fa adesso.
 */
async function apri(
  inputs: Partial<{
    inputId: string;
    value: string;
    disabled: boolean;
    placeholder: string;
    ariaLabel: string;
    message: string | null;
  }> = {},
) {
  const valueChanged = vi.fn();
  const committed = vi.fn();
  const view = await render(DocumentLineQuickRowComponent, {
    inputs: { inputId: 'quick-0', ...inputs },
    on: { valueChanged, committed },
  });
  return { view, valueChanged, committed };
}

/** Il campo è l'unico `<input>` della riga. */
function campo(): HTMLInputElement {
  return screen.getByRole('textbox');
}

describe('DocumentLineQuickRowComponent', () => {
  it('porta l’id che riceve: è la porta a cui il fuoco torna', async () => {
    await apri({ inputId: 'co-quick-add' });

    expect(campo().id).toBe('co-quick-add');
  });

  it('ha un nome accessibile proprio, non il solo segnaposto', async () => {
    await apri();

    // Il segnaposto sparisce appena si digita: chi ascolta resterebbe senza il
    // nome del campo.
    expect(screen.getByRole('textbox', { name: 'Scansiona o cerca un articolo' })).toBeVisible();
  });

  it('il segnaposto e l’etichetta si possono cambiare dal chiamante', async () => {
    await apri({ placeholder: 'Spara il codice…', ariaLabel: 'Ricerca rapida' });

    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Ricerca rapida' });
    expect(input.placeholder).toBe('Spara il codice…');
  });

  it('mostra il valore che riceve', async () => {
    await apri({ value: '8032911100142' });

    expect(campo().value).toBe('8032911100142');
  });

  it('ogni battuta esce come valore, non come evento grezzo', async () => {
    const { valueChanged } = await apri();

    await userEvent.type(campo(), 'AB');

    expect(valueChanged).toHaveBeenCalledTimes(2);
    expect(valueChanged).toHaveBeenLastCalledWith('AB');
  });

  it('Invio conferma e NON invia il form che la contiene', async () => {
    const { committed } = await apri();
    const input = campo();

    // `keydown.enter` con preventDefault: dentro un `<form>` l'Invio farebbe
    // altrimenti l'invio implicito.
    const evento = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    input.dispatchEvent(evento);

    expect(committed).toHaveBeenCalledTimes(1);
    expect(evento.defaultPrevented).toBe(true);
  });

  it('disabilitata non accetta battute', async () => {
    const { valueChanged } = await apri({ disabled: true });

    expect(campo().disabled).toBe(true);
    await userEvent.type(campo(), 'X');
    expect(valueChanged).not.toHaveBeenCalled();
  });

  it('il suggerimento del moltiplicatore è sempre a schermo e legato al campo', async () => {
    await apri({ inputId: 'quick-7' });

    expect(screen.getByText(/quantità/)).toBeVisible();
    expect(campo().getAttribute('aria-describedby')).toBe('quick-7-hint');
  });

  it('il messaggio di esito compare come avviso, e senza messaggio non c’è', async () => {
    const { view } = await apri();
    expect(screen.queryByRole('alert')).toBeNull();

    await view.rerender({ inputs: { inputId: 'quick-0', message: 'Codice non trovato' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Codice non trovato');
  });

  it('`focus()` riporta il fuoco sulla porta, e sa selezionare il testo', async () => {
    const { view } = await apri({ value: 'ABC' });
    const componente = view.fixture.componentInstance;

    componente.focus();
    expect(document.activeElement).toBe(campo());

    componente.focus(true);
    expect(campo().selectionStart).toBe(0);
    expect(campo().selectionEnd).toBe(3);
  });
});
