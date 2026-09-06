import { describe, expect, it } from 'vitest';

import { caretAtEdge } from './caret-edge.util';

function field(overrides: Partial<HTMLInputElement>): EventTarget {
  return overrides as EventTarget;
}

describe('caretAtEdge', () => {
  it('tratta l’assenza di campo come bordo', () => {
    expect(caretAtEdge(null, 'end')).toBe(true);
    expect(caretAtEdge(null, 'start')).toBe(true);
  });

  it('riconosce il cursore in fondo al testo', () => {
    const input = field({ value: 'Maglietta', selectionStart: 9, selectionEnd: 9 });
    expect(caretAtEdge(input, 'end')).toBe(true);
    expect(caretAtEdge(input, 'start')).toBe(false);
  });

  it('riconosce il cursore in testa al testo', () => {
    const input = field({ value: 'Maglietta', selectionStart: 0, selectionEnd: 0 });
    expect(caretAtEdge(input, 'start')).toBe(true);
    expect(caretAtEdge(input, 'end')).toBe(false);
  });

  it('non lascia il campo col cursore in mezzo', () => {
    const input = field({ value: 'Maglietta', selectionStart: 4, selectionEnd: 4 });
    expect(caretAtEdge(input, 'end')).toBe(false);
    expect(caretAtEdge(input, 'start')).toBe(false);
  });

  it('non lascia il campo se c’è testo selezionato', () => {
    const input = field({ value: 'Maglietta', selectionStart: 0, selectionEnd: 9 });
    expect(caretAtEdge(input, 'end')).toBe(false);
    expect(caretAtEdge(input, 'start')).toBe(false);
  });

  it('esce subito dal campo vuoto', () => {
    const input = field({ value: '', selectionStart: 0, selectionEnd: 0 });
    expect(caretAtEdge(input, 'end')).toBe(true);
    expect(caretAtEdge(input, 'start')).toBe(true);
  });

  it('esce subito dai campi numerici, dove il cursore non è leggibile', () => {
    const numerico = field({ value: '1234', selectionStart: null, selectionEnd: null });
    expect(caretAtEdge(numerico, 'end')).toBe(true);
    expect(caretAtEdge(numerico, 'start')).toBe(true);
  });

  it('esce subito dai controlli senza testo', () => {
    const tendina = field({});
    expect(caretAtEdge(tendina, 'end')).toBe(true);
  });

  it('esce subito se leggere il cursore solleva un errore', () => {
    const ostile = {
      get selectionStart(): number {
        throw new Error('InvalidStateError');
      },
    } as unknown as EventTarget;
    expect(caretAtEdge(ostile, 'end')).toBe(true);
  });
});
