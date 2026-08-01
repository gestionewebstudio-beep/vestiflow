import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

/** Connessione attiva o in stato di allerta: mostra sync topbar, errori e banner. */
export function isShopifySyncUiActive(status: ShopifyConnectionStatus | null | undefined): boolean {
  return (
    status === ShopifyConnectionStatus.Connected ||
    status === ShopifyConnectionStatus.Error ||
    status === ShopifyConnectionStatus.ReauthRequired
  );
}
