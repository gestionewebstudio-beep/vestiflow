import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { catchError, filter, map, merge, of, switchMap, type Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { LocationContextService } from '@core/services/location-context.service';
import { ThemeService } from '@core/services/theme.service';
import {
  isPlatformOperator,
  hasActiveSupportSession,
} from '@core/permissions/platform-operator.util';
import { SupportSessionService } from '@core/support/support-session.service';
import {
  TenantChannelProfile,
  showRetailSalesRegister,
  showSalesOrderHistory,
} from '@core/models/tenant-channel-profile.model';
import type { EntityId } from '@core/models/common.model';
import type { Location } from '@core/models/location.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { filterLocationsForTopbar } from '@core/utils/location-selection.util';
import { AppSidebarComponent } from '@shared/components/app-sidebar/app-sidebar.component';
import { AppTopbarComponent } from '@shared/components/app-topbar/app-topbar.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { PwaUpdateBannerComponent } from '@shared/components/pwa-update-banner/pwa-update-banner.component';
import type { NavItem } from '@shared/models/nav-item.model';
import type { ThemeMode } from '@shared/models/theme.model';

import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@features/integrations/shopify/services/shopify-sync-watch.service';
import { InventoryService } from '@features/inventory/services/inventory.service';
import { isShopifySyncUiActive } from '@features/integrations/shopify/models/shopify-connection-state.util';

/**
 * Shell applicativa: topbar + sidebar + area contenuti con singola regione di
 * scroll. Smart ma minimale: possiede lo stato del drawer e la config nav, e
 * fa da ponte tra la topbar dumb e il ThemeService.
 */
@Component({
  selector: 'app-shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterOutlet,
    AppSidebarComponent,
    AppTopbarComponent,
    ConfirmDialogComponent,
    PwaUpdateBannerComponent,
  ],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly inventoryService = inject(InventoryService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);
  private readonly supportSessions = inject(SupportSessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly themeMode = this.themeService.mode;
  readonly currentUser = this.authService.currentUser;
  readonly activeLocationId = this.locationContext.activeLocationId;

  readonly isPlatformOperator = computed(() => isPlatformOperator(this.currentUser()));

  readonly supportSession = computed(() => this.currentUser()?.supportSession ?? null);

  readonly showSupportSessionBanner = computed(() => hasActiveSupportSession(this.currentUser()));

  readonly supportSessionEndLoading = signal(false);

  readonly showSidebarLogout = computed(() => this.currentUser() != null);

  /** Tutte le location del tenant (caricamento grezzo). */
  private readonly allLocations = toSignal(
    merge(
      toObservable(this.currentUser).pipe(map((user) => ({ kind: 'user' as const, user }))),
      this.shopifySyncWatch
        .watchConnectionInvalidated()
        .pipe(map(() => ({ kind: 'refresh' as const }))),
    ).pipe(
      switchMap((event) => {
        const user = event.kind === 'user' ? event.user : this.authService.currentUser();
        if (isPlatformOperator(user)) {
          return of([] as readonly Location[]);
        }
        if (event.kind === 'refresh') {
          this.inventoryService.invalidateLocationsCache();
        }
        return this.inventoryService
          .getLocations()
          .pipe(catchError(() => of([] as readonly Location[])));
      }),
    ),
    { initialValue: [] as readonly Location[] },
  );

  /** Location selezionabili in topbar (esclude sede locale di onboarding con Shopify). */
  readonly topbarLocations = computed(() =>
    filterLocationsForTopbar(this.allLocations(), {
      channelProfile: this.currentUser()?.tenantChannelProfile,
      shopifyConnectionStatus: this.shopifySyncStatus(),
    }),
  );

  private readonly syncActiveLocationWithTopbar = effect(() => {
    const activeLocationId = this.activeLocationId();
    const selectable = this.topbarLocations();

    if (selectable.length === 0) {
      if (activeLocationId) {
        this.locationContext.setActiveLocation(null);
      }
      return;
    }

    if (!activeLocationId) {
      return;
    }

    if (!selectable.some((location) => location.id === activeLocationId)) {
      this.locationContext.setActiveLocation(null);
    }
  });

  /** Allinea le sedi al catalogo Shopify una volta per sessione (rimuove sedi obsolete). */
  private readonly sessionLocationSync = effect((onCleanup) => {
    if (this.isPlatformOperator()) {
      return;
    }
    if (this.shopifySyncStatus() !== ShopifyConnectionStatus.Connected) {
      return;
    }

    const storageKey = 'vestiflow-session-location-sync-v3';
    try {
      if (this.document.defaultView?.sessionStorage.getItem(storageKey)) {
        return;
      }
    } catch {
      return;
    }

    const subscription = this.shopifyConnectionService
      .syncLocations()
      .pipe(catchError(() => of(null)))
      .subscribe((result) => {
        this.inventoryService.invalidateLocationsCache();
        if (!result) {
          return;
        }
        try {
          this.document.defaultView?.sessionStorage.setItem(storageKey, '1');
        } catch {
          // sessionStorage non disponibile: nessuna persistenza del flag.
        }
      });

    onCleanup(() => subscription.unsubscribe());
  });

  /** Connessione Shopify completa per topbar e banner globali. */
  readonly shopifyConnection = toSignal<ShopifyConnection | null>(
    merge(
      of(void 0),
      this.shopifySyncWatch.watchSyncCompleted(),
      this.shopifySyncWatch.watchConnectionInvalidated(),
    ).pipe(
      switchMap(() => {
        if (isPlatformOperator(this.authService.currentUser())) {
          return of(null);
        }
        const profile = this.authService.currentUser()?.tenantChannelProfile;
        if (profile !== TenantChannelProfile.Shopify) {
          return of(null);
        }
        return this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null)));
      }),
    ),
    { initialValue: null },
  );

  readonly shopifySyncStatus = computed<ShopifyConnectionStatus | null>(
    () => this.shopifyConnection()?.status ?? null,
  );

  /** Indicatore sync in topbar: nascosto se Shopify non è connesso. */
  readonly shopifySyncStatusForTopbar = computed(() => {
    const status = this.shopifySyncStatus();
    return isShopifySyncUiActive(status) ? status : null;
  });

  readonly shopifyLastSyncAt = computed(() => {
    if (!isShopifySyncUiActive(this.shopifySyncStatus())) {
      return null;
    }
    return this.shopifyConnection()?.lastSyncAt ?? null;
  });

  readonly shopifyAutoSyncEnabled = computed(() => {
    if (!isShopifySyncUiActive(this.shopifySyncStatus())) {
      return undefined;
    }
    return this.shopifyConnection()?.autoSyncEnabled;
  });

  readonly shopifyLastError = computed(() => {
    if (!isShopifySyncUiActive(this.shopifySyncStatus())) {
      return null;
    }
    return this.shopifyConnection()?.lastError?.message ?? null;
  });

  private readonly shopifyErrorBannerDismissed = signal(false);

  readonly showShopifyErrorBanner = computed(() => {
    if (this.shopifyErrorBannerDismissed()) {
      return false;
    }
    if (!isShopifySyncUiActive(this.shopifySyncStatus())) {
      return false;
    }
    return Boolean(this.shopifyConnection()?.lastError);
  });

  readonly shopifyErrorBannerMessage = computed(
    () => this.shopifyConnection()?.lastError?.message ?? '',
  );

  private readonly _drawerOpen = signal(false);
  readonly drawerOpen = this._drawerOpen.asReadonly();

  protected readonly logoutDialogOpen = signal(false);

  private readonly tenantNavItemsWithoutSales: readonly NavItem[] = [
    {
      label: 'Dashboard',
      icon: 'pi-th-large',
      route: '/app/dashboard',
      activeRoutePrefix: '/app/dashboard',
    },
    {
      label: 'Prodotti',
      icon: 'pi-tags',
      route: '/app/products',
      activeRoutePrefix: '/app/products',
    },
    {
      label: 'Magazzino',
      icon: 'pi-box',
      route: '/app/inventory/lookup',
      activeRoutePrefix: '/app/inventory',
    },
    {
      label: 'Ordini Fornitori',
      icon: 'pi-truck',
      route: '/app/orders',
      activeRoutePrefix: '/app/orders',
    },
    {
      label: 'Clienti',
      icon: 'pi-users',
      route: '/app/customers',
      activeRoutePrefix: '/app/customers',
    },
    {
      label: 'Report',
      icon: 'pi-chart-line',
      route: '/app/reports',
      activeRoutePrefix: '/app/reports',
    },
    {
      label: 'Impostazioni',
      icon: 'pi-cog',
      route: '/app/settings',
      activeRoutePrefix: '/app/settings',
    },
  ];

  private readonly operatorNavItems: readonly NavItem[] = [
    {
      label: 'Clienti',
      icon: 'pi-users',
      route: '/app/admin/clients',
      activeRoutePrefix: '/app/admin/clients',
    },
    {
      label: 'Impostazioni',
      icon: 'pi-cog',
      route: '/app/admin/account',
      activeRoutePrefix: '/app/admin/account',
    },
  ];

  private readonly guideNavItem: NavItem = {
    label: 'Guida',
    icon: 'pi-book',
    route: '/app/guide',
    activeRoutePrefix: '/app/guide',
  };

  private readonly adminGuideNavItem: NavItem = {
    label: 'Guida Tecnica',
    icon: 'pi-bookmark',
    route: '/app/admin/guide',
    activeRoutePrefix: '/app/admin/guide',
  };

  readonly navItems = computed((): readonly NavItem[] => {
    if (this.isPlatformOperator()) {
      return [...this.operatorNavItems, this.adminGuideNavItem];
    }

    const profile = this.currentUser()?.tenantChannelProfile;
    const salesNavItems: NavItem[] = [];

    if (showRetailSalesRegister(profile)) {
      salesNavItems.push({
        label: 'Registra vendita',
        icon: 'pi-shopping-bag',
        route: '/app/sales/register',
        activeRoutePrefix: '/app/sales/register',
      });
    }

    if (showSalesOrderHistory(profile)) {
      salesNavItems.push({
        label: 'Vendite',
        icon: 'pi-shopping-cart',
        route: '/app/sales',
        activeRoutePrefix: '/app/sales',
        activeRouteExclude: ['/app/sales/register'],
      });
    }

    const items = this.tenantNavItemsWithoutSales;
    return [...items.slice(0, 4), ...salesNavItems, ...items.slice(4), this.guideNavItem];
  });

  // Chiude il drawer a ogni navigazione completata (UX mobile).
  // takeUntilDestroyed() gestisce l'unsubscribe automatico.
  private readonly closeDrawerOnNavigation = this.router.events
    .pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    )
    .subscribe(() => this.closeDrawer());

  toggleDrawer(): void {
    this._drawerOpen.update((open) => !open);
  }

  closeDrawer(): void {
    this._drawerOpen.set(false);
  }

  onThemeModeChange(mode: ThemeMode): void {
    this.themeService.setMode(mode);
  }

  onLocationChange(locationId: EntityId | null): void {
    this.locationContext.setActiveLocation(locationId);
  }

  onSyncClick(): void {
    if (this.isPlatformOperator()) {
      return;
    }
    void this.router.navigateByUrl('/app/settings');
  }

  dismissShopifyErrorBanner(): void {
    this.shopifyErrorBannerDismissed.set(true);
  }

  onSettingsClick(): void {
    const url = this.isPlatformOperator() ? '/app/admin/account' : '/app/settings';
    void this.router.navigateByUrl(url);
    this.closeDrawer();
  }

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private logoutSubscription: Subscription | null = null;
  private supportSessionEndSubscription: Subscription | null = null;

  onLogoutRequest(): void {
    this.logoutDialogOpen.set(true);
  }

  onLogoutFromSidebar(): void {
    this.closeDrawer();
    this.onLogoutRequest();
  }

  onLogoutConfirm(): void {
    this.logoutDialogOpen.set(false);
    this.supportSessions.clearSession();
    this.logoutSubscription = this.authService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.router.navigateByUrl('/login');
      });
  }

  onEndSupportSession(): void {
    if (this.supportSessionEndLoading()) {
      return;
    }
    this.supportSessionEndLoading.set(true);
    this.supportSessionEndSubscription = this.supportSessions
      .endSession()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.supportSessionEndLoading.set(false);
          this.supportSessions.exitTenantWorkspace();
        },
        error: () => {
          this.supportSessionEndLoading.set(false);
        },
      });
  }
}
