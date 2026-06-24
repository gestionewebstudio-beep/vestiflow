// Etichette e toni display per stati stock e tipi movimento (it-IT).
// Funzioni pure riusate da tabelle, pagine e report.

import { StockStatus } from '@core/models/inventory-level.model';
import { MovementOrigin, StockMovementType } from '@core/models/stock-movement.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  [StockStatus.Ok]: 'Disponibile',
  [StockStatus.Low]: 'Sotto soglia',
  [StockStatus.Empty]: 'Esaurito',
};

const STOCK_STATUS_TONES: Record<StockStatus, BadgeTone> = {
  [StockStatus.Ok]: 'success',
  [StockStatus.Low]: 'warning',
  [StockStatus.Empty]: 'error',
};

export function stockStatusLabel(status: StockStatus): string {
  return STOCK_STATUS_LABELS[status];
}

export function stockStatusTone(status: StockStatus): BadgeTone {
  return STOCK_STATUS_TONES[status];
}

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  [StockMovementType.Load]: 'Carico',
  [StockMovementType.Unload]: 'Scarico',
  [StockMovementType.Transfer]: 'Trasferimento',
  [StockMovementType.Adjustment]: 'Rettifica',
  [StockMovementType.Sale]: 'Vendita',
  [StockMovementType.Return]: 'Reso',
};

const MOVEMENT_TYPE_TONES: Record<StockMovementType, BadgeTone> = {
  [StockMovementType.Load]: 'success',
  [StockMovementType.Unload]: 'warning',
  [StockMovementType.Transfer]: 'info',
  [StockMovementType.Adjustment]: 'neutral',
  [StockMovementType.Sale]: 'info',
  [StockMovementType.Return]: 'success',
};

export function movementTypeLabel(type: StockMovementType): string {
  return MOVEMENT_TYPE_LABELS[type];
}

export function movementTypeTone(type: StockMovementType): BadgeTone {
  return MOVEMENT_TYPE_TONES[type];
}

/** Snapshot audit `createdByName` → etichetta comprensibile in UI. */
const MOVEMENT_ACTOR_LABELS: Readonly<Record<string, string>> = {
  API: 'Automatico',
  Shopify: 'Shopify',
};

export function movementActorLabel(createdByName: string): string {
  const trimmed = createdByName.trim();
  if (!trimmed) {
    return '—';
  }
  return MOVEMENT_ACTOR_LABELS[trimmed] ?? trimmed;
}

const MOVEMENT_ORIGIN_LABELS: Record<MovementOrigin, string> = {
  [MovementOrigin.Manual]: 'Gestionale',
  [MovementOrigin.Shopify]: 'Shopify',
  [MovementOrigin.Tiktok]: 'TikTok',
  [MovementOrigin.VestiflowPos]: 'Vendita negozio',
};

export function movementOriginLabel(origin: MovementOrigin | undefined): string {
  if (!origin) {
    return '—';
  }
  return MOVEMENT_ORIGIN_LABELS[origin] ?? origin;
}
