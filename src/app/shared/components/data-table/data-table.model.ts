/**
 * Contratto del **motore tabella dei riepiloghi** (`14` parte H).
 *
 * ⛔ Qui non compare nessun dominio: non documenti, non movimenti, non
 * corrispettivi. Il motore rende colonne e sezioni; che cosa ci sia dentro una
 * cella lo dice la pagina, con un template proiettato.
 */

/**
 * Il piede di una sezione: un'etichetta che occupa le colonne iniziali e un
 * valore per ciascuna colonna che porta un totale.
 *
 * ⚠️ I valori sono **già formattati**: importi, date e decimali appartengono al
 * dominio, e il motore non sa in che valuta si legge un numero.
 *
 * ⛔ **Non si ricalcolano dalle righe a schermo.** Nel Registro Corrispettivi è
 * vietato esplicitamente (`docs/10`): i subtotali arrivano dallo stesso
 * accumulatore del totale di periodo, e sommare le righe rese sarebbe una
 * seconda matematica che può divergere di un centesimo.
 */
export interface DataTableSectionFooter {
  readonly label: string;
  /** `columnId` → testo. Le colonne assenti restano vuote. */
  readonly values: Readonly<Record<string, string>>;
}

/**
 * Una sezione di righe.
 *
 * ⭐ **Una tabella piatta è UNA sezione senza intestazione e senza piede**: non
 * esistono due modi di rendere il corpo, ne esiste uno con due `@if`.
 */
export interface DataTableSection<T> {
  readonly id: string;
  /** Etichetta a piena larghezza sopra le righe (raggruppamento). */
  readonly header?: string;
  readonly rows: readonly T[];
  readonly footer?: DataTableSectionFooter;
}

export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableSort {
  readonly columnId: string;
  readonly direction: DataTableSortDirection;
}

/**
 * Il prossimo stato dell’ordinamento quando si preme l’intestazione di una colonna.
 *
 * ⭐ **L’ordinamento è a PIÙ CHIAVI, e il nuovo non cancella il precedente**: lo
 * scavalca. Premere Prodotto dopo Data ordina per prodotto e, a parità di
 * prodotto, per data — che è come si legge un registro quando si cerca qualcosa,
 * e la convenzione di ogni gestionale.
 *
 * La colonna premuta va **sempre in testa**, e il suo ciclo è
 * `crescente → decrescente → fuori`:
 *
 * ```text
 * assente        →  in testa, crescente
 * crescente      →  in testa, decrescente
 * decrescente    →  esce, e le altre restano
 * ```
 *
 * ⛔ Vive nel modello e non nel componente perché è **la regola**, e così si prova
 * senza rendere una tabella.
 */
export function nextSort(
  current: readonly DataTableSort[],
  columnId: string,
): readonly DataTableSort[] {
  const corrente = current.find((sort) => sort.columnId === columnId);
  const altre = current.filter((sort) => sort.columnId !== columnId);
  if (!corrente) {
    return [{ columnId, direction: 'asc' }, ...altre];
  }
  if (corrente.direction === 'asc') {
    return [{ columnId, direction: 'desc' }, ...altre];
  }
  return altre;
}

/**
 * Il valore di `aria-sort` per una colonna.
 *
 * ⚠️ Lo annuncia **solo la colonna primaria**: ARIA raccomanda un `aria-sort` per
 * volta, e con più chiavi attive dichiararli tutti direbbe a chi ascolta che la
 * tabella è ordinata in tre modi contemporaneamente. Il posto delle chiavi
 * secondarie è il nome accessibile del pulsante, dove si può dire «2 di 3».
 */
export function ariaSortOf(
  current: readonly DataTableSort[],
  columnId: string,
): 'ascending' | 'descending' | 'none' {
  const primaria = current[0];
  if (!primaria || primaria.columnId !== columnId) {
    return 'none';
  }
  return primaria.direction === 'asc' ? 'ascending' : 'descending';
}

/**
 * La posizione della colonna fra le chiavi attive, contando da 1 — `null` se non
 * ordina.
 *
 * ⭐ Serve a **mostrarlo**: con più chiavi, una freccia sola non dice quale
 * comanda. Il numero accanto alla freccia è l’unica cosa che lo dice.
 */
export function sortRankOf(current: readonly DataTableSort[], columnId: string): number | null {
  const indice = current.findIndex((sort) => sort.columnId === columnId);
  return indice < 0 ? null : indice + 1;
}

/** Il verso con cui una colonna ordina, se ordina. */
export function sortDirectionOf(
  current: readonly DataTableSort[],
  columnId: string,
): DataTableSortDirection | null {
  return current.find((sort) => sort.columnId === columnId)?.direction ?? null;
}
