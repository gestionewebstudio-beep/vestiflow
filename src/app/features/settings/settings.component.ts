import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, filter, map, of, startWith, switchMap, take } from 'rxjs';

import { AuthService } from '@core/auth';
import { isPlatformOperator } from '@core/permissions/platform-operator.util';
import { hasFullTenantAccess } from '@core/permissions/user-permissions.util';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import {
  canManageMfa as userCanManageMfa,
  canManageSettingsCompany,
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
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { ProfileAvatarUploadComponent } from '@shared/components/profile-avatar-upload/profile-avatar-upload.component';
import type { ThemeMode } from '@shared/models/theme.model';

import { ShopifyConnectionService } from '@domain/channels/shopify/services/shopify-connection.service';
import { ShopifyConnectionStore } from '@domain/channels/shopify/state/shopify-connection.store';
import { InventoryService } from '@domain/inventory/services/inventory.service';
import {
  showShopifyIntegration,
  showTikTokIntegration,
  tenantCompanyPanelHint,
} from '@core/models/tenant-channel-profile.model';

import { LocationTableComponent } from './components/location-table/location-table.component';
import { LocationLicensingPanelComponent } from './components/location-licensing-panel/location-licensing-panel.component';
import { TenantClientCardComponent } from './components/tenant-client-card/tenant-client-card.component';
import { MfaSettingsComponent } from '@domain/tenant/components/mfa-settings/mfa-settings.component';
import { TenantCompanyService } from '@domain/tenant/services/tenant-company.service';
import type { TenantCompany } from '@domain/tenant/models/tenant-company.model';
import { TikTokIntegrationPanelComponent } from './components/tiktok-integration-panel/tiktok-integration-panel.component';
import { TenantOperationalSettingsPanelComponent } from './components/tenant-operational-settings-panel/tenant-operational-settings-panel.component';
import { TenantBackupPanelComponent } from './components/tenant-backup-panel/tenant-backup-panel.component';
import { FiscalDevicePanelComponent } from './components/fiscal-device-panel/fiscal-device-panel.component';
import { ShopifyIntegrationPanelComponent } from './components/shopify-integration-panel/shopify-integration-panel.component';
import type { SetupStatusItem } from './models/setup-status.model';

type TenantCompanyState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly company: TenantCompany }
  | { readonly status: 'skip' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error'; readonly error: string };

interface ActionFeedback {
  readonly message: string;
  readonly tone: 'success' | 'warning';
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
    ButtonComponent,
    ErrorStateComponent,
    RouterLink,
    InlineBannerComponent,
    TableSkeletonComponent,
    LocationTableComponent,
    LocationLicensingPanelComponent,
    TenantClientCardComponent,
    MfaSettingsComponent,
    TikTokIntegrationPanelComponent,
    ShopifyIntegrationPanelComponent,
    ProfileAvatarUploadComponent,
    TenantOperationalSettingsPanelComponent,
    TenantBackupPanelComponent,
    FiscalDevicePanelComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private readonly connectionStore = inject(ShopifyConnectionStore);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly inventoryService = inject(InventoryService);
  private readonly tenantCompanyService = inject(TenantCompanyService);
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
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
  /** Cancello del pannello Shopify: profilo del tenant + permesso. Lo tiene lo store. */
  protected readonly showShopifyPanel = this.connectionStore.available;
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

  protected readonly formatDateTime = formatDateTime;

  /**
   * Esito delle azioni della pagina — oggi solo il salvataggio delle sedi
   * attive. Le azioni Shopify hanno il proprio, dentro il loro pannello.
   */
  protected readonly actionFeedback = signal<ActionFeedback | null>(null);
  private actionFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

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

  /**
   * Stato della connessione Shopify: viene dallo store, che lo condivide con il
   * pannello. La sezione Location e il pannello devono vedere la stessa
   * connessione — chiederla due volte al server le farebbe divergere.
   */
  protected readonly shopifyConnectionStatus = this.connectionStore.status;

  protected readonly showShopifyLocationColumn = computed(
    () => this.showShopifyPanel() && this.connectionStore.connected(),
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

  /** Stampanti fiscali per sede: stesso permesso del backend (settings.company). */
  protected readonly showFiscalDevicePanel = computed(() =>
    canManageSettingsCompany(this.currentUser()),
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

  protected readonly roleLabel = computed(() => resolveUserAccessLabel(this.currentUser()));

  /**
   * Il tenant deve ancora scegliere quali sedi attivare: piano multi-sede,
   * oppure nessuna sede attiva. Serve al pannello Shopify per completare il
   * messaggio dopo la sync delle location.
   */
  protected readonly mustChooseLocations = computed(
    () => this.licensedLocationCount() > 1 || this.licensedLocationActiveCount() === 0,
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.actionFeedbackTimer) {
        clearTimeout(this.actionFeedbackTimer);
      }
    });

    // Prima apertura con Shopify collegato: allinea le location una volta, cosi'
    // la tabella qui sotto mostra le sedi vere e non l'ultimo import. Una sola
    // volta per visita (`take(1)`): non e' un polling.
    toObservable(this.connectionStore.connected)
      .pipe(
        filter((connected) => connected),
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

  protected reloadLocations(): void {
    this.inventoryService.invalidateLocationsCache();
    this.locationTick.update((tick) => tick + 1);
  }

  protected reloadTenantCompany(): void {
    this.tenantCompanyTick.update((tick) => tick + 1);
  }

  /** Il pannello Shopify ha toccato le location lato server (sync, disconnessione). */
  protected onShopifyLocationsChanged(): void {
    this.reloadLocations();
    this.reloadTenantCompany();
  }

  protected dismissLocationFeedback(): void {
    this.clearActionFeedback();
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
}
