import { inject, Injectable } from '@angular/core';
import { map, type Observable, tap, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { ApiHttpClient } from '@core/http/api-http.client';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';

import { shopifyConnectionFromDto } from '../models/shopify-connection.mapper';
import type { ShopifyConnectionDto } from '../models/shopify-connection.dto';
import type {
  ShopifyClearErrorsDto,
  ShopifyDisableWebhooksDto,
  ShopifySyncCustomersDto,
  ShopifySyncInventoryDto,
  ShopifySyncLocationsDto,
  ShopifySyncOrdersDto,
  ShopifySyncProductsDto,
  ShopifySyncWebhooksDto,
} from '../models/shopify-sync.dto';
import type {
  PurgeShopifyDataRequestDto,
  ShopifyShopChangePreviewDto,
  ShopifyShopChangePurgeResultDto,
} from '../models/shopify-shop-change.dto';
import { ShopifyConnectionRefreshService } from './shopify-connection-refresh.service';

const HTTP_TIMEOUT_MS = 15000;
/** Import catalogo può richiedere più chiamate Shopify per ogni prodotto. */
const SYNC_PRODUCTS_TIMEOUT_MS = 180_000;
/** Import giacenze: batch per location e varianti collegate. */
const SYNC_INVENTORY_TIMEOUT_MS = 180_000;
/** Import clienti/ordini: paginazione REST su tutto lo storico. */
const SYNC_CUSTOMERS_ORDERS_TIMEOUT_MS = 180_000;

/**
 * Stato connessione Shopify (read-only) + avvio OAuth lato server.
 * Nessun token nel browser: solo URL di autorizzazione e metadati pubblici.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyConnectionService {
  private readonly http = inject(ApiHttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly connectionRefresh = inject(ShopifyConnectionRefreshService);

  getConnection(): Observable<ShopifyConnection> {
    return this.http
      .get<ShopifyConnectionDto>(`${this.config.apiBaseUrl}/shopify/connection`)
      .pipe(timeout(HTTP_TIMEOUT_MS), map(shopifyConnectionFromDto));
  }

  beginAuth(shop: string): Observable<{ authorizeUrl: string }> {
    return this.http
      .post<{ authorizeUrl: string }>(`${this.config.apiBaseUrl}/shopify/auth/begin`, { shop })
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  disconnect(): Observable<{ disconnected: true }> {
    return this.http
      .delete<{ disconnected: true }>(`${this.config.apiBaseUrl}/shopify/connection`)
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }

  syncLocations(): Observable<ShopifySyncLocationsDto> {
    return this.http
      .post<ShopifySyncLocationsDto>(`${this.config.apiBaseUrl}/shopify/sync/locations`, {})
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }

  syncWebhooks(): Observable<ShopifySyncWebhooksDto> {
    return this.http
      .post<ShopifySyncWebhooksDto>(`${this.config.apiBaseUrl}/shopify/sync/webhooks`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  disableWebhooks(): Observable<ShopifyDisableWebhooksDto> {
    return this.http
      .post<ShopifyDisableWebhooksDto>(
        `${this.config.apiBaseUrl}/shopify/sync/webhooks/disable`,
        {},
      )
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  syncProducts(): Observable<ShopifySyncProductsDto> {
    return this.http
      .post<ShopifySyncProductsDto>(`${this.config.apiBaseUrl}/shopify/sync/products`, {})
      .pipe(timeout(SYNC_PRODUCTS_TIMEOUT_MS));
  }

  syncInventory(): Observable<ShopifySyncInventoryDto> {
    return this.http
      .post<ShopifySyncInventoryDto>(`${this.config.apiBaseUrl}/shopify/sync/inventory`, {})
      .pipe(timeout(SYNC_INVENTORY_TIMEOUT_MS));
  }

  syncCustomers(): Observable<ShopifySyncCustomersDto> {
    return this.http
      .post<ShopifySyncCustomersDto>(`${this.config.apiBaseUrl}/shopify/sync/customers`, {})
      .pipe(timeout(SYNC_CUSTOMERS_ORDERS_TIMEOUT_MS));
  }

  syncOrders(): Observable<ShopifySyncOrdersDto> {
    return this.http
      .post<ShopifySyncOrdersDto>(`${this.config.apiBaseUrl}/shopify/sync/orders`, {})
      .pipe(timeout(SYNC_CUSTOMERS_ORDERS_TIMEOUT_MS));
  }

  clearErrors(): Observable<ShopifyClearErrorsDto> {
    return this.http
      .post<ShopifyClearErrorsDto>(`${this.config.apiBaseUrl}/shopify/connection/clear-errors`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  previewShopChange(): Observable<ShopifyShopChangePreviewDto> {
    return this.http
      .get<ShopifyShopChangePreviewDto>(`${this.config.apiBaseUrl}/shopify/shop-change/preview`)
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  purgeShopifyData(body: PurgeShopifyDataRequestDto): Observable<ShopifyShopChangePurgeResultDto> {
    return this.http
      .post<ShopifyShopChangePurgeResultDto>(
        `${this.config.apiBaseUrl}/shopify/shop-change/purge`,
        body,
      )
      .pipe(
        timeout(SYNC_PRODUCTS_TIMEOUT_MS),
        tap(() => this.connectionRefresh.notifyInvalidated()),
      );
  }
}
