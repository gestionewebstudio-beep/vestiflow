import { ProductStatus } from '@core/models/product.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

const STATUS_LABELS: Readonly<Record<ProductStatus, string>> = {
  [ProductStatus.Active]: 'Attivo',
  [ProductStatus.Draft]: 'Bozza',
  [ProductStatus.Archived]: 'Archiviato',
};

const STATUS_TONES: Readonly<Record<ProductStatus, BadgeTone>> = {
  [ProductStatus.Active]: 'success',
  [ProductStatus.Draft]: 'neutral',
  [ProductStatus.Archived]: 'warning',
};

/** Label leggibile dello stato prodotto (condivisa tra lista e dettaglio). */
export function productStatusLabel(status: ProductStatus): string {
  return STATUS_LABELS[status];
}

/** Tono badge associato allo stato prodotto. */
export function productStatusTone(status: ProductStatus): BadgeTone {
  return STATUS_TONES[status];
}
