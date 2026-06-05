import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, type Subscription } from 'rxjs';

import { AuthService } from '@core/auth';
import { ThemeService } from '@core/services/theme.service';
import { AppSidebarComponent } from '@shared/components/app-sidebar/app-sidebar.component';
import { AppTopbarComponent } from '@shared/components/app-topbar/app-topbar.component';
import type { NavItem } from '@shared/models/nav-item.model';
import type { ThemeMode } from '@shared/models/theme.model';

/**
 * Shell applicativa: topbar + sidebar + area contenuti con singola regione di
 * scroll. Smart ma minimale: possiede lo stato del drawer e la config nav, e
 * fa da ponte tra la topbar dumb e il ThemeService.
 */
@Component({
  selector: 'app-shell-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, AppSidebarComponent, AppTopbarComponent],
  templateUrl: './shell-layout.component.html',
  styleUrl: './shell-layout.component.scss',
})
export class ShellLayoutComponent {
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly themeMode = this.themeService.mode;
  readonly currentUser = this.authService.currentUser;

  private readonly _drawerOpen = signal(false);
  readonly drawerOpen = this._drawerOpen.asReadonly();

  readonly navItems: readonly NavItem[] = [
    { label: 'Dashboard', icon: 'pi-th-large', route: '/app/dashboard' },
    { label: 'Prodotti', icon: 'pi-tags', route: '/app/products' },
    { label: 'Magazzino', icon: 'pi-box', route: '/app/inventory' },
    { label: 'Ordini Fornitori', icon: 'pi-truck', route: '/app/orders' },
    { label: 'Clienti', icon: 'pi-users', route: '/app/customers' },
    { label: 'Report', icon: 'pi-chart-line', route: '/app/reports' },
    { label: 'Impostazioni', icon: 'pi-cog', route: '/app/settings' },
  ];

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

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private logoutSubscription: Subscription | null = null;

  onLogout(): void {
    this.logoutSubscription = this.authService
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.router.navigateByUrl('/login');
      });
  }
}
