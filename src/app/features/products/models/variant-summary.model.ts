import type { EntityId, Money } from '@core/models/common.model';
import type { ProductKind } from '@core/models/product.model';

/**
 * Vista denormalizzata di una variante per consumer fuori dalla feature
 * Prodotti (magazzino, report, dashboard): lookup leggero senza caricare
 * l'intero Product. In un backend reale sarebbe un endpoint di ricerca varianti.
 */
export interface VariantSummary {
  readonly variantId: EntityId;
  readonly productId: EntityId;
  readonly sku: string;
  /** Codice articolo del prodotto (identificatore anagrafico interno VestiFlow). */
  readonly articleCode: string;
  readonly productName: string;
  /** Display completo (es. 'T-shirt Basic — M / Bianco'). */
  readonly title: string;
  readonly barcode?: string;
  readonly sellingPrice: Money;
  readonly purchasePrice?: Money;
  readonly compareAtPrice?: Money | null;
  readonly supplierSku?: string;
  readonly stockOnHand?: number | null;
  /** Disponibile = Giacenza − Impegnata (per la location richiesta, se passata). */
  readonly stockAvailable?: number | null;
  readonly category?: string;
  readonly unitOfMeasure?: string;
  /** Codice IVA predefinito del prodotto (ereditato dalle righe documento). */
  readonly defaultVatCodeId?: string;
  /** False = prodotto non gestito a magazzino: le righe documento non caricano giacenza. */
  readonly managesStock?: boolean;
  /** Tipo prodotto: default della spunta "Impegna magazzino" (Ordine cliente). */
  readonly kind?: ProductKind;
}
