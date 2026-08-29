import type { TableColumnDef, TableColumnFilterKind } from './table-column.model';

/**
 * ⭐ **La forma di filtro effettiva di una colonna** (`14` §0.2, §11.1).
 *
 * I filtri di un elenco sono le sue colonne: qui si risponde alla sola domanda
 * che il motore deve porsi per ognuna — «come la filtro?».
 *
 * ⚠️ **Opt-out**: una colonna che non dichiara niente È filtrabile, e la forma
 * si deduce. È la stessa disciplina di `sortable`, e per la stessa ragione — il
 * difetto da evitare è la colonna che si è dimenticata di essere filtrabile,
 * che nessuno nota finché non serve.
 *
 * ```text
 * filter dichiarato   →  quello, e la deduzione non si applica
 * filter: false       →  nessun filtro
 * numeric             →  range     totali, quantità, importi
 * display code/trunc  →  text      alta cardinalità: SKU, riferimenti, commenti
 * altrimenti          →  values    insieme di valori distinti, a scelta multipla
 * ```
 *
 * ⛔ **La deduzione è un default sensato, non un oracolo.** Una colonna DATA
 * porta spesso `display: 'code'` — cifre incolonnate — e finirebbe `text`
 * mentre vuole `range`: lì il `filter` si dichiara. La regola è pensata per
 * sbagliare **verso il filtro sbagliato, mai verso il filtro assente**, perché
 * il primo si vede subito e il secondo no.
 */
export function resolveColumnFilterKind(column: TableColumnDef): TableColumnFilterKind | null {
  if (column.filter === false) return null;
  if (column.filter != null) return column.filter;
  if (column.numeric === true) return 'range';
  if (column.display != null) return 'text';
  return 'values';
}

/** La colonna porta un controllo di filtro? */
export function isColumnFilterable(column: TableColumnDef): boolean {
  return resolveColumnFilterKind(column) !== null;
}

/**
 * Le colonne filtrabili fra quelle **visibili**.
 *
 * ⚠️ **Colonna spenta, filtro spento** — decisione owner del 29/08/2026
 * (`14` §0.2). Il controllo vive nell'intestazione: senza intestazione non c'è
 * dove metterlo, e filtrare per una colonna che non si vede significa
 * restringere l'elenco per un criterio invisibile.
 *
 * ⭐ Resta vero che **ogni** colonna ha il suo filtro, anche quelle spente di
 * serie: la filtrabilità appartiene alla colonna, non alla sua visibilità
 * corrente. Riaccendendola dal selettore Colonne, il filtro torna con lei.
 */
export function filterableColumns(columns: readonly TableColumnDef[]): readonly TableColumnDef[] {
  return columns.filter(isColumnFilterable);
}
