import { computed, inject, signal } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';

/**
 * ⭐ **La modalità «Seleziona» della vista a card**, una volta sola.
 *
 * Indicata dal proprietario il 31/08/2026: _«bisogna inserire "Seleziona" in
 * questi riepiloghi modificati e credo in tutti»_. Esisteva solo sul Registro
 * Corrispettivi, scritta a mano; copiarla su altri undici elenchi avrebbe
 * significato copiare anche la regola non ovvia qui sotto.
 *
 * ## Perché esiste solo sulla card
 *
 * ⚠️ Sulla tabella la selezione ce l'ha già la sua colonna di caselle, e due
 * affordance per la stessa funzione sono una di troppo. Sotto `lg` quella
 * colonna non c'è: senza un modo di accendere la selezione, il tocco apre e
 * basta.
 *
 * ## ⛔ Spegnere AZZERA, e non è un dettaglio
 *
 * A modalità spenta il tocco torna ad aprire la riga, e non resta **nessun
 * gesto** per deselezionare: righe selezionate che nessuno può vedere né
 * togliere sono la «selezione invisibile o ingannevole» che `14` §15 vieta.
 *
 * È la stessa regola dello spegnimento dei Filtri — «lo spegnimento È
 * l'azzeramento» (`regole-stile-ui`) — e qui vale doppio.
 *
 * ```ts
 * private readonly selection = createListSelection('multiple');
 * protected readonly modo = createSelectionMode(this.selection);
 * // template: [selectionMode]="modo.perTocco() ? 'multiple' : 'none'"
 * ```
 */
export interface ModalitaSelezione {
  /** L'interruttore, che il telaio accende col pulsante «Seleziona». */
  readonly acceso: () => boolean;
  /**
   * ⭐ **La selezione per tocco è attiva**: modalità accesa E vista compatta.
   *
   * ⚠️ Le due condizioni si leggono insieme apposta: l'interruttore può restare
   * acceso mentre la finestra si allarga, e lì la selezione torna a essere
   * quella della colonna di caselle.
   */
  readonly perTocco: () => boolean;
  /** L'elenco espone la modalità? Solo dove la vista è compatta. */
  readonly disponibile: () => boolean;
  readonly commuta: (acceso: boolean) => void;
}

/**
 * ⚠️ **Il contratto è `{ clear() }`, non `ListSelection` intero.**
 *
 * Situazione magazzino tiene la selezione in una `Map` apposta — «le righe
 * scelte sopravvivono al cambio filtri e restano disponibili per le righe
 * ordine» — e non è un difetto: è la funzione. Chiedere l'intera primitiva
 * l'avrebbe esclusa da «Seleziona» per un tipo, non per una ragione.
 */
export function createSelectionMode(selection: { readonly clear: () => void }): ModalitaSelezione {
  const viewport = inject(ViewportService);
  const acceso = signal(false);

  return {
    acceso: acceso.asReadonly(),
    perTocco: computed(() => viewport.compact() && acceso()),
    disponibile: viewport.compact,
    commuta: (valore: boolean) => {
      acceso.set(valore);
      if (!valore) {
        selection.clear();
      }
    },
  };
}
