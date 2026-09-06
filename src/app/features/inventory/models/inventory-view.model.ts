import type { EntityId, IsoDateString } from '@core/models/common.model';
import type { StockStatus } from '@core/models/inventory-level.model';
import type {
  AdjustmentDirection,
  MovementOrigin,
  StockMovementType,
} from '@core/models/stock-movement.model';

// View model di presentazione del magazzino: righe già join-ate e formattate
// dalle pagine smart, consumate dalle tabelle dumb.

/** Riga giacenza (variante × location) pronta per la tabella. */
export interface InventoryLevelRow {
  readonly id: EntityId;
  readonly variantId: EntityId;
  readonly locationId: EntityId;
  readonly sku: string;
  /** Codice articolo del prodotto (colonna selezionabile §Codice articolo). */
  readonly articleCode: string;
  /** Display completo prodotto + variante. */
  readonly title: string;
  readonly locationName: string;
  readonly available: number;
  readonly onHand: number;
  readonly committed: number;
  readonly incoming: number;
  readonly minThreshold: number;
  readonly status: StockStatus;
}

/** Riga movimento pronta per la tabella (date e segni già formattati). */
export interface StockMovementRow {
  readonly id: EntityId;
  readonly type: StockMovementType;
  readonly sku: string;
  /** Codice articolo del prodotto (colonna selezionabile §Codice articolo). */
  readonly articleCode: string;
  /** Quantità con segno display (es. '+40', '−2', '6' per i trasferimenti). */
  readonly signedQuantity: string;
  /**
   * ⭐ **Lo stesso valore, come NUMERO**, per la riga totali dell'elenco.
   *
   * ⛔ **Non si ricava dalla stringa qui sopra.** Quella è già formattata e porta
   * un meno tipografico (−, U+2212) che `Number()` non riconosce: riparsarla
   * darebbe `NaN` su ogni scarico, e il totale sarebbe silenziosamente sbagliato
   * invece che rotto.
   */
  readonly signedQuantityValue: number;
  /** 'Napoli' oppure 'Magazzino → Milano' per i trasferimenti. */
  readonly locationLabel: string;
  readonly direction?: AdjustmentDirection;
  readonly reason?: string;
  /** Data/ora già formattata. */
  readonly createdAtLabel: string;
  /**
   * ⭐ **La stessa data, GREZZA**, per il raggruppamento per giornata.
   *
   * ⛔ **Non si ricava dall'etichetta qui sopra.** Quella è già formattata in
   * italiano («17 ago 2026, 14:30»): riparsarla per ritagliarne il giorno
   * significherebbe scrivere un parser di date localizzate, che è esattamente il
   * genere di conversione che poi sbaglia su un mese o su un fuso.
   */
  readonly createdAt: IsoDateString;
  readonly createdByName: string;
  readonly origin?: MovementOrigin;
  readonly originLabel?: string;
  readonly productTitle?: string;
  readonly documentReference?: string;
}
