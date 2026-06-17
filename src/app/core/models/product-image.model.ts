import type { EntityId } from '@core/models/common.model';

/** Immagine prodotto (upload gestionale o import Shopify). */
export interface ProductImage {
  readonly id: EntityId;
  readonly url: string;
  readonly altText?: string;
  readonly sortOrder: number;
}
