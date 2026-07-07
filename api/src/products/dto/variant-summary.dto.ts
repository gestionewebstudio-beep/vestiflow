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
  readonly supplierSku?: string | null;
  readonly stockOnHand?: number | null;
  readonly category?: string | null;
}
