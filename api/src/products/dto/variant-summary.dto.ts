export interface VariantSummaryDto {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  /** Codice articolo del prodotto (identificatore anagrafico interno VestiFlow). */
  readonly articleCode: string;
  readonly productName: string;
  readonly title: string;
  readonly barcode?: string | null;
  readonly sellingPrice: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  };
  readonly purchasePrice?: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  } | null;
  readonly compareAtPrice?: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  } | null;
  readonly supplierSku?: string | null;
  readonly stockOnHand?: number | null;
  /**
   * Disponibile = Giacenza − Impegnata (con locationId: della sola sede;
   * senza: totale multi-sede). Null se la variante non ha righe giacenza.
   */
  readonly stockAvailable?: number | null;
  /** Soglia minima di riordino (della sede richiesta se passata, altrimenti somma multi-sede); per colorare la disponibilità. */
  readonly stockMinThreshold?: number | null;
  /** URL della prima immagine del prodotto (miniatura nella ricerca); null se il prodotto non ha immagini. */
  readonly imageUrl?: string | null;
  readonly category?: string | null;
  readonly unitOfMeasure?: string | null;
  readonly defaultVatCodeId?: string | null;
  /** False = prodotto non gestito a magazzino: le righe documento non caricano giacenza. */
  readonly managesStock?: boolean;
  /** Tipo prodotto (Articolo/Servizio): default della spunta "Impegna magazzino". */
  readonly kind?: 'article' | 'service';
}
