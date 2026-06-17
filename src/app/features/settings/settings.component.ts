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
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { UserRole } from '@core/models/user.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import type { IsoDateString } from '@core/models/common.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ThemeService } from '@core/services/theme.service';
import { formatDateTime } from '@core/utils/date.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineSpinnerComponent } from '@shared/components/inline-spinner/inline-spinner.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import type { ThemeMode } from '@shared/models/theme.model';

import {
  shopifyProductReadScopeWarning,
  shopifyScopeDiagnosticsDetail,
} from '@features/integrations/shopify/models/shopify-scope-capabilities.util';
import {
  shopifyConnectionStatusLabel,
  shopifyConnectionStatusTone,
} from '@features/integrations/shopify/models/shopify-connection-labels.util';
import {
  shopifyScopeAccessLabel,
  shopifyScopeDisplay,
} from '@features/integrations/shopify/models/shopify-scope-labels.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { normalizeShopDomainInput } from '@features/integrations/shopify/models/normalize-shop-domain.util';
import type {
  ShopifyClearErrorsDto,
  ShopifyDisableWebhooksDto,
  ShopifySyncLocationsDto,
  ShopifySyncProductsDto,
  ShopifySyncWebhooksDto,
} from '@features/integrations/shopify/models/shopify-sync.dto';
import { InventoryService } from '@features/inventory/services/inventory.service';

import { LocationTableComponent } from './components/location-table/location-table.component';
import { MfaSettingsComponent } from './components/mfa-settings/mfa-settings.component';

type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly connection: ShopifyConnection }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

type ShopifyBanner = 'connected' | 'connected-warn' | 'error' | 'disconnected';

interface ActionFeedback {
  readonly message: string;
  readonly tone: 'success' | 'warning';
}

interface SetupStatusItem {
  readonly active: boolean;
  readonly partial?: boolean;
  readonly label: string;
  readonly detail: string;
}

const ACTION_SUCCESS_DISMISS_MS = 8000;

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
    InlineSpinnerComponent,
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
  protected readonly shopifyScopeDisplay = shopifyScopeDisplay;
  protected readonly shopifyScopeAccessLabel = shopifyScopeAccessLabel;
  protected readonly formatDateTime = formatDateTime;

  protected readonly connectLoading = signal(false);
  protected readonly disconnectLoading = signal(false);
  protected readonly syncLocationsLoading = signal(false);
  protected readonly syncWebhooksLoading = signal(false);
  protected readonly syncProductsLoading = signal(false);
  protected readonly clearErrorsLoading = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly actionFeedback = signal<ActionFeedback | null>(null);
  protected readonly shopifyBanner = signal<ShopifyBanner | null>(null);

  private actionFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly connectForm = this.fb.group({
    shop: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(255)],
    }),
  });

  private readonly connectionTick = signal(0);
  private readonly locationTick = signal(0);

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

  protected readonly locations = toSignal(
    toObservable(this.locationTick).pipe(switchMap(() => this.inventoryService.getLocations())),
    { initialValue: [] },
  );

  protected readonly locationSetupStatus = computed((): SetupStatusItem => {
    const synced = this.locations().filter(
      (location) => location.shopify?.status === ShopifySyncStatus.Synced,
    );
    if (synced.length === 0) {
      return {
        active: false,
        label: 'Location non collegate',
        detail:
          'Premi «Sincronizza location» per importare le sedi da Shopify e collegarle a VestiFlow.',
      };
    }

    const lastSyncedAt = synced.reduce<IsoDateString | undefined>((latest, location) => {
      const at = location.shopify?.lastSyncedAt;
      if (!at) {
        return latest;
      }
      return !latest || at > latest ? at : latest;
    }, undefined);

    const countLabel =
      synced.length === 1
        ? '1 location collegata a Shopify'
        : `${synced.length} location collegate a Shopify`;
    const timeLabel = lastSyncedAt ? ` · ${this.formatDateTime(lastSyncedAt)}` : '';

    return {
      active: true,
      label: 'Location collegate',
      detail: `${countLabel}${timeLabel}`,
    };
  });

  protected readonly webhooksSetupStatus = computed((): SetupStatusItem => {
    const conn = this.connection();
    if (!conn?.autoSyncEnabled) {
      return {
        active: false,
        label: 'Aggiornamenti automatici non attivi',
        detail:
          'Premi «Attiva aggiornamenti automatici» per ricevere ordini, clienti, prodotti e giacenze da Shopify.',
      };
    }

    const partial = conn.lastError?.code === 'webhook_partial_registration';
    const countLabel =
      conn.webhooksActiveCount === 1
        ? '1 canale attivo'
        : `${conn.webhooksActiveCount ?? 0} canali attivi`;
    const activatedAt = conn.webhooksActivatedAt
      ? ` · ${this.formatDateTime(conn.webhooksActivatedAt)}`
      : '';

    return {
      active: true,
      partial,
      label: partial ? 'Aggiornamenti automatici parziali' : 'Aggiornamenti automatici attivi',
      detail: `${countLabel}${activatedAt}`,
    };
  });

  protected readonly autoSyncEnabled = computed(() => this.connection()?.autoSyncEnabled === true);

  protected readonly autoSyncButtonLabel = computed(() =>
    this.autoSyncEnabled()
      ? 'Disattiva aggiornamenti automatici'
      : 'Attiva aggiornamenti automatici',
  );

  /** Messaggio visibile mentre un'azione Shopify è in corso. */
  protected readonly shopifyActionProgress = computed((): string | null => {
    if (this.connectLoading()) {
      return 'Reindirizzamento a Shopify…';
    }
    if (this.disconnectLoading()) {
      return 'Disconnessione Shopify in corso…';
    }
    if (this.syncLocationsLoading()) {
      return 'Sincronizzazione location in corso…';
    }
    if (this.syncWebhooksLoading()) {
      return this.autoSyncEnabled()
        ? 'Disattivazione aggiornamenti automatici…'
        : 'Attivazione aggiornamenti automatici…';
    }
    if (this.syncProductsLoading()) {
      return 'Import catalogo da Shopify in corso…';
    }
    if (this.clearErrorsLoading()) {
      return 'Ripristino connessione in corso…';
    }
    return null;
  });

  protected readonly showClearShopifyErrors = computed(() => {
    const conn = this.connection();
    if (!conn) {
      return false;
    }
    return conn.status === ShopifyConnectionStatus.Error || Boolean(conn.lastError);
  });

  protected readonly catalogReadScopeWarning = computed(() =>
    shopifyProductReadScopeWarning(this.connection()?.scopeDiagnostics),
  );

  protected readonly catalogScopeDiagnosticsDetail = computed(() =>
    shopifyScopeDiagnosticsDetail(this.connection()?.scopeDiagnostics),
  );

  protected readonly roleLabel = computed(() => {
    const user = this.currentUser();
    return user ? ROLE_LABELS[user.role] : '—';
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.actionFeedbackTimer) {
        clearTimeout(this.actionFeedbackTimer);
      }
    });

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const shopifyParam = params.get('shopify');
      if (
        shopifyParam === 'connected' ||
        shopifyParam === 'error' ||
        shopifyParam === 'disconnected'
      ) {
        this.handleShopifyOAuthReturn(shopifyParam);
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

  protected reloadLocations(): void {
    this.inventoryService.invalidateLocationsCache();
    this.locationTick.update((tick) => tick + 1);
  }

  private handleShopifyOAuthReturn(param: Exclude<ShopifyBanner, 'connected-warn'>): void {
    this.reloadConnection();

    if (param === 'connected' || param === 'error') {
      this.shopifyConnectionService
        .syncLocations()
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.reloadLocations(),
          error: () => this.reloadLocations(),
        });
    } else {
      this.reloadLocations();
    }

    if (param === 'connected') {
      this.shopifyConnectionService
        .getConnection()
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (connection) => {
            this.shopifyBanner.set(connection.lastError ? 'connected-warn' : 'connected');
          },
          error: () => {
            this.shopifyBanner.set('connected');
          },
        });
      return;
    }

    if (param === 'disconnected') {
      this.shopifyBanner.set('disconnected');
      return;
    }

    // OAuth callback con ?shopify=error: verifica se la connessione e' comunque attiva.
    this.shopifyConnectionService
      .getConnection()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (connection) => {
          if (connection.status === ShopifyConnectionStatus.Connected) {
            this.shopifyBanner.set(connection.lastError ? 'connected-warn' : 'connected');
          } else {
            this.shopifyBanner.set('error');
          }
        },
        error: () => {
          this.shopifyBanner.set('error');
        },
      });
  }

  protected connectShopify(): void {
    if (this.connectForm.invalid || this.connectLoading()) {
      this.connectForm.markAllAsTouched();
      return;
    }

    this.connectError.set(null);
    this.connectLoading.set(true);

    this.shopifyConnectionService
      .beginAuth(normalizeShopDomainInput(this.connectForm.controls.shop.value))
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
          this.reloadLocations();
        },
        error: (err: unknown) => {
          this.disconnectLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected syncShopifyLocations(): void {
    if (this.syncLocationsLoading()) {
      return;
    }

    this.syncLocationsLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncLocationsLoading.set(false);
          this.reloadLocations();
          this.showActionFeedback({
            tone: 'success',
            message: this.formatLocationSyncFeedback(result),
          });
        },
        error: (err: unknown) => {
          this.syncLocationsLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected toggleAutoSync(): void {
    if (this.autoSyncEnabled()) {
      this.disableAutoSync();
      return;
    }
    this.enableAutoSync();
  }

  protected enableAutoSync(): void {
    if (this.syncWebhooksLoading()) {
      return;
    }

    this.syncWebhooksLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncWebhooks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncWebhooksLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(this.formatWebhooksFeedback(result));
        },
        error: (err: unknown) => {
          this.syncWebhooksLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected disableAutoSync(): void {
    if (this.syncWebhooksLoading()) {
      return;
    }

    this.syncWebhooksLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .disableWebhooks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncWebhooksLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(this.formatDisableWebhooksFeedback(result));
        },
        error: (err: unknown) => {
          this.syncWebhooksLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected syncShopifyProducts(): void {
    if (this.syncProductsLoading()) {
      return;
    }

    this.syncProductsLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncProducts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncProductsLoading.set(false);
          this.showActionFeedback(this.formatProductsFeedback(result));
        },
        error: (err: unknown) => {
          this.syncProductsLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected clearShopifyErrors(): void {
    if (this.clearErrorsLoading()) {
      return;
    }

    this.clearErrorsLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .clearErrors()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.clearErrorsLoading.set(false);
          this.reloadConnection();
          this.reloadLocations();
          this.showActionFeedback(this.formatClearErrorsFeedback(result));
        },
        error: (err: unknown) => {
          this.clearErrorsLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected dismissActionFeedback(): void {
    this.clearActionFeedback();
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

  private showActionFeedback(feedback: ActionFeedback): void {
    this.clearActionFeedback();
    this.actionFeedback.set(feedback);
    this.actionFeedbackTimer = setTimeout(() => {
      this.actionFeedback.set(null);
      this.actionFeedbackTimer = null;
    }, ACTION_SUCCESS_DISMISS_MS);
  }

  private clearActionFeedback(): void {
    if (this.actionFeedbackTimer) {
      clearTimeout(this.actionFeedbackTimer);
      this.actionFeedbackTimer = null;
    }
    this.actionFeedback.set(null);
  }

  private formatLocationSyncFeedback(result: ShopifySyncLocationsDto): string {
    if (result.totalCount === 0) {
      return 'Sync completata: nessuna location trovata su Shopify.';
    }

    const parts: string[] = [];

    if (result.importedCount > 0) {
      parts.push(
        result.importedCount === 1
          ? '1 location importata da Shopify'
          : `${result.importedCount} location importate da Shopify`,
      );
    }

    if (result.matchedCount > 0) {
      parts.push(
        result.matchedCount === 1
          ? '1 location collegata'
          : `${result.matchedCount} location collegate`,
      );
    }

    if (parts.length === 0) {
      return 'Sync completata: nessuna modifica alle location.';
    }

    return `${parts.join(', ')} (${result.totalCount} sedi su Shopify).`;
  }

  private formatProductsFeedback(result: ShopifySyncProductsDto): ActionFeedback {
    const failedCount = result.failed.length;
    const changedCount = result.imported + result.updated;

    if (failedCount > 0) {
      const firstError = result.failed[0]?.message;
      const errorHint = firstError ? ` Dettaglio: ${firstError}.` : '';
      return {
        tone: 'warning',
        message: `Catalogo importato con ${failedCount} errori: ${result.imported} nuovi, ${result.updated} aggiornati.${errorHint}`,
      };
    }

    if (result.remoteProductCount > 0 && changedCount === 0) {
      return {
        tone: 'warning',
        message: `Shopify ha ${result.remoteProductCount} prodotti ma nessuna modifica in VestiFlow. Controlla i filtri in lista prodotti o i log di sync.`,
      };
    }

    if (result.remoteProductCount === 0) {
      return {
        tone: 'warning',
        message:
          'Nessun prodotto trovato su Shopify. Verifica che il prodotto sia salvato nello store collegato.',
      };
    }

    return {
      tone: 'success',
      message: `Catalogo sincronizzato da Shopify: ${result.imported} nuovi, ${result.updated} aggiornati (${result.remoteProductCount} su Shopify).`,
    };
  }

  private formatClearErrorsFeedback(result: ShopifyClearErrorsDto): ActionFeedback {
    const parts: string[] = ['Connessione Shopify ripristinata'];

    if (result.productsReset > 0) {
      parts.push(
        result.productsReset === 1
          ? '1 prodotto ripristinato'
          : `${result.productsReset} prodotti ripristinati`,
      );
    }

    if (result.locationsReset > 0) {
      parts.push(
        result.locationsReset === 1
          ? '1 location ripristinata'
          : `${result.locationsReset} location ripristinate`,
      );
    }

    return {
      tone: 'success',
      message: `${parts.join('. ')}.`,
    };
  }

  private formatDisableWebhooksFeedback(result: ShopifyDisableWebhooksDto): ActionFeedback {
    if (result.failed.length > 0) {
      return {
        tone: 'warning',
        message:
          'Aggiornamenti automatici disattivati in VestiFlow. Alcuni webhook potrebbero restare su Shopify: riprova se necessario.',
      };
    }

    return {
      tone: 'success',
      message:
        result.deletedCount === 1
          ? 'Aggiornamenti automatici disattivati.'
          : `Aggiornamenti automatici disattivati (${result.deletedCount} canali rimossi).`,
    };
  }

  private formatWebhooksFeedback(result: ShopifySyncWebhooksDto): ActionFeedback {
    const activeCount = result.registered.length + result.skipped.length;

    if (result.failed.length === 0) {
      return {
        tone: 'success',
        message:
          activeCount === 1
            ? 'Aggiornamenti automatici attivi su Shopify.'
            : `Aggiornamenti automatici attivi (${activeCount} canali).`,
      };
    }

    const failedTopics = result.failed.map((entry) => entry.topic).join(', ');
    if (activeCount > 0) {
      return {
        tone: 'warning',
        message: `Aggiornamenti parzialmente attivi: ${activeCount} canali ok. Non attivi: ${failedTopics}.`,
      };
    }

    return {
      tone: 'warning',
      message: `Aggiornamenti automatici non attivati per: ${failedTopics}.`,
    };
  }
}
