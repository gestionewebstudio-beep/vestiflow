import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import type { NavItem } from '@shared/models/nav-item.model';

/**
 * Sidebar di navigazione. Componente dumb puro: nessuna iniezione di servizi,
 * dati via input(), comunicazione via output().
 */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, RouterLink, RouterLinkActive],
  templateUrl: './app-sidebar.component.html',
  styleUrl: './app-sidebar.component.scss',
})
export class AppSidebarComponent {
  readonly items = input.required<readonly NavItem[]>();
  /** Stato del drawer (mobile): mostra il pulsante di chiusura quando aperto. */
  readonly drawerOpen = input<boolean>(false);

  readonly closeRequested = output<void>();
}
