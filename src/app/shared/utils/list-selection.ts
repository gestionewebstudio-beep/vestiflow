import { computed, signal, type Signal } from '@angular/core';

import type { SelectionMode } from '@shared/models/list-selection.model';

/**
 * Lo **stato di selezione** di un elenco (`14` parte D).
 *
 * ⛔ Tiene ID, non righe. È ciò che permette a una selezione di sopravvivere a
 * un riordino, a un cambio pagina o a un aggiornamento dei dati — e che rende
 * verificabile un'azione senza dover rendere una tabella.
 *
 * ⚠️ Non è un service `providedIn: 'root'`: la selezione appartiene a UNA
 * schermata, e condividerla fra elenchi diversi produrrebbe righe selezionate
 * in una pagina che non le mostra.
 */
export interface ListSelection {
  /** Gli ID selezionati, in un insieme di sola lettura. */
  readonly ids: Signal<ReadonlySet<string>>;
  /** Quanti sono: è il dato che governa la barra contestuale. */
  readonly count: Signal<number>;
  /** Se una riga è selezionata. */
  has(id: string): boolean;
  /** Seleziona o deseleziona una riga. In modo `'single'` sostituisce. */
  toggle(id: string, selected: boolean): void;
  /** La checkbox di testata: agisce sulle righe CARICATE, mai su tutto il database. */
  setAll(ids: readonly string[], selected: boolean): void;
  clear(): void;
  /**
   * Toglie dalla selezione ciò che non c'è più.
   *
   * ⛔ Va chiamata a ogni cambio del dataset — filtro, pagina, ricarica. Senza,
   * la barra conterebbe righe che l'operatore non vede più, e un'azione
   * agirebbe su documenti che credeva di aver lasciato indietro: è la
   * «selezione invisibile o ingannevole» che `14` §15 vieta.
   */
  prune(availableIds: readonly string[]): void;
}

/**
 * Se **tutte** le righe visibili sono selezionate: governa la spunta della
 * checkbox di testata.
 *
 * ⛔ Vive qui perché era duplicata parola per parola in `document-table` e in
 * `sales-order-table`, e `supplier-order-table` stava per essere la terza. Con
 * l'elenco vuoto risponde `false`: una testata spuntata su zero righe direbbe
 * che è selezionato qualcosa che non c'è.
 */
export function isAllSelected(
  visibleIds: readonly string[],
  selected: ReadonlySet<string>,
): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

/**
 * Se **alcune ma non tutte**: è lo stato `indeterminate` della checkbox di
 * testata, quello che dice «c'è una selezione parziale» senza mentire in
 * nessuna delle due direzioni.
 */
export function isSomeSelected(
  visibleIds: readonly string[],
  selected: ReadonlySet<string>,
): boolean {
  const quante = visibleIds.filter((id) => selected.has(id)).length;
  return quante > 0 && quante < visibleIds.length;
}

/**
 * Crea lo stato di selezione di un elenco.
 *
 * Si usa come campo di un componente: `private readonly selection =
 * createListSelection('multiple')`. Non richiede contesto di injection, quindi
 * si prova come una funzione qualunque.
 */
export function createListSelection(mode: SelectionMode = 'multiple'): ListSelection {
  const ids = signal<ReadonlySet<string>>(new Set<string>());

  return {
    ids: ids.asReadonly(),
    count: computed(() => ids().size),

    has(id: string): boolean {
      return ids().has(id);
    },

    toggle(id: string, selected: boolean): void {
      if (mode === 'none') {
        return;
      }
      ids.update((current) => {
        // In modo singolo la selezione non si accumula: la riga nuova sostituisce
        // quella vecchia, o la checkbox mentirebbe sul proprio significato.
        if (mode === 'single') {
          return selected ? new Set([id]) : new Set<string>();
        }
        const next = new Set(current);
        if (selected) {
          next.add(id);
        } else {
          next.delete(id);
        }
        return next;
      });
    },

    setAll(all: readonly string[], selected: boolean): void {
      if (mode !== 'multiple') {
        return;
      }
      ids.set(selected ? new Set(all) : new Set<string>());
    },

    clear(): void {
      ids.set(new Set<string>());
    },

    prune(availableIds: readonly string[]): void {
      const disponibili = new Set(availableIds);
      ids.update((current) => {
        const next = new Set([...current].filter((id) => disponibili.has(id)));
        // Stesso insieme: si restituisce quello di prima, o ogni ricarica
        // notificherebbe un cambiamento che non c'è stato.
        return next.size === current.size ? current : next;
      });
    },
  };
}
