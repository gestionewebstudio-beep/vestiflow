import type { TableColumnFilterKind } from './table-column.model';

/**
 * ⭐ **LO STATO DI UN FILTRO DI COLONNA** (`14` §0.2).
 *
 * I filtri di un elenco **sono le sue colonne**: il controllo vive
 * nell'intestazione su scrivania e come voce del pannello sotto `lg`. Restano
 * fuori solo Periodo e Ricerca, che non appartengono a una colonna sola.
 *
 * ## Tre forme, e la forma la deduce la colonna
 *
 * ```text
 * values   un insieme chiuso — stato, tipo, sede: si sceglie fra i valori presenti
 * text     alta cardinalità — SKU, riferimenti, nomi: si scrive un pezzo
 * range    numeri e date — importi, quantità: si dà un minimo e un massimo
 * ```
 *
 * ⚠️ **Il valore vuoto è «nessun filtro», non «valore vuoto»**: un `values` con
 * l'insieme vuoto non restringe niente, e un `range` senza estremi nemmeno.
 * Confonderli renderebbe impossibile togliere un filtro.
 */
export interface ColumnFilterValue {
  readonly kind: TableColumnFilterKind;
  /** `values`: gli elementi scelti. Vuoto = nessuna restrizione. */
  readonly values?: readonly string[];
  /** `text`: il pezzo da cercare. Vuoto = nessuna restrizione. */
  readonly text?: string;
  /** `range`: gli estremi, entrambi facoltativi. */
  readonly min?: number;
  readonly max?: number;
}

/** Lo stato di tutti i filtri di colonna: `columnId` → valore. */
export type ColumnFilterState = Readonly<Record<string, ColumnFilterValue>>;

/** Un filtro cambiato: la pagina lo riceve e aggiorna il proprio stato. */
export interface ColumnFilterChange {
  readonly columnId: string;
  /** `null` toglie il filtro da questa colonna. */
  readonly value: ColumnFilterValue | null;
}

/**
 * Il filtro RESTRINGE davvero qualcosa?
 *
 * ⚠️ **Serve al conteggio del badge «Filtri (n)»**, che per regola conta solo le
 * restrizioni attive: un controllo aperto e lasciato vuoto non è un filtro.
 */
export function isColumnFilterActive(value: ColumnFilterValue | undefined): boolean {
  if (!value) {
    return false;
  }
  switch (value.kind) {
    case 'values':
      return (value.values?.length ?? 0) > 0;
    case 'text':
      return (value.text?.trim().length ?? 0) > 0;
    case 'range':
      return value.min !== undefined || value.max !== undefined;
    default:
      return false;
  }
}

/** Quanti filtri di colonna restringono: è il numero del badge. */
export function countActiveColumnFilters(state: ColumnFilterState): number {
  return Object.values(state).filter(isColumnFilterActive).length;
}

/**
 * ⭐ **Applica i filtri di colonna a un insieme di righe.**
 *
 * ⚠️ **Filtra ciò che è già CARICATO, ed è corretto qui**: gli elenchi di
 * VestiFlow chiedono `all=1` — verificato su tutti e sette il 31/08/2026 — quindi
 * l'insieme in mano **è** il risultato del filtro di periodo e ricerca. Su un
 * elenco paginato questo sarebbe il difetto che il motore evita per
 * l'ordinamento: filtrare una pagina e chiamarla il risultato.
 *
 * ⛔ **Il confronto usa `cellText`, cioè ciò che l'operatore LEGGE.** Non il
 * valore grezzo: chi filtra «Confermato» sta scegliendo la parola che vede in
 * tabella, e un filtro che confrontasse l'enum `confirmed` mostrerebbe scelte
 * che nella colonna non compaiono.
 *
 * ⚠️ **`range` invece legge il NUMERO**, e non può fare altrimenti: `1.234,50 €`
 * è una stringa, e confrontarla come tale metterebbe «−5» dopo «10». Chi
 * dichiara una colonna `range` fornisce l'estrattore.
 */
export function applicaFiltriDiColonna<T>(
  righe: readonly T[],
  filtri: ColumnFilterState,
  opzioni: {
    readonly cellText: (row: T, columnId: string) => string;
    /** Il numero di una colonna `range`. Senza, la colonna non filtra. */
    readonly numeroDi?: (row: T, columnId: string) => number | null;
  },
): readonly T[] {
  const attivi = Object.entries(filtri).filter(([, v]) => isColumnFilterActive(v));
  if (attivi.length === 0) {
    return righe;
  }

  return righe.filter((riga) =>
    attivi.every(([columnId, filtro]) => {
      switch (filtro.kind) {
        case 'values':
          return (filtro.values ?? []).includes(opzioni.cellText(riga, columnId));
        case 'text':
          return opzioni
            .cellText(riga, columnId)
            .toLocaleLowerCase('it')
            .includes((filtro.text ?? '').trim().toLocaleLowerCase('it'));
        case 'range': {
          const numero = opzioni.numeroDi?.(riga, columnId) ?? null;
          if (numero === null) {
            // ⚠️ Senza estrattore la colonna non filtra: meglio non restringere
            //    che restringere per un confronto che non sappiamo fare.
            return true;
          }
          if (filtro.min !== undefined && numero < filtro.min) {
            return false;
          }
          return !(filtro.max !== undefined && numero > filtro.max);
        }
        default:
          return true;
      }
    }),
  );
}

/**
 * ⭐ **I valori distinti di una colonna**, per il controllo `values`.
 *
 * ⚠️ **Si leggono dalle righe CARICATE**, non da un elenco dichiarato: così le
 * scelte sono esattamente quelle che compaiono in tabella, e non ce n'è una che
 * non dà risultati.
 *
 * ⚠️ **Ordinati come li legge un italiano** (`localeCompare` con `it`): «Àncona»
 * viene prima di «Bari», e non dopo «Zurigo» come farebbe un confronto binario.
 */
export function valoriDistinti<T>(
  righe: readonly T[],
  columnId: string,
  cellText: (row: T, columnId: string) => string,
): readonly string[] {
  const visti = new Set<string>();
  for (const riga of righe) {
    const testo = cellText(riga, columnId).trim();
    if (testo.length > 0) {
      visti.add(testo);
    }
  }
  return [...visti].sort((a, b) => a.localeCompare(b, 'it'));
}
