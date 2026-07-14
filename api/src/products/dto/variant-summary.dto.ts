export interface VariantSummaryDto {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
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
  readonly category?: string | null;
  readonly unitOfMeasure?: string | null;
  readonly defaultVatCodeId?: string | null;
  /** False = prodotto non gestito a magazzino: le righe documento non caricano giacenza. */
  readonly managesStock?: boolean;
}
