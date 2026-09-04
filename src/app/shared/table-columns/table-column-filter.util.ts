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
 * numeric             →  range     totali, quantità, importi: in più, gli estremi
 * altrimenti          →  values    l'elenco dei valori, con la ricerca dentro
 * ```
 *
 * ⛔ **QUI C'ERA `display code/trunc → text`, E LO SCEGLIEVA LA
 * PRESENTAZIONE.** Una colonna diventava «si filtra scrivendo» perché qualcuno
 * aveva deciso di incolonnarne le cifre o di troncarne il testo — due decisioni
 * che col filtro non c'entrano niente. Undici colonne finivano lì per quella
 * strada, e il proprietario l'ha visto a schermo il 01/09/2026: «alcuni
 * funzionano in un modo ed altri hanno un altro funzionamento e non ha senso».
 *
 * ⭐ **Il controllo ora è UNO** (`column-filter`), e sa fare entrambe le cose:
 * si spunta dall'elenco **oppure** si scrive per restringere. Quindi il `kind`
 * non decide più *come* si filtra — decide **che cosa il pannello offre in
 * più**: gli estremi su un numero, le scorciatoie di periodo e gli estremi su
 * una data.
 *
 * ⚠️ **`filter: 'text'` resta un valore legittimo** e non è più una privazione:
 * dichiara «questa colonna si filtra scrivendo», e il pannello continua a
 * offrire anche l'elenco. Le 59 colonne che lo dichiarano non perdono niente e
 * guadagnano le spunte.
 */
export function resolveColumnFilterKind(column: TableColumnDef): TableColumnFilterKind | null {
  if (column.filter === false) return null;
  if (column.filter != null) return column.filter;
  if (column.numeric === true) return 'range';
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
