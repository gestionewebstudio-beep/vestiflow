import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { catchError, filter, map, merge, of, switchMap, type Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { LocationContextService } from '@core/services/location-context.service';
import { ThemeService } from '@core/services/theme.service';
import type { EntityId } from '@core/models/common.model';
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

  /** Location per il selettore topbar (in errore: selettore nascosto). */
  readonly locations = toSignal(
    this.inventoryService.getLocations().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  /** Stato connessione Shopify per l'indicatore sync (null finche' non risolto). */
  readonly shopifySyncStatus = toSignal<ShopifyConnectionStatus | null>(
    merge(of(void 0), this.shopifySyncWatch.watchSyncCompleted()).pipe(
      switchMap(() =>
        this.shopifyConnectionService.getConnection().pipe(
          map((connection) => connection.status),
          catchError(() => of(null)),
        ),
      ),
    ),
    { initialValue: null },
  );

  private readonly _drawerOpen = signal(false);
  readonly drawerOpen = this._drawerOpen.asReadonly();

  protected readonly logoutDialogOpen = signal(false);

  private readonly baseNavItems: readonly NavItem[] = [
    { label: 'Dashboard', icon: 'pi-th-large', route: '/app/dashboard' },
    { label: 'Prodotti', icon: 'pi-tags', route: '/app/products' },
    { label: 'Magazzino', icon: 'pi-box', route: '/app/inventory/lookup' },
    { label: 'Ordini Fornitori', icon: 'pi-truck', route: '/app/orders' },
    { label: 'Vendite', icon: 'pi-shopping-cart', route: '/app/sales' },
    { label: 'Clienti', icon: 'pi-users', route: '/app/customers' },
    { label: 'Report', icon: 'pi-chart-line', route: '/app/reports' },
    { label: 'Guida', icon: 'pi-book', route: '/app/guide' },
    { label: 'Impostazioni', icon: 'pi-cog', route: '/app/settings' },
  ];

  readonly navItems = computed((): readonly NavItem[] => {
    const items = [...this.baseNavItems];
    if (this.authService.currentUser()?.isPlatformAdmin) {
      items.splice(items.length - 1, 0, {
        label: 'Nuovo cliente',
        icon: 'pi-user-plus',
        route: '/app/admin/clients/new',
      });
    }
    return items;
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
    void this.router.navigateByUrl('/app/settings');
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
