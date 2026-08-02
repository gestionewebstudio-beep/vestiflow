import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import type { AppError } from '@core/models/app-error.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { canManageShopifyConnection } from '@core/permissions/tenant-permissions.util';
import { showShopifyIntegration } from '@core/models/tenant-channel-profile.model';

import { ShopifyConnectionService } from '../services/shopify-connection.service';

type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly connection: ShopifyConnection }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Stato della connessione Shopify del tenant corrente.
 *
 * Esiste perché due parti della schermata Impostazioni ne hanno bisogno e non
 * possono divergere: il pannello Shopify la mostra e la modifica, la sezione
 * Location la usa per decidere quali sedi mostrare e se esporre la colonna
 * Shopify. Tenendola in un solo posto, un `reload()` dopo una sync aggiorna
 * entrambe, e la connessione viene chiesta al server una volta sola.
 *
 * `available` è il cancello: senza Shopify nel profilo del tenant, o senza il
 * permesso di gestirlo, non si chiama l'API. È lo stesso criterio che decide se
 * il pannello va montato.
 */
@Injectable({ providedIn: 'root' })
export class ShopifyConnectionStore {
  private readonly connectionService = inject(ShopifyConnectionService);
  private readonly authService = inject(AuthService);

  private readonly tick = signal(0);

  /** Il tenant ha Shopify nel profilo e l'utente può gestirlo. */
  readonly available = computed(() => {
    const user = this.authService.currentUser();
    return showShopifyIntegration(user?.tenantChannelProfile) && canManageShopifyConnection(user);
  });

  private readonly state = toSignal(
    combineLatest([toObservable(this.tick), toObservable(this.available)]).pipe(
      switchMap(([, available]) => {
        if (!available) {
          return of({ status: 'not-found' } satisfies ConnectionState);
        }
        return this.connectionService.getConnection().pipe(
          map((connection): ConnectionState => ({ status: 'success', connection })),
          startWith<ConnectionState>({ status: 'loading' }),
          catchError((err: unknown) => of(toErrorState(err))),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies ConnectionState },
  );

  readonly loading = computed(() => this.state().status === 'loading');

  readonly notFound = computed(() => this.state().status === 'not-found');

  readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  /** Connessione attiva o in errore/reauth — esclude not_connected, dove si mostra il form. */
  readonly connection = computed(() => {
    const current = this.state();
    if (current.status !== 'success') {
      return null;
    }
    if (current.connection.status === ShopifyConnectionStatus.NotConnected) {
      return null;
    }
    return current.connection;
  });

  readonly status = computed((): ShopifyConnectionStatus => {
    const current = this.state();
    return current.status === 'success'
      ? current.connection.status
      : ShopifyConnectionStatus.NotConnected;
  });

  readonly connected = computed(() => this.status() === ShopifyConnectionStatus.Connected);

  /** Va mostrato il form OAuth: nessun record, oppure disconnesso di recente. */
  readonly connectable = computed(() => {
    const current = this.state();
    if (current.status === 'not-found') {
      return true;
    }
    return (
      current.status === 'success' &&
      current.connection.status === ShopifyConnectionStatus.NotConnected
    );
  });

  /** Rilegge la connessione dal server. Chi la osserva si aggiorna da sé. */
  reload(): void {
    this.tick.update((tick) => tick + 1);
  }
}

function toErrorState(err: unknown): ConnectionState {
  const appError = isAppError(err)
    ? err
    : ({ kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' } satisfies AppError);
  return appError.kind === AppErrorKind.NotFound
    ? { status: 'not-found' }
    : { status: 'error', error: appError };
}
