import { describe, expect, it } from 'vitest';

import { classifyLineCellKey } from './document-line-cell-keys.util';

/** Un input vero: il cursore va letto, non finto. */
function campo(valore: string, cursore: number): HTMLInputElement {
  const input = globalThis.document.createElement('input');
  input.value = valore;
  globalThis.document.body.appendChild(input);
  input.setSelectionRange(cursore, cursore);
  return input;
}

const tasto = (key: string, target?: EventTarget, shiftKey = false) => {
  const evento = new KeyboardEvent('keydown', { key, shiftKey });
  if (target) {
    Object.defineProperty(evento, 'target', { value: target });
  }
  return evento;
};

const chiuso = { suggestionsOpen: false, activeSuggestionIndex: 0 };
const aperto = { suggestionsOpen: true, activeSuggestionIndex: 2 };

describe('classifyLineCellKey', () => {
  it('un carattere qualsiasi resta al browser', () => {
    expect(classifyLineCellKey(tasto('a'), chiuso)).toBeNull();
  });

  it('Esc chiude', () => {
    expect(classifyLineCellKey(tasto('Escape'), chiuso)).toEqual({ kind: 'escape' });
  });

  // Le frecce verticali cambiano significato con l'elenco aperto: è la regola
  // che teneva insieme le due celle e che ciascuna riscriveva per conto suo.
  it('↑/↓ muovono la RIGA a elenco chiuso e l’ELENCO a elenco aperto', () => {
    expect(classifyLineCellKey(tasto('ArrowDown'), chiuso)).toEqual({ kind: 'row-advance' });
    expect(classifyLineCellKey(tasto('ArrowUp'), chiuso)).toEqual({ kind: 'row-retreat' });
    expect(classifyLineCellKey(tasto('ArrowDown'), aperto)).toEqual({
      kind: 'suggestion-move',
      direction: 'next',
    });
    expect(classifyLineCellKey(tasto('ArrowUp'), aperto)).toEqual({
      kind: 'suggestion-move',
      direction: 'prev',
    });
  });

  it('→ a metà parola resta al browser, al bordo esce in avanti', () => {
    expect(classifyLineCellKey(tasto('ArrowRight', campo('abc', 1)), chiuso)).toBeNull();
    expect(classifyLineCellKey(tasto('ArrowRight', campo('abc', 3)), chiuso)).toEqual({
      kind: 'confirm',
      advance: true,
    });
  });

  it('← a metà parola resta al browser, al bordo torna indietro', () => {
    expect(classifyLineCellKey(tasto('ArrowLeft', campo('abc', 2)), chiuso)).toBeNull();
    expect(classifyLineCellKey(tasto('ArrowLeft', campo('abc', 0)), chiuso)).toEqual({
      kind: 'field-retreat',
    });
  });

  // §4.5: Invio registra e RESTA. È la differenza con Tab, e va letta qui.
  it('Invio conferma senza avanzare; con l’elenco aperto sceglie la voce', () => {
    expect(classifyLineCellKey(tasto('Enter'), chiuso)).toEqual({
      kind: 'confirm',
      advance: false,
    });
    expect(classifyLineCellKey(tasto('Enter'), aperto)).toEqual({
      kind: 'suggestion-pick',
      index: 2,
    });
  });

  it('Tab conferma e avanza, Shift+Tab torna indietro', () => {
    expect(classifyLineCellKey(tasto('Tab'), chiuso)).toEqual({ kind: 'confirm', advance: true });
    expect(classifyLineCellKey(tasto('Tab', undefined, true), chiuso)).toEqual({
      kind: 'field-retreat',
    });
  });
});
