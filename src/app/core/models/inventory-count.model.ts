import type { EntityId, IsoDateString } from './common.model';

/** Stato sessione inventario fisico. */
export const InventoryCountStatus = {
  InProgress: 'in_progress',
  Review: 'review',
  Completed: 'completed',
  Cancelled: 'cancelled',
} as const;
export type InventoryCountStatus = (typeof InventoryCountStatus)[keyof typeof InventoryCountStatus];

export interface InventoryCountLine {
  readonly id: EntityId;
  readonly variantId: EntityId;
  readonly sku: string;
  readonly productName: string;
  readonly systemQuantity: number;
  readonly countedQuantity: number | null;
}

export interface InventoryCountSession {
  readonly id: EntityId;
  readonly locationId: EntityId;
  readonly locationName: string;
  readonly name: string;
  readonly notes: string | null;
  readonly status: InventoryCountStatus;
  readonly createdAt: IsoDateString;
  readonly updatedAt: IsoDateString;
  readonly completedAt: IsoDateString | null;
  readonly createdByName: string;
  readonly lineCount: number;
  readonly linesCounted: number;
  readonly linesWithDelta: number;
  readonly lines?: readonly InventoryCountLine[];
  /** Documento inventario generato alla chiusura (C6). */
  readonly documentId?: EntityId;
}

export interface CreateInventoryCountInput {
  readonly locationId: EntityId;
  readonly name: string;
  readonly notes?: string;
}
