import type { EntityId, IsoDateString, TenantScoped } from './common.model';

// Ogni modifica inventariale significativa produce un movimento tracciabile.
export const StockMovementType = {
  Load: 'load',
  Unload: 'unload',
  Transfer: 'transfer',
  Adjustment: 'adjustment',
  Sale: 'sale',
  Return: 'return',
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

/**
 * Movimento di magazzino = log operativo immutabile.
 * `quantity` e' sempre positiva; la direzione e' data dal `type`.
 */
export interface StockMovement extends TenantScoped {
  readonly id: EntityId;
  readonly type: StockMovementType;
  readonly variantId: EntityId;
  readonly storeId: EntityId;
  readonly quantity: number;
  /** Motivo: obbligatorio a livello UI per le rettifiche (adjustment). */
  readonly reason?: string;
  /** Per i trasferimenti: negozio di origine. */
  readonly sourceStoreId?: EntityId;
  /** Per i trasferimenti: negozio di destinazione. */
  readonly targetStoreId?: EntityId;
  readonly createdAt: IsoDateString;
  /** Utente che ha eseguito il movimento (auditabilita'). */
  readonly createdBy: EntityId;
}
