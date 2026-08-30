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
  /**
   * ⭐ **Quale valore RISPONDE alla domanda del gruppo**, e sale al terzo livello
   * di peso (`regole-stile-ui`, «Riga di subtotale»): grassetto e
   * `--color-primary`.
   *
   * Su un registro è il Totale; su un elenco di magazzino potrebbe essere la
   * quantità. Il motore non lo sa e non deve indovinarlo.
   *
   * ⚠️ Omesso, nessun valore si distingue — e va bene per un piede che chiude e
   * basta.
   */
  readonly emphasis?: string;
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

/**
 * ⭐ **I toni ammessi per una riga.** Insieme chiuso, non una classe libera.
 *
 * - `positive` — la riga AGGIUNGE: una vendita, un carico. Non tinge niente su
 *   scrivania — è il caso normale — ma sulla **card** porta l'accento laterale.
 * - `negative` — la riga TOGLIE: reso, rettifica, nota di credito, rimborso.
 * - `muted` — la riga è annullata o non concorre: si legge, non si conta.
 *
 * ⚠️ **`null` non è `positive`.** Un elenco che non distingue i versi — documenti,
 * clienti, prodotti — restituisce `null` e non prende nessun accento: la striscia
 * colorata su ogni card di ogni elenco sarebbe rumore, non informazione.
 *
 * ⚠️ Il tono non è lo stato di selezione né quello di passaggio del mouse: è
 * una proprietà del DATO, e resta visibile anche quando la riga è selezionata.
 */
export type DataTableRowTone = 'positive' | 'negative' | 'muted';

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

/**
 * ⭐ **Il descrittore di ordinamento in forma testuale**, per chi deve mandarlo
 * fuori dal browser: una query all'API, un parametro nell'URL.
 *
 * ```text
 * [{ columnId: 'documentDate', direction: 'desc' }, { columnId: 'total', direction: 'asc' }]
 *   ⇄  "documentDate:desc,total:asc"
 * ```
 *
 * ⛔ **Non è un secondo formato di ordinamento, ed è la ragione per cui sta
 * qui.** È lo STESSO descrittore che il motore già usa — stessi id di colonna,
 * stesso ordine di priorità — scritto su una riga. Se ogni elenco paginato si
 * serializzasse le sue chiavi nel proprio service, la seconda grammatica
 * nascerebbe da sé: uno userebbe `sortBy`+`sortDir`, un altro `order=-data`, e
 * l'API dovrebbe conoscerle tutte.
 *
 * ⚠️ **La whitelist non è qui.** Quali colonne un elenco sappia davvero
 * ordinare dipende dall'elenco — e dove l'ordinamento lo fa il database, dal
 * database. Questa coppia traduce e basta.
 */
export function serializeDataTableSort(sorts: readonly DataTableSort[]): string {
  return sorts.map((sort) => `${sort.columnId}:${sort.direction}`).join(',');
}

/**
 * L'inverso: dalla forma testuale al descrittore.
 *
 * ⚠️ **Scarta in silenzio ciò che non è ben formato**, e non è distrazione: la
 * stringa arriva dall'URL, cioè da un posto che chiunque può digitare o
 * troncare. Un ordinamento illeggibile deve dare l'elenco nel suo ordine
 * predefinito, non una pagina di errore.
 *
 * ⛔ Lato server la scelta è l'opposta — `parseDocumentListSort` risponde `400`
 * su un campo ignoto — e le due non sono in contraddizione: lì la stringa
 * arriva da un programma, e un campo che non esiste è un difetto da far vedere
 * subito, non da assorbire.
 */
export function parseDataTableSort(raw: string | null | undefined): readonly DataTableSort[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim().split(':'))
    .filter(
      (parti): parti is [string, DataTableSortDirection] =>
        parti.length === 2 && Boolean(parti[0]) && (parti[1] === 'asc' || parti[1] === 'desc'),
    )
    .map(([columnId, direction]) => ({ columnId, direction }));
}
