import type { User } from '@core/models/user.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { canManageShopifyConnection } from '@core/permissions/tenant-permissions.util';

/** Sync bulk da Shopify (liste e impostazioni): titolare e admin. */
export function canManageShopifySync(user: User | null | undefined): boolean {
  return canManageShopifyConnection(user);
}

export function isShopifyConnected(connection: ShopifyConnection | null | undefined): boolean {
  return connection?.status === ShopifyConnectionStatus.Connected;
}
