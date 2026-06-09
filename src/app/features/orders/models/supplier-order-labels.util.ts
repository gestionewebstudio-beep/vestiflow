// Etichette e toni display per gli stati ordine fornitore (it-IT).

import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

const STATUS_LABELS: Record<SupplierOrderStatus, string> = {
  [SupplierOrderStatus.Draft]: 'Bozza',
  [SupplierOrderStatus.Sent]: 'Inviato',
  [SupplierOrderStatus.PartiallyReceived]: 'Ricevuto parziale',
  [SupplierOrderStatus.Received]: 'Ricevuto',
  [SupplierOrderStatus.Cancelled]: 'Annullato',
};

const STATUS_TONES: Record<SupplierOrderStatus, BadgeTone> = {
  [SupplierOrderStatus.Draft]: 'neutral',
  [SupplierOrderStatus.Sent]: 'info',
  [SupplierOrderStatus.PartiallyReceived]: 'warning',
  [SupplierOrderStatus.Received]: 'success',
  [SupplierOrderStatus.Cancelled]: 'error',
};

export function supplierOrderStatusLabel(status: SupplierOrderStatus): string {
  return STATUS_LABELS[status];
}

export function supplierOrderStatusTone(status: SupplierOrderStatus): BadgeTone {
  return STATUS_TONES[status];
}
