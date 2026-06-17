export interface ShopifySyncLocationsDto {
  readonly synced: true;
  readonly matchedCount: number;
  readonly importedCount: number;
  readonly totalCount: number;
}

export interface ShopifySyncWebhooksDto {
  readonly synced: true;
  readonly registered: readonly string[];
  readonly skipped: readonly string[];
  readonly failed: readonly { readonly topic: string; readonly message: string }[];
}

export interface ShopifyDisableWebhooksDto {
  readonly disabled: true;
  readonly deletedCount: number;
  readonly failed: readonly { readonly id: number; readonly message: string }[];
}

export interface ShopifyClearErrorsDto {
  readonly cleared: true;
  readonly productsReset: number;
  readonly locationsReset: number;
}

export interface ShopifySyncProductsDto {
  readonly synced: true;
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteProductCount: number;
  readonly failed: readonly { readonly shopifyProductId: string; readonly message: string }[];
}
