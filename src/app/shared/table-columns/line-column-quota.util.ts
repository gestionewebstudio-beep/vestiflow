import type { TableColumnDef } from './table-column.model';

/**
 * Larghezza di colonna come QUOTA percentuale del totale — SENZA
 * ridistribuzione al resize.
 *
 * ⛔ Non è `column-width-distribution.util.ts` (che ridistribuisce spazio
 * dando/togliendo alle colonne vicine durante il trascinamento, con clamp sui
 * minimi): qui il resize di una colonna non tocca le altre — ogni colonna
 * tiene i propri px salvati indipendentemente. È il comportamento di oggi in
 * quattro maschere documentali (Fatture/Proforma, Rettifica/Inventario,
 * Trasferimento, Ordine fornitore): estratto perché il CALCOLO — percentuale
 * sul totale visibile, `'auto'` finché il totale non è ancora noto — era
 * identico, non perché le due logiche di resize siano la stessa cosa.
 *
 * `E-1`, mappa di riuso Vendita al banco, 21/08/2026.
 */

/** Somma dei px delle sole colonne VISIBILI. */
export function sumVisibleLineColumnsPx(
  defs: readonly TableColumnDef[],
  isVisible: (columnId: string) => boolean,
  pxOf: (columnId: string) => number,
): number {
  return defs.reduce((total, def) => (isVisible(def.id) ? total + pxOf(def.id) : total), 0);
}

/**
 * Quota percentuale di `columnId` sul totale `totalPx` (già calcolato, es.
 * con `sumVisibleLineColumnsPx`). `'auto'` finché il totale non è ancora
 * positivo — senza, la divisione per zero produrrebbe `NaN%`.
 */
export function lineColumnQuotaWidth(
  columnId: string,
  totalPx: number,
  pxOf: (columnId: string) => number,
): string {
  if (totalPx <= 0) {
    return 'auto';
  }
  return `${((pxOf(columnId) / totalPx) * 100).toFixed(4)}%`;
}
