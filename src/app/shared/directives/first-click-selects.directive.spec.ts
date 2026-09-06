import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { FirstClickSelectsDirective } from './first-click-selects.directive';

@Component({
  imports: [FirstClickSelectsDirective],
  template: `
    <input class="doc-form__input--table" aria-label="Quantità" value="12" />
    <input aria-label="Altrove" value="34" />
  `,
})
class OspiteComponent {}

async function monta() {
  await render(OspiteComponent);
  return {
    riga: screen.getByLabelText<HTMLInputElement>('Quantità'),
    fuori: screen.getByLabelText<HTMLInputElement>('Altrove'),
  };
}

/** Il clic vero: `mousedown`, il fuoco che il browser dà, `mouseup`. */
function clicca(input: HTMLInputElement, opzioni: { trascina?: boolean } = {}): void {
  input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  input.focus();
  if (opzioni.trascina) {
    input.setSelectionRange(1, 2);
  }
  input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

describe('FirstClickSelectsDirective', () => {
  it('al primo clic seleziona tutto il valore', async () => {
    const { riga } = await monta();

    clicca(riga);

    expect(riga.selectionStart).toBe(0);
    expect(riga.selectionEnd).toBe(2);
  });

  it('al secondo clic lascia il cursore dove l’operatore l’ha messo', async () => {
    const { riga } = await monta();

    clicca(riga);
    // Il campo ora ha il fuoco: si clicca in mezzo alla cifra.
    riga.setSelectionRange(1, 1);
    clicca(riga);

    expect(riga.selectionStart).toBe(1);
    expect(riga.selectionEnd).toBe(1);
  });

  it('trascinando, la selezione dell’operatore resta la sua', async () => {
    const { riga } = await monta();

    clicca(riga, { trascina: true });

    expect(riga.selectionStart).toBe(1);
    expect(riga.selectionEnd).toBe(2);
  });

  it('tornando su un campo lasciato, il primo clic seleziona di nuovo', async () => {
    const { riga, fuori } = await monta();

    clicca(riga);
    fuori.focus();
    riga.setSelectionRange(1, 1);
    clicca(riga);

    expect(riga.selectionStart).toBe(0);
    expect(riga.selectionEnd).toBe(2);
  });

  // La direttiva si applica DA SOLA agli input di riga: non deve toccare gli
  // altri campi della pagina, dove il clic normale del browser va benissimo.
  it('non tocca gli input fuori dalle righe documento', async () => {
    const { fuori } = await monta();

    clicca(fuori);

    expect(fuori.selectionStart).toBe(fuori.selectionEnd);
  });
});
