import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable, timeout } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';

import { shopifyConnectionFromDto } from '../models/shopify-connection.mapper';
import type { ShopifyConnectionDto } from '../models/shopify-connection.dto';

const HTTP_TIMEOUT_MS = 15000;

/**
 * Stato connessione Shopify (read-only) + avvio OAuth lato server.
 * Nessun token nel browser: solo URL di autorizzazione e metadati pubblici.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyConnectionService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

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
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  syncLocations(): Observable<{ synced: true }> {
    return this.http
      .post<{ synced: true }>(`${this.config.apiBaseUrl}/shopify/sync/locations`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }

  syncWebhooks(): Observable<{ synced: true }> {
    return this.http
      .post<{ synced: true }>(`${this.config.apiBaseUrl}/shopify/sync/webhooks`, {})
      .pipe(timeout(HTTP_TIMEOUT_MS));
  }
}
