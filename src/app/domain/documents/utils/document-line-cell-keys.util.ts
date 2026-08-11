import { caretAtEdge } from './caret-edge.util';

/**
 * Cosa vuol dire quel tasto dentro una cella di riga documento.
 *
 * **Perché una funzione e non un componente base.** Le due celle gemelle —
 * codice e nome prodotto — avevano lo **stesso** `onKeydown`, sessanta righe
 * identiche riga per riga, salvo chi emettono quando si va avanti. Fonderle in
 * un componente avrebbe richiesto un `input()` che cambia il comportamento
 * dall'esterno, cioè l'astrazione prematura che `regole-architettura` chiama
 * per nome. Qui la decisione è una funzione pura, l'emissione resta di
 * ciascuna cella: la parte identica smette di essere copiata, la parte diversa
 * resta scritta dov'è diversa.
 *
 * **La classificazione non tocca l'evento.** `preventDefault` lo chiama chi
 * agisce, perché è chi agisce a sapere se ha fatto qualcosa — un tasto
 * trattenuto e poi ignorato fa sembrare rotta la tastiera.
 */
export type DocumentLineCellKey =
  /** Esc: chiude ciò che è aperto senza toccare i dati (§7). */
  | { readonly kind: 'escape' }
  /** ↓ senza elenco aperto: riga sotto. */
  | { readonly kind: 'row-advance' }
  /** ↑ senza elenco aperto: riga sopra. */
  | { readonly kind: 'row-retreat' }
  /** ↑/↓ con l'elenco aperto: ci si muove dentro l'elenco. */
  | { readonly kind: 'suggestion-move'; readonly direction: 'next' | 'prev' }
  /** Invio con una voce evidenziata: si sceglie quella. */
  | { readonly kind: 'suggestion-pick'; readonly index: number }
  /**
   * Si esce dal campo in avanti. `advance` distingue i due modi:
   * - `true` — Tab e → al bordo: si conferma **e** si va al campo dopo;
   * - `false` — Invio: si conferma e si **resta** (§4.5).
   *
   * Cosa farne è di chi chiama: la cella codice registra il codice, la cella
   * nome sposta il fuoco. È l'unico punto in cui le due divergono davvero.
   */
  | { readonly kind: 'confirm'; readonly advance: boolean }
  /** Shift+Tab, e ← al bordo sinistro: campo precedente. */
  | { readonly kind: 'field-retreat' };

export interface DocumentLineCellKeyContext {
  /** L'elenco dei suggerimenti è aperto **e** ha voci. */
  readonly suggestionsOpen: boolean;
  readonly activeSuggestionIndex: number;
}

/**
 * `null` = il tasto non ci riguarda e resta al browser. È il caso normale:
 * ogni carattere digitato passa di qui.
 */
export function classifyLineCellKey(
  event: KeyboardEvent,
  context: DocumentLineCellKeyContext,
): DocumentLineCellKey | null {
  const open = context.suggestionsOpen;

  if (event.key === 'Escape') {
    return { kind: 'escape' };
  }
  if (event.key === 'ArrowDown') {
    return open ? { kind: 'suggestion-move', direction: 'next' } : { kind: 'row-advance' };
  }
  if (event.key === 'ArrowUp') {
    return open ? { kind: 'suggestion-move', direction: 'prev' } : { kind: 'row-retreat' };
  }
  // ←/→ a due tempi (§4.2): finché il cursore ha strada dentro il campo la
  // freccia resta al browser; solo al bordo porta al campo accanto.
  if (event.key === 'ArrowRight' && !event.shiftKey && caretAtEdge(event.target, 'end')) {
    return { kind: 'confirm', advance: true };
  }
  if (event.key === 'ArrowLeft' && !event.shiftKey && caretAtEdge(event.target, 'start')) {
    return { kind: 'field-retreat' };
  }
  if (event.key === 'Enter') {
    return open
      ? { kind: 'suggestion-pick', index: context.activeSuggestionIndex }
      : { kind: 'confirm', advance: false };
  }
  if (event.key === 'Tab') {
    // Tab deterministico come nel resto della riga: mai lasciato al browser, o
    // il fuoco finirebbe sui pulsanti icona della cella invece che sul campo
    // dati successivo.
    return event.shiftKey ? { kind: 'field-retreat' } : { kind: 'confirm', advance: true };
  }
  return null;
}
