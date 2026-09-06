import { ProductStatus } from '@core/models/product.model';
import type { BadgeTone } from '@shared/components/badge/badge.component';

/**
 * `archived` si legge «Non attivo» (docs/24 §3.2, §3.7): «Archiviato» era la
 * parola di Shopify, e qui confondeva lo stato locale con quello del canale —
 * un prodotto Non attivo in VestiFlow può essere ancora Attivo su Shopify.
 */
const STATUS_LABELS: Readonly<Record<ProductStatus, string>> = {
  [ProductStatus.Active]: 'Attivo',
  [ProductStatus.Draft]: 'Bozza',
  [ProductStatus.Archived]: 'Non attivo',
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
