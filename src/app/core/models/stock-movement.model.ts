import type { EntityId, IsoDateString, TenantScoped } from './common.model';

// Ogni modifica inventariale significativa produce un movimento tracciabile.
export const StockMovementType = {
  Load: 'load',
  Unload: 'unload',
  Transfer: 'transfer',
  Adjustment: 'adjustment',
  Sale: 'sale',
  Return: 'return',
  /** Scarico generato dalla Vendita online (evasione ordine canale, fase 2). */
  OnlineSale: 'online_sale',
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

/** Verso di una rettifica: aumento o diminuzione della giacenza. */
export const AdjustmentDirection = {
  Increase: 'increase',
  Decrease: 'decrease',
} as const;
export type AdjustmentDirection = (typeof AdjustmentDirection)[keyof typeof AdjustmentDirection];

/** Origine del movimento: gestionale, sync Shopify o altro canale. */
export const MovementOrigin = {
  Manual: 'manual',
  Shopify: 'shopify',
  Tiktok: 'tiktok',
  VestiflowPos: 'vestiflow_pos',
  VestiflowOnline: 'vestiflow_online',
} as const;
export type MovementOrigin = (typeof MovementOrigin)[keyof typeof MovementOrigin];

/**
 * Movimento di magazzino = log operativo immutabile.
 * `quantity` e' sempre positiva; la direzione e' data dal `type`
 * (e da `direction` per le rettifiche). Le giacenze vivono per Location
 * (inventory-level.model), quindi il movimento referenzia `locationId`.
 * `sku` e `createdByName` sono snapshot per display/audit, stabili anche se
 * catalogo o utenti cambiano.
 */
export interface StockMovement extends TenantScoped {
  readonly id: EntityId;
  readonly type: StockMovementType;
  readonly variantId: EntityId;
  /** SKU congelato al momento del movimento (display/audit). */
  readonly sku: string;
  /** Location interessata; per i trasferimenti e' la location di origine. */
  readonly locationId: EntityId;
  readonly quantity: number;
  /** Solo per le rettifiche: verso della correzione. */
  readonly direction?: AdjustmentDirection;
  /** Motivo: obbligatorio a livello UI per le rettifiche (adjustment). */
  readonly reason?: string;
  /** Per i trasferimenti: location di destinazione. */
  readonly targetLocationId?: EntityId;
  readonly createdAt: IsoDateString;
  /** Utente che ha eseguito il movimento (auditabilita'). */
  readonly createdBy: EntityId;
  /** Nome utente snapshot (display audit). */
  readonly createdByName: string;
  /** Origine sync/manuale (es. vendita Shopify). */
  readonly origin?: MovementOrigin;
  readonly externalRef?: string;
  readonly productTitle?: string;
  /** Codice articolo del prodotto (colonna selezionabile §Codice articolo). */
  readonly articleCode?: string;
  readonly documentReference?: string;
}
