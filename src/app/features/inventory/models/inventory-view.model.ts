import type { EntityId } from '@core/models/common.model';
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
  readonly sku: string;
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
  /** Quantità con segno display (es. '+40', '−2', '6' per i trasferimenti). */
  readonly signedQuantity: string;
  /** 'Napoli' oppure 'Magazzino → Milano' per i trasferimenti. */
  readonly locationLabel: string;
  readonly direction?: AdjustmentDirection;
  readonly reason?: string;
  /** Data/ora già formattata. */
  readonly createdAtLabel: string;
  readonly createdByName: string;
  readonly origin?: MovementOrigin;
  readonly originLabel?: string;
  readonly productTitle?: string;
  readonly documentReference?: string;
}
