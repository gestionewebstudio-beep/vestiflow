import type { User } from '@core/models/user.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import {
  canSyncCatalogFromShopify,
  canSyncInventoryFromShopify,
  canSyncShopifyOperationalData,
} from '@core/permissions/tenant-permissions.util';

/** @deprecated Usare canSyncCatalogFromShopify, canSyncInventoryFromShopify o canSyncShopifyOperationalData. */
export function canManageShopifySync(user: User | null | undefined): boolean {
  return canSyncCatalogFromShopify(user);
}

export function canSyncShopifyCatalog(user: User | null | undefined): boolean {
  return canSyncCatalogFromShopify(user);
}

export function canSyncShopifyInventory(user: User | null | undefined): boolean {
  return canSyncInventoryFromShopify(user);
}

export function canSyncShopifyCustomersOrOrders(user: User | null | undefined): boolean {
  return canSyncShopifyOperationalData(user);
}

export function isShopifyConnected(connection: ShopifyConnection | null | undefined): boolean {
  return connection?.status === ShopifyConnectionStatus.Connected;
}
