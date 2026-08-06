/** Topic webhook Shopify registrati da VestiFlow post-OAuth. */
export const SHOPIFY_WEBHOOK_TOPICS = [
  'inventory_levels/update',
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'customers/create',
  'customers/update',
  'products/create',
  'products/update',
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];

/** Richiedono Protected customer data approval su Shopify Partners. */
export const SHOPIFY_PROTECTED_WEBHOOK_TOPICS: ReadonlySet<ShopifyWebhookTopic> = new Set([
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'customers/create',
  'customers/update',
]);

export interface ShopifyWebhookRegistrationResult {
  readonly registered: readonly ShopifyWebhookTopic[];
  readonly skipped: readonly ShopifyWebhookTopic[];
  readonly failed: readonly { topic: ShopifyWebhookTopic; message: string }[];
}
