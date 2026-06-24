import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

import type { NavItem } from '@shared/models/nav-item.model';
import { isNavItemActive } from '@shared/utils/nav-link-active.util';

/**
 * Sidebar di navigazione. Componente dumb puro: nessuna iniezione di servizi,
 * dati via input(), comunicazione via output().
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, RouterLink],
  templateUrl: './app-sidebar.component.html',
  styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
  private readonly router = inject(Router);

  /** Forza rivalutazione stato attivo a ogni navigazione (OnPush). */
  private readonly navigationUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly items = input.required<readonly NavItem[]>();
  /** Mostra voce Esci ancorata in fondo alla sidebar. */
  readonly showLogout = input<boolean>(false);
  /** Stato del drawer (mobile): mostra il pulsante di chiusura quando aperto. */
  readonly drawerOpen = input<boolean>(false);

  readonly closeRequested = output<void>();
  readonly logoutRequested = output<void>();

  protected isLinkActive(item: NavItem): boolean {
    this.navigationUrl();
    return isNavItemActive(this.router, item);
  }
}
