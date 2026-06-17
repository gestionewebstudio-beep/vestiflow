import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

export function canManageShopifySync(user: User | null | undefined): boolean {
  return user?.role === UserRole.Owner || user?.role === UserRole.Admin;
}

export function isShopifyConnected(connection: ShopifyConnection | null | undefined): boolean {
  return connection?.status === ShopifyConnectionStatus.Connected;
}
