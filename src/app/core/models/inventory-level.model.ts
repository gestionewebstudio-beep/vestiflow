import type { EntityId } from './common.model';

/**
 * Giacenza di una variante in una specifica location (Shopify-first).
 * Lo stock vive QUI, mai come campo su Product/ProductVariant (regole-gestionale).
 *
 * Le quantità rispecchiano il sottoinsieme minimo dei named states di Shopify
 * (`InventoryLevel.quantities`). NON vale l'invariante rigida
 * `onHand = available + committed + reserved`: Shopify ha bucket aggiuntivi non
 * modellati (damaged, safety_stock, quality_control), quindi i valori sono
 * stored/source-of-truth e gli helper servono solo a display/derivazioni.
 */
export interface InventoryLevel {
  readonly id: EntityId;
  /** Variante = inventory item (1:1) finché non serve un'entità dedicata. */
  readonly variantId: EntityId;
  /** Location che porta l'inventario (era `storeId`). */
  readonly locationId: EntityId;
  /** Fisicamente presente nella location. */
  readonly onHand: number;
  /** Vendibile ora. Può essere negativo (oversell, come Shopify). */
  readonly available: number;
  /** Allocato a ordini non ancora evasi. */
  readonly committed: number;
  /** In arrivo (ordini fornitore / trasferimenti in ingresso). Non è in `onHand`. */
  readonly incoming: number;
  /** Trattenuto (es. checkout / draft order). */
  readonly reserved: number;
  /** Soglia minima per il low-stock, valutata su `available`. */
  readonly minThreshold: number;
}

export const StockStatus = {
  Ok: 'ok',
  Low: 'low',
  Empty: 'empty',
} as const;
export type StockStatus = (typeof StockStatus)[keyof typeof StockStatus];
