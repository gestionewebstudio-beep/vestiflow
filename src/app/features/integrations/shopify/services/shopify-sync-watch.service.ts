import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { EMPTY, fromEvent, merge, type Observable, timer } from 'rxjs';
import { catchError, distinctUntilChanged, filter, map, share, skip, switchMap } from 'rxjs';

import { ShopifyConnectionService } from './shopify-connection.service';

/** Intervallo polling lastSyncAt quando auto-sync Shopify è attivo. */
const POLL_INTERVAL_MS = 15_000;

/**
 * Osserva i sync Shopify completati (webhook o manuali) confrontando `lastSyncAt`.
 * Usato dalle liste catalogo per aggiornarsi senza refresh manuale.
 */
@Injectable({ providedIn: 'root' })
export class ShopifySyncWatchService {
  private readonly connectionService = inject(ShopifyConnectionService);
  private readonly document = inject(DOCUMENT);

  private readonly lastSyncAt$ = merge(
    timer(0, POLL_INTERVAL_MS),
    fromEvent(this.document, 'visibilitychange'),
  ).pipe(
    filter(() => this.document.visibilityState === 'visible'),
    switchMap(() => this.connectionService.getConnection().pipe(catchError(() => EMPTY))),
    filter((connection) => connection.autoSyncEnabled === true),
    map((connection) => connection.lastSyncAt ?? ''),
    distinctUntilChanged(),
    share(),
  );

  /** Emite quando Shopify ha sincronizzato dati (baseline iniziale ignorata). */
  watchSyncCompleted(): Observable<void> {
    return this.lastSyncAt$.pipe(
      skip(1),
      filter((lastSyncAt) => lastSyncAt.length > 0),
      map(() => void 0),
    );
  }
}
