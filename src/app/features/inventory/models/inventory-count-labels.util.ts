import { InventoryCountStatus } from '@core/models/inventory-count.model';
import type { InventoryCountStatus as InventoryCountStatusType } from '@core/models/inventory-count.model';

const STATUS_LABELS: Record<InventoryCountStatusType, string> = {
  [InventoryCountStatus.InProgress]: 'In corso',
  [InventoryCountStatus.Review]: 'In revisione',
  [InventoryCountStatus.Completed]: 'Completato',
  [InventoryCountStatus.Cancelled]: 'Annullato',
};

const STATUS_TONES: Record<
  InventoryCountStatusType,
  'neutral' | 'success' | 'warning' | 'error' | 'info'
> = {
  [InventoryCountStatus.InProgress]: 'info',
  [InventoryCountStatus.Review]: 'warning',
  [InventoryCountStatus.Completed]: 'success',
  [InventoryCountStatus.Cancelled]: 'neutral',
};

export function inventoryCountStatusLabel(status: InventoryCountStatusType): string {
  return STATUS_LABELS[status];
}

export function inventoryCountStatusTone(
  status: InventoryCountStatusType,
): 'neutral' | 'success' | 'warning' | 'error' | 'info' {
  return STATUS_TONES[status];
}
