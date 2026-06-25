export interface VariantSummaryDto {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  readonly title: string;
  readonly sellingPrice: {
    readonly amountMinor: number;
    readonly currencyCode: string;
  };
}
