import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { EMPTY, fromEvent, merge, type Observable, timer } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, share, skip, switchMap } from 'rxjs';

import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

import { ShopifyConnectionRefreshService } from './shopify-connection-refresh.service';
import { ShopifyConnectionService } from './shopify-connection.service';

/** Intervallo polling lastSyncAt quando Shopify e connesso. */
const POLL_INTERVAL_MS = 15_000;

function isConnectionPollable(status: ShopifyConnectionStatus | undefined): boolean {
  return (
    status === ShopifyConnectionStatus.Connected ||
    status === ShopifyConnectionStatus.Error ||
    status === ShopifyConnectionStatus.ReauthRequired
  );
}

/**
 * Osserva i sync Shopify completati (webhook o manuali) confrontando `lastSyncAt`.
 * Usato dalle liste catalogo per aggiornarsi senza refresh manuale.
 */
@Injectable({ providedIn: 'root' })
export class ShopifySyncWatchService {
  private readonly connectionService = inject(ShopifyConnectionService);
  private readonly connectionRefresh = inject(ShopifyConnectionRefreshService);
  private readonly document = inject(DOCUMENT);

  private readonly lastSyncAt$ = merge(
    timer(0, POLL_INTERVAL_MS),
    fromEvent(this.document, 'visibilitychange'),
  ).pipe(
    filter(() => this.document.visibilityState === 'visible'),
    switchMap(() => this.connectionService.getConnection().pipe(catchError(() => EMPTY))),
    filter((connection) => isConnectionPollable(connection.status)),
    map((connection) => connection.lastSyncAt ?? ''),
    distinctUntilChanged(),
    share(),
  );

  /**
   * Stream di `lastSyncAt` quando la connessione Shopify e attiva (sync manuale o automatica).
   * Utile per liste clienti, vendite e giacenze.
   */
  watchConnectionPoll(): Observable<string> {
    return this.lastSyncAt$;
  }

  /** Emite quando Shopify ha sincronizzato dati (baseline iniziale ignorata). */
  watchSyncCompleted(): Observable<void> {
    return this.lastSyncAt$.pipe(
      skip(1),
      filter((lastSyncAt) => lastSyncAt.length > 0),
      map(() => void 0),
    );
  }

  /** Emite dopo disconnect, purge, sync location o altre operazioni che invalidano stato connessione/dati. */
  watchConnectionInvalidated(): Observable<void> {
    return this.connectionRefresh.watchInvalidated();
  }

  /** Sync completato o stato Shopify cambiato (disconnect/purge/connect). */
  watchRemoteDataChanged(): Observable<void> {
    return merge(this.watchSyncCompleted(), this.watchConnectionInvalidated());
  }
}
