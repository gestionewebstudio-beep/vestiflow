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
import { catchError, combineLatest, filter, map, of, startWith, switchMap, take } from 'rxjs';

import { AuthService } from '@core/auth';
import { isPlatformOperator } from '@core/permissions/platform-operator.util';
import { hasFullTenantAccess } from '@core/permissions/user-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import {
  canManageMfa as userCanManageMfa,
  canManageShopifyConnection,
  canManageTikTokConnection,
} from '@core/permissions/tenant-permissions.util';
import { resolveUserAccessLabel } from '@core/models/user-role-labels.util';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import type { IsoDateString } from '@core/models/common.model';
import type { Location } from '@core/models/location.model';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ThemeService } from '@core/services/theme.service';
import { formatDateTime } from '@core/utils/date.util';
import {
  filterLocationsForSettings,
  isShopifyManagedLocation,
} from '@core/utils/location-selection.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { ProfileAvatarUploadComponent } from '@shared/components/profile-avatar-upload/profile-avatar-upload.component';
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
  groupShopifyScopesForDisplay,
} from '@features/integrations/shopify/models/shopify-scope-labels.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@features/integrations/shopify/services/shopify-sync-watch.service';
import { ShopifyShopChangeWizardComponent } from '@features/integrations/shopify/components/shopify-shop-change-wizard/shopify-shop-change-wizard.component';
import { normalizeShopDomainInput } from '@features/integrations/shopify/models/normalize-shop-domain.util';
import {
  formatShopifyCustomersSyncFeedback,
  formatShopifyInventorySyncFeedback,
  formatShopifyOrdersSyncFeedback,
  formatShopifyProductsSyncFeedback,
} from '@features/integrations/shopify/models/shopify-sync-feedback.util';
import type {
  ShopifyClearErrorsDto,
  ShopifyDisableWebhooksDto,
  ShopifySyncLocationsDto,
  ShopifySyncWebhooksDto,
} from '@features/integrations/shopify/models/shopify-sync.dto';
import { InventoryService } from '@features/inventory/services/inventory.service';
import {
  showShopifyIntegration,
  showTikTokIntegration,
  tenantCompanyPanelHint,
} from '@core/models/tenant-channel-profile.model';

import { LocationTableComponent } from './components/location-table/location-table.component';
import { LocationLicensingPanelComponent } from './components/location-licensing-panel/location-licensing-panel.component';
import { TenantClientCardComponent } from './components/tenant-client-card/tenant-client-card.component';
import { MfaSettingsComponent } from './components/mfa-settings/mfa-settings.component';
import { TenantCompanyService } from './services/tenant-company.service';
import type { TenantCompany } from './models/tenant-company.model';
import { TikTokIntegrationPanelComponent } from './components/tiktok-integration-panel/tiktok-integration-panel.component';
import { TenantOperationalSettingsPanelComponent } from './components/tenant-operational-settings-panel/tenant-operational-settings-panel.component';
import { TenantBackupPanelComponent } from './components/tenant-backup-panel/tenant-backup-panel.component';

type ConnectionState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly connection: ShopifyConnection }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

type TenantCompanyState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly company: TenantCompany }
  | { readonly status: 'skip' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error'; readonly error: string };

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
    LocationLicensingPanelComponent,
    TenantClientCardComponent,
    MfaSettingsComponent,
    TikTokIntegrationPanelComponent,
    ProfileAvatarUploadComponent,
    ShopifyShopChangeWizardComponent,
    TenantOperationalSettingsPanelComponent,
    TenantBackupPanelComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);
  private readonly inventoryService = inject(InventoryService);
  private readonly tenantCompanyService = inject(TenantCompanyService);
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

  protected readonly tenantChannelProfile = computed(
    () => this.currentUser()?.tenantChannelProfile,
  );
  protected readonly tenantCompanyHint = computed(() =>
    tenantCompanyPanelHint(this.tenantChannelProfile()),
  );
  protected readonly showShopifyPanel = computed(
    () => showShopifyIntegration(this.tenantChannelProfile()) && this.canManageShopify(),
  );
  protected readonly showTikTokPanel = computed(
    () =>
      showTikTokIntegration(this.tenantChannelProfile()) &&
      canManageTikTokConnection(this.currentUser()),
  );
  protected readonly settingsSubtitle = computed(() => {
    if (this.showShopifyPanel()) {
      return 'Profilo, sede fisica, integrazione Shopify, aspetto.';
    }
    if (this.showTikTokPanel()) {
      return 'Profilo, sede fisica, integrazione TikTok Shop, aspetto.';
    }
    return 'Profilo, sede fisica, aspetto.';
  });

  protected readonly connectionStatusLabel = shopifyConnectionStatusLabel;
  protected readonly connectionStatusTone = shopifyConnectionStatusTone;
  protected readonly shopifyScopeAccessLabel = shopifyScopeAccessLabel;
  protected readonly formatDateTime = formatDateTime;

  protected readonly connectLoading = signal(false);
  protected readonly disconnectLoading = signal(false);
  protected readonly syncLocationsLoading = signal(false);
  protected readonly syncWebhooksLoading = signal(false);
  protected readonly syncProductsLoading = signal(false);
  protected readonly syncInventoryLoading = signal(false);
  protected readonly syncCustomersLoading = signal(false);
  protected readonly syncOrdersLoading = signal(false);
  protected readonly clearErrorsLoading = signal(false);
  protected readonly connectError = signal<string | null>(null);
  protected readonly actionFeedback = signal<ActionFeedback | null>(null);
  protected readonly shopifyBanner = signal<ShopifyBanner | null>(null);
  protected readonly shopWizardOpen = signal(false);
  protected readonly shopWizardMode = signal<'change' | 'disconnect'>('change');

  private actionFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly connectForm = this.fb.group({
    shop: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(255)],
    }),
  });

  private readonly connectionTick = signal(0);
  private readonly locationTick = signal(0);
  private readonly tenantCompanyTick = signal(0);

  private readonly tenantCompanyState = toSignal(
    combineLatest([toObservable(this.tenantCompanyTick), toObservable(this.currentUser)]).pipe(
      switchMap(([, user]) => {
        if (!user || isPlatformOperator(user)) {
          return of({ status: 'skip' } as const);
        }
        return this.tenantCompanyService.getCompany().pipe(
          map((company): TenantCompanyState => ({ status: 'success', company })),
          startWith({ status: 'loading' } as const),
          catchError((err: unknown) => {
            if (isAppError(err) && err.kind === AppErrorKind.Forbidden) {
              return of({ status: 'forbidden' } satisfies TenantCompanyState);
            }
            return of({
              status: 'error',
              error: this.extractErrorMessage(err),
            } satisfies TenantCompanyState);
          }),
        );
      }),
    ),
    { initialValue: { status: 'skip' } satisfies TenantCompanyState },
  );

  protected readonly tenantCompanyLoading = computed(
    () => this.tenantCompanyState().status === 'loading',
  );

  protected readonly tenantCompany = computed((): TenantCompany | null => {
    const state = this.tenantCompanyState();
    return state.status === 'success' ? state.company : null;
  });

  protected readonly tenantCompanyError = computed(() => {
    const state = this.tenantCompanyState();
    return state.status === 'error' ? state.error : null;
  });

  private readonly connectionState = toSignal(
    combineLatest([toObservable(this.connectionTick), toObservable(this.showShopifyPanel)]).pipe(
      switchMap(([, showShopify]) => {
        if (!showShopify) {
          return of({ status: 'not-found' } satisfies ConnectionState);
        }
        return this.shopifyConnectionService.getConnection().pipe(
          map((connection): ConnectionState => ({ status: 'success', connection })),
          startWith<ConnectionState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.connectionErrorToState(err))),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies ConnectionState },
  );

  protected readonly connectionLoading = computed(
    () => this.connectionState().status === 'loading',
  );

  protected readonly connectionNotFound = computed(
    () => this.connectionState().status === 'not-found',
  );

  /** Mostra form OAuth: nessun record oppure stato not_connected (post-disconnect). */
  protected readonly shopifyConnectable = computed(() => {
    const current = this.connectionState();
    if (current.status === 'not-found') {
      return true;
    }
    return (
      current.status === 'success' &&
      current.connection.status === ShopifyConnectionStatus.NotConnected
    );
  });

  protected readonly shopifyConnectionStatus = computed((): ShopifyConnectionStatus => {
    const current = this.connectionState();
    if (current.status === 'success') {
      return current.connection.status;
    }
    return ShopifyConnectionStatus.NotConnected;
  });

  protected readonly connectionError = computed(() => {
    const current = this.connectionState();
    return current.status === 'error' ? current.error : null;
  });

  /** Connessione attiva o in errore/reauth — esclude not_connected (form collegamento). */
  protected readonly connection = computed(() => {
    const current = this.connectionState();
    if (current.status !== 'success') {
      return null;
    }
    if (current.connection.status === ShopifyConnectionStatus.NotConnected) {
      return null;
    }
    return current.connection;
  });

  protected readonly groupedShopifyScopes = computed(() => {
    const scopes = this.connection()?.scopes;
    if (!scopes?.length) {
      return [];
    }
    return groupShopifyScopesForDisplay(scopes);
  });

  protected readonly shopifyScopesSummary = computed(() => {
    const groups = this.groupedShopifyScopes();
    const total = this.connection()?.scopes?.length ?? 0;
    if (groups.length === 0) {
      return '';
    }
    const areasLabel = groups.length === 1 ? '1 area' : `${groups.length} aree`;
    const permissionsLabel = total === 1 ? '1 permesso' : `${total} permessi`;
    return `${areasLabel} · ${permissionsLabel}`;
  });

  protected readonly showShopifyLocationColumn = computed(() => {
    if (!this.showShopifyPanel()) {
      return false;
    }
    return this.connection()?.status === ShopifyConnectionStatus.Connected;
  });

  protected readonly canManageShopify = computed(() =>
    canManageShopifyConnection(this.currentUser()),
  );

  protected readonly canManageMfa = computed(() => userCanManageMfa(this.currentUser()));

  protected readonly showTenantCompanyPanel = computed(() => {
    const state = this.tenantCompanyState();
    return state.status === 'loading' || state.status === 'success' || state.status === 'error';
  });

  protected readonly canManageLicensedLocationsAsOwner = computed(() =>
    hasFullTenantAccess(this.currentUser()),
  );

  protected readonly showOperationalSettingsPanel = computed(() =>
    hasFullTenantAccess(this.currentUser()),
  );

  protected readonly showLocationsSection = computed(
    () => this.showShopifyPanel() && this.canManageLicensedLocationsAsOwner(),
  );

  protected readonly locations = toSignal(
    combineLatest([toObservable(this.locationTick), toObservable(this.showLocationsSection)]).pipe(
      switchMap(([, shouldLoad]) => {
        if (!shouldLoad) {
          return of({ status: 'skip' as const, locations: [] as readonly Location[] });
        }
        return this.inventoryService.getLocations().pipe(
          map((locations) => ({ status: 'success' as const, locations })),
          startWith({ status: 'loading' as const }),
          catchError(() => of({ status: 'error' as const, locations: [] as readonly Location[] })),
        );
      }),
    ),
    { initialValue: { status: 'skip' as const, locations: [] as readonly Location[] } },
  );

  protected readonly locationsLoading = computed(() => this.locations().status === 'loading');

  protected readonly locationItems = computed(() => {
    const state = this.locations();
    return state.status === 'success' ? state.locations : [];
  });

  /** Con Shopify scollegato nasconde residui import; non effettua chiamate API. */
  protected readonly visibleLocations = computed(() =>
    filterLocationsForSettings(this.locationItems(), {
      channelProfile: this.tenantChannelProfile(),
      shopifyConnectionStatus: this.shopifyConnectionStatus(),
      primaryStoreName: this.tenantCompany()?.storeName ?? null,
    }),
  );

  protected readonly locationSetupStatus = computed((): SetupStatusItem => {
    const limit = this.tenantCompany()?.licensedLocationCount ?? 1;
    const synced = this.locationItems().filter(
      (location) =>
        location.isActive &&
        location.licensedInVf &&
        location.shopify?.status === ShopifySyncStatus.Synced,
    );
    if (synced.length === 0) {
      return {
        active: false,
        label: 'Sedi non attivate',
        detail:
          limit === 1
            ? 'Sincronizza le location da Shopify e seleziona la sede operativa inclusa nel piano.'
            : `Sincronizza le location da Shopify e seleziona fino a ${limit} sedi operative.`,
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

  protected readonly licensedLocationCount = computed(
    () => this.tenantCompany()?.licensedLocationCount ?? 1,
  );

  protected readonly licensedLocationActiveCount = computed(
    () => this.tenantCompany()?.licensedLocationActiveCount ?? 0,
  );

  protected readonly canChangeLicensedLocations = computed(
    () => this.tenantCompany()?.canChangeLicensedLocations ?? true,
  );

  protected readonly locationSelectionLocked = computed(
    () => this.tenantCompany()?.locationSelectionLocked ?? false,
  );

  protected readonly locationSelectionChangeGranted = computed(
    () => this.tenantCompany()?.locationSelectionChangeGranted ?? false,
  );

  protected readonly canManageLocationSelection = computed(
    () => this.canManageLicensedLocationsAsOwner() && this.canChangeLicensedLocations(),
  );

  protected readonly showLocationLicensingPanel = computed(
    () =>
      this.canManageLicensedLocationsAsOwner() &&
      showShopifyIntegration(this.tenantChannelProfile()) &&
      this.shopifyConnectionStatus() === ShopifyConnectionStatus.Connected &&
      this.visibleLocations().some((location) => isShopifyManagedLocation(location)),
  );

  protected onLocationLicensingSaved(): void {
    this.reloadLocations();
    this.reloadTenantCompany();
    this.showActionFeedback({
      tone: 'success',
      message: 'Sedi attive aggiornate.',
    });
  }

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

  protected readonly showPostConnectCta = computed(() => {
    const banner = this.shopifyBanner();
    return banner === 'connected' || banner === 'connected-warn';
  });

  protected readonly shopifyBulkSyncBusy = computed(
    () =>
      this.syncProductsLoading() ||
      this.syncInventoryLoading() ||
      this.syncCustomersLoading() ||
      this.syncOrdersLoading(),
  );

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

  protected readonly roleLabel = computed(() => resolveUserAccessLabel(this.currentUser()));

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
      } else if (shopifyParam === 'shop_change_blocked') {
        this.connectError.set(
          'Collegamento a un negozio diverso bloccato. Usa "Cambia negozio Shopify" per rimuovere i dati del negozio attuale.',
        );
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { shopify: null, from: null, to: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });

    combineLatest([toObservable(this.connection), toObservable(this.showShopifyPanel)])
      .pipe(
        filter(
          ([conn, showPanel]) => showPanel && conn?.status === ShopifyConnectionStatus.Connected,
        ),
        take(1),
        switchMap(() => this.shopifyConnectionService.syncLocations()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => this.reloadLocations(),
        error: () => this.reloadLocations(),
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

  protected reloadTenantCompany(): void {
    this.tenantCompanyTick.update((tick) => tick + 1);
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

  protected openShopChangeWizard(): void {
    this.shopWizardMode.set('change');
    this.shopWizardOpen.set(true);
  }

  protected openDisconnectPurgeWizard(): void {
    this.shopWizardMode.set('disconnect');
    this.shopWizardOpen.set(true);
  }

  protected onShopWizardCompleted(): void {
    this.shopifyBanner.set('disconnected');
    this.reloadConnection();
    this.reloadLocations();
  }

  protected syncShopifyProducts(): void {
    if (this.syncProductsLoading() || this.shopifyBulkSyncBusy()) {
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
          this.reloadConnection();
          this.showActionFeedback(formatShopifyProductsSyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncProductsLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected syncShopifyInventory(): void {
    if (this.syncInventoryLoading() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.syncInventoryLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncInventory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncInventoryLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatShopifyInventorySyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncInventoryLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected syncShopifyCustomers(): void {
    if (this.syncCustomersLoading() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.syncCustomersLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncCustomers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncCustomersLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatShopifyCustomersSyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncCustomersLoading.set(false);
          this.connectError.set(this.extractErrorMessage(err));
        },
      });
  }

  protected syncShopifyOrders(): void {
    if (this.syncOrdersLoading() || this.shopifyBulkSyncBusy()) {
      return;
    }

    this.syncOrdersLoading.set(true);
    this.clearActionFeedback();
    this.connectError.set(null);

    this.shopifyConnectionService
      .syncOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.syncOrdersLoading.set(false);
          this.reloadConnection();
          this.showActionFeedback(formatShopifyOrdersSyncFeedback(result));
        },
        error: (err: unknown) => {
          this.syncOrdersLoading.set(false);
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
          this.reloadTenantCompany();
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

    const base = `${parts.join(', ')} (${result.totalCount} sedi su Shopify).`;
    if (result.autoLicensed) {
      return `${base} La sede unica è stata attivata automaticamente nel piano.`;
    }
    if (this.licensedLocationCount() > 1 || this.licensedLocationActiveCount() === 0) {
      return `${base} Seleziona le sedi da attivare in VestiFlow.`;
    }

    return base;
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
