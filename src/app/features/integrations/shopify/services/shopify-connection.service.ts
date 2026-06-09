import { Injectable } from '@angular/core';
import { type Observable, delay, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';

import { MOCK_SHOPIFY_CONNECTIONS } from './shopify-connection.mock-data';

const CONNECTION_LATENCY_MS = 350;

// Tenant corrente mock: in produzione e' derivato lato backend dal token.
const MOCK_TENANT_ID: EntityId = 'tenant-demo';

/**
 * Accesso in SOLA LETTURA allo stato della connessione Shopify del tenant
 * (livello integrazione/account, distinto dal sync per-risorsa di ShopifyLink).
 * Nessuna mutazione: niente connect/reconnect/disconnect, nessun OAuth flow.
 * Implementazione mock (in memoria) con latenza simulata, coerente con gli altri
 * service. Ritorna un modello di dominio: sostituibile con un client HTTP
 * (NestJS/Railway) senza cambiare l'API pubblica.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyConnectionService {
  private readonly connections: readonly ShopifyConnection[] = [...MOCK_SHOPIFY_CONNECTIONS];

  /** Connessione Shopify del tenant corrente; AppError NotFound se assente. */
  getConnection(): Observable<ShopifyConnection> {
    const connection = this.connections.find((candidate) => candidate.tenantId === MOCK_TENANT_ID);
    if (!connection) {
      return of(null).pipe(
        delay(CONNECTION_LATENCY_MS),
        switchMap(() => throwError(() => this.notFoundError())),
      );
    }
    return of(connection).pipe(delay(CONNECTION_LATENCY_MS));
  }

  private notFoundError(): AppError {
    return {
      kind: AppErrorKind.NotFound,
      message: 'Connessione Shopify non trovata.',
      status: 404,
    };
  }
}
