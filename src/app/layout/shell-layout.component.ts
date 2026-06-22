import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { catchError, filter, map, merge, of, switchMap, type Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { LocationContextService } from '@core/services/location-context.service';
import { ThemeService } from '@core/services/theme.service';
import { isPlatformOperator } from '@core/permissions/platform-operator.util';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { EntityId } from '@core/models/common.model';
import type { Location } from '@core/models/location.model';
import type { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
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

  /** Location per il selettore topbar (solo gestionale negozio; operatore: nascosto). */
  readonly locations = toSignal(
    toObservable(this.currentUser).pipe(
      switchMap((user) => {
        if (isPlatformOperator(user)) {
          return of([] as readonly Location[]);
        }
        return this.inventoryService
          .getLocations()
          .pipe(catchError(() => of([] as readonly Location[])));
      }),
    ),
    { initialValue: [] as readonly Location[] },
  );

  /** Stato connessione Shopify per l'indicatore sync (null = nascosto o non risolto). */
  readonly shopifySyncStatus = toSignal<ShopifyConnectionStatus | null>(
    merge(of(void 0), this.shopifySyncWatch.watchSyncCompleted()).pipe(
      switchMap(() => {
        if (isPlatformOperator(this.authService.currentUser())) {
          return of(null);
        }
        const profile = this.authService.currentUser()?.tenantChannelProfile;
        if (profile !== TenantChannelProfile.Shopify) {
          return of(null);
        }
        return this.shopifyConnectionService.getConnection().pipe(
          map((connection) => connection.status),
          catchError(() => of(null)),
        );
      }),
    ),
    { initialValue: null },
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

  readonly footerNavItems = computed((): readonly NavItem[] => {
    if (this.isPlatformOperator()) {
      return [this.adminGuideNavItem];
    }
    return [this.guideNavItem];
  });

  readonly navItems = computed((): readonly NavItem[] => {
    if (this.isPlatformOperator()) {
      return this.operatorNavItems;
    }
    return this.tenantNavItems;
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
