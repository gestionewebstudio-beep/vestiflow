import type { DataTableSort } from '@shared/components/data-table/data-table.model';
import type { SortKey, SortValueKind } from '@shared/utils/sort-values.util';
import { sortByKeys } from '@shared/utils/sort-values.util';

import type { CorrispettiviRegisterRow } from './corrispettivi.model';

/**
 * L'ordinamento manuale del Registro Corrispettivi (`10` §20).
 *
 * ## ⛔ Esiste solo con «Raggruppa: Nessuno»
 *
 * _Deciso dal proprietario il 20/08/2026, come semplificazione:_
 *
 * | Raggruppa: **Giorno**  | nessun ordinamento manuale — resta l'ordine canonico del Registro |
 * | Raggruppa: **Nessuno** | ordinamento comune, con lo stesso `DataTableSort[]` degli altri riepiloghi |
 *
 * ⭐ **Il raggruppamento per giorno È già una forma di ordinamento strutturato**:
 * pretendere anche quello manuale avrebbe richiesto una logica «prima il
 * giorno, poi la colonna scelta» — con il rischio di rompere subtotali e piedi
 * di giornata per una capacità che nessuno aveva chiesto.
 *
 * ⚠️ **I filtri restano pienamente attivi in entrambi i casi**, e si applicano
 * PRIMA del raggruppamento: si filtra per periodo, origine, tipo o sede e si
 * vedono le righe filtrate, comunque raggruppate per giorno.
 *
 * ## Perché client-side
 *
 * Il Registro non impagina: l'insieme caricato **è** il risultato del filtro,
 * quindi ordinarlo qui è ordinare tutto — non una pagina (`14` §H15). È la
 * stessa ragione, e la stessa primitiva, del registro movimenti.
 */
export const CORRISPETTIVI_SORT_KINDS = {
  occurredAt: 'date',
  kind: 'text',
  orderNumber: 'text',
  customerName: 'text',
  source: 'text',
  location: 'text',
  financialStatus: 'text',
  taxable: 'number',
  tax: 'number',
  total: 'number',
} as const satisfies Record<string, SortValueKind>;

export type CorrispettiviSortColumn = keyof typeof CORRISPETTIVI_SORT_KINDS;

export function isCorrispettiviSortColumn(id: string): id is CorrispettiviSortColumn {
  return id in CORRISPETTIVI_SORT_KINDS;
}

/**
 * Le etichette con cui si ordina Tipo, Origine, Sede e Pagamento.
 *
 * ⭐ **Si ordina per ETICHETTA, cioè per quello che l'operatore legge** — la
 * decisione presa sui Movimenti (`14` §H13), che qui si può applicare
 * esattamente perché l'ordinamento sta nel client: l'etichetta esiste solo qui.
 */
export interface CorrispettiviSortLabels {
  readonly kind: (row: CorrispettiviRegisterRow) => string;
  readonly source: (row: CorrispettiviRegisterRow) => string;
  readonly location: (row: CorrispettiviRegisterRow) => string;
  readonly financialStatus: (row: CorrispettiviRegisterRow) => string;
}

/** Il valore su cui si confronta una colonna: mai la stampa in cella. */
function valoreCanonico(
  row: CorrispettiviRegisterRow,
  colonna: CorrispettiviSortColumn,
  etichette: CorrispettiviSortLabels,
): string | number {
  switch (colonna) {
    case 'occurredAt':
      return row.occurredAt;
    case 'kind':
      return etichette.kind(row);
    case 'orderNumber':
      return row.orderNumber;
    case 'customerName':
      return row.customerName;
    case 'source':
      return etichette.source(row);
    case 'location':
      return etichette.location(row);
    case 'financialStatus':
      return etichette.financialStatus(row);
    // ⛔ Gli importi si confrontano in unità minori, non sulla stringa
    // formattata: «1.234,50 €» ordinato come testo mette il 9 dopo il 10.
    case 'taxable':
      return row.taxable.amountMinor;
    case 'tax':
      return row.tax.amountMinor;
    case 'total':
      return row.total.amountMinor;
  }
}

/**
 * Applica l'ordinamento scelto. Senza chiavi — o con il raggruppamento acceso,
 * che il chiamante esprime non passandone — restituisce le righe **come sono
 * arrivate**, cioè nell'ordine canonico del Registro.
 */
export function ordinaCorrispettivi(
  righe: readonly CorrispettiviRegisterRow[],
  chiavi: readonly DataTableSort[],
  etichette: CorrispettiviSortLabels,
): readonly CorrispettiviRegisterRow[] {
  const valide = chiavi.filter((chiave) => isCorrispettiviSortColumn(chiave.columnId));
  if (valide.length === 0) {
    return righe;
  }
  const keys: readonly SortKey<CorrispettiviRegisterRow>[] = valide.map((chiave) => {
    const colonna = chiave.columnId as CorrispettiviSortColumn;
    return {
      read: (row: CorrispettiviRegisterRow) => valoreCanonico(row, colonna, etichette),
      kind: CORRISPETTIVI_SORT_KINDS[colonna],
      direction: chiave.direction,
    };
  });
  return sortByKeys([...righe], keys, righe[0]?.currency ?? 'EUR');
}
