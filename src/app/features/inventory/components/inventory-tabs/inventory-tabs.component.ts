import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Sotto-navigazione della feature Magazzino (Giacenze / Movimenti).
 * Dumb puro: solo link, nessuno stato.
 */
@Component({
  selector: 'app-inventory-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './inventory-tabs.component.html',
  styleUrl: './inventory-tabs.component.scss',
})
export class InventoryTabsComponent {}
