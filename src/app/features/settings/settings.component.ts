import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { UserRole } from '@core/models/user.model';
import { ThemeService } from '@core/services/theme.service';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import type { ThemeMode } from '@shared/models/theme.model';

import {
  shopifyConnectionStatusLabel,
  shopifyConnectionStatusTone,
} from '@features/integrations/shopify/models/shopify-connection-labels.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { InventoryService } from '@features/inventory/services/inventory.service';

import { LocationTableComponent } from './components/location-table/location-table.component';

type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly connection: ShopifyConnection }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.Owner]: 'Titolare',
  [UserRole.Admin]: 'Amministratore',
  [UserRole.Manager]: 'Manager',
  [UserRole.Clerk]: 'Commesso/a',
};

const THEME_OPTIONS: readonly { readonly value: ThemeMode; readonly label: string }[] = [
  { value: 'light', label: 'Chiaro' },
  { value: 'dark', label: 'Scuro' },
  { value: 'system', label: 'Sistema' },
];

/**
 * Impostazioni (smart): stato connessione Shopify (read-only), preferenza
 * tema, profilo utente corrente e location del tenant. La gestione della
 * connessione (OAuth/connect/disconnect) vivra' nel backend.
 */
@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, ErrorStateComponent, TableSkeletonComponent, LocationTableComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly inventoryService = inject(InventoryService);
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);

  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly themeMode = this.themeService.mode;
  protected readonly currentUser = this.authService.currentUser;

  protected readonly connectionStatusLabel = shopifyConnectionStatusLabel;
  protected readonly connectionStatusTone = shopifyConnectionStatusTone;
  protected readonly formatDateTime = formatDateTime;

  private readonly connectionTick = signal(0);

  private readonly connectionState = toSignal(
    toObservable(this.connectionTick).pipe(
      switchMap(() =>
        this.shopifyConnectionService.getConnection().pipe(
          map((connection): ConnectionState => ({ status: 'success', connection })),
          startWith<ConnectionState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.connectionErrorToState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies ConnectionState },
  );

  protected readonly connectionLoading = computed(
    () => this.connectionState().status === 'loading',
  );

  protected readonly connectionNotFound = computed(
    () => this.connectionState().status === 'not-found',
  );

  protected readonly connectionError = computed(() => {
    const current = this.connectionState();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly connection = computed(() => {
    const current = this.connectionState();
    return current.status === 'success' ? current.connection : null;
  });

  protected readonly locations = toSignal(this.inventoryService.getLocations(), {
    initialValue: [],
  });

  protected readonly roleLabel = computed(() => {
    const user = this.currentUser();
    return user ? ROLE_LABELS[user.role] : '—';
  });

  protected onThemeChange(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }

  protected reloadConnection(): void {
    this.connectionTick.update((tick) => tick + 1);
  }

  private connectionErrorToState(err: unknown): ConnectionState {
    const appError = isAppError(err)
      ? err
      : ({ kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' } satisfies AppError);
    if (appError.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    return { status: 'error', error: appError };
  }
}
