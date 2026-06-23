import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { isPlatformOperator } from '@core/permissions/platform-operator.util';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
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
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly inventoryService = inject(InventoryService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);
  private readonly destroyRef = inject(DestroyRef);

  readonly themeMode = this.themeService.mode;
  readonly currentUser = this.authService.currentUser;
  readonly activeLocationId = this.locationContext.activeLocationId;

  readonly isPlatformOperator = computed(() => isPlatformOperator(this.currentUser()));

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
    if (!activeLocationId) {
      return;
    }

    const selectable = this.topbarLocations();
    if (!selectable.some((location) => location.id === activeLocationId)) {
      this.locationContext.setActiveLocation(null);
    }
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

  readonly shopifyLastSyncAt = computed(() => this.shopifyConnection()?.lastSyncAt ?? null);

  readonly shopifyAutoSyncEnabled = computed(() => this.shopifyConnection()?.autoSyncEnabled);

  readonly shopifyLastError = computed(() => this.shopifyConnection()?.lastError?.message ?? null);

  private readonly shopifyErrorBannerDismissed = signal(false);

  readonly showShopifyErrorBanner = computed(() => {
    if (this.shopifyErrorBannerDismissed()) {
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

  private readonly tenantNavItems: readonly NavItem[] = [
    { label: 'Dashboard', icon: 'pi-th-large', route: '/app/dashboard' },
    { label: 'Prodotti', icon: 'pi-tags', route: '/app/products' },
    { label: 'Magazzino', icon: 'pi-box', route: '/app/inventory/lookup' },
    { label: 'Ordini Fornitori', icon: 'pi-truck', route: '/app/orders' },
    { label: 'Vendite', icon: 'pi-shopping-cart', route: '/app/sales' },
    { label: 'Clienti', icon: 'pi-users', route: '/app/customers' },
    { label: 'Report', icon: 'pi-chart-line', route: '/app/reports' },
    { label: 'Impostazioni', icon: 'pi-cog', route: '/app/settings' },
  ];

  private readonly operatorNavItems: readonly NavItem[] = [
    {
      label: 'Clienti',
      icon: 'pi-users',
      route: '/app/admin/clients',
      linkActiveOptions: {
        paths: 'subset',
        queryParams: 'ignored',
        matrixParams: 'ignored',
        fragment: 'ignored',
      },
    },
    { label: 'Impostazioni', icon: 'pi-cog', route: '/app/admin/account' },
  ];

  private readonly guideNavItem: NavItem = {
    label: 'Guida',
    icon: 'pi-book',
    route: '/app/guide',
  };

  private readonly adminGuideNavItem: NavItem = {
    label: 'Guida Tecnica',
    icon: 'pi-bookmark',
    route: '/app/admin/guide',
  };

  readonly navItems = computed((): readonly NavItem[] => {
    if (this.isPlatformOperator()) {
      return [...this.operatorNavItems, this.adminGuideNavItem];
    }
    return [...this.tenantNavItems, this.guideNavItem];
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

  onLogoutRequest(): void {
    this.logoutDialogOpen.set(true);
  }

  onLogoutFromSidebar(): void {
    this.closeDrawer();
    this.onLogoutRequest();
  }

  onLogoutConfirm(): void {
    this.logoutDialogOpen.set(false);
    this.logoutSubscription = this.authService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.router.navigateByUrl('/login');
      });
  }
}
