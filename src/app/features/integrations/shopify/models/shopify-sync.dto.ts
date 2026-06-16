export interface ShopifySyncLocationsDto {
  readonly synced: true;
  readonly matchedCount: number;
}

export interface ShopifySyncWebhooksDto {
  readonly synced: true;
  readonly registered: readonly string[];
  readonly skipped: readonly string[];
  readonly failed: readonly { readonly topic: string; readonly message: string }[];
}
