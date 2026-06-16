import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { UserRole } from '@core/models/user.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ThemeService } from '@core/services/theme.service';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
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
import { MfaSettingsComponent } from './components/mfa-settings/mfa-settings.component';

type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly connection: ShopifyConnection }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

type ShopifyBanner = 'connected' | 'error' | 'disconnected';

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
 * Impostazioni (smart): connessione Shopify (OAuth lato server), preferenza
 * tema, profilo utente corrente e location del tenant.
 */
@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BadgeComponent,
    ButtonComponent,
    ErrorStateComponent,
    ReactiveFormsModule,
    TableSkeletonComponent,
    LocationTableComponent,
    MfaSettingsComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly inventoryService = inject(InventoryService);
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appConfig = inject(APP_CONFIG);

  protected readonly themeOptions = THEME_OPTIONS;
  protected readonly themeMode = this.themeService.mode;
  protected readonly currentUser = this.authService.currentUser;
  protected readonly mfaAvailable = Boolean(this.appConfig.supabase?.anonKey);

  protected readonly connectionStatusLabel = shopifyConnectionStatusLabel;
  protected readonly connectionStatusTone = shopifyConnectionStatusTone;
  protected readonly formatDateTime = formatDateTime;

  protected readonly connectLoading = signal(false);
  protected readonly disconnectLoading = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly shopifyBanner = signal<ShopifyBanner | null>(null);

  protected readonly connectForm = this.fb.group({
    shop: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(255)],
    }),
  });

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

  protected readonly canManageShopify = computed(() => {
    const user = this.currentUser();
    return user?.role === UserRole.Owner || user?.role === UserRole.Admin;
  });

  protected readonly canManageMfa = computed(() => {
    const user = this.currentUser();
    if (!user) {
      return false;
    }
    return user.role === UserRole.Owner || user.role === UserRole.Admin || user.isPlatformAdmin;
  });

  protected readonly locations = toSignal(this.inventoryService.getLocations(), {
    initialValue: [],
  });

  protected readonly roleLabel = computed(() => {
    const user = this.currentUser();
    return user ? ROLE_LABELS[user.role] : '—';
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const shopifyParam = params.get('shopify');
      if (
        shopifyParam === 'connected' ||
        shopifyParam === 'error' ||
        shopifyParam === 'disconnected'
      ) {
        this.shopifyBanner.set(shopifyParam);
        if (shopifyParam === 'connected') {
          this.reloadConnection();
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { shopify: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }

  protected onThemeChange(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }

  protected reloadConnection(): void {
    this.connectionTick.update((tick) => tick + 1);
  }

  protected connectShopify(): void {
    if (this.connectForm.invalid || this.connectLoading()) {
      this.connectForm.markAllAsTouched();
      return;
    }

    this.connectError.set(null);
    this.connectLoading.set(true);

    this.shopifyConnectionService
      .beginAuth(this.connectForm.controls.shop.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ authorizeUrl }) => {
          window.location.assign(authorizeUrl);
        },
        error: (err: unknown) => {
          this.connectLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected disconnectShopify(): void {
    if (this.disconnectLoading()) {
      return;
    }

    this.disconnectLoading.set(true);
    this.connectError.set(null);

    this.shopifyConnectionService
      .disconnect()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.disconnectLoading.set(false);
          this.shopifyBanner.set('disconnected');
          this.reloadConnection();
        },
        error: (err: unknown) => {
          this.disconnectLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected dismissBanner(): void {
    this.shopifyBanner.set(null);
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

  private extractErrorMessage(err: unknown): string {
    if (isAppError(err)) {
      return err.message;
    }
    return 'Operazione non riuscita. Riprova.';
  }
}
