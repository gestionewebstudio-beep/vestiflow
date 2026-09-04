import { ChangeDetectionStrategy, Component } from '@angular/core';

import { NavTabsComponent } from '@shared/components/nav-tabs/nav-tabs.component';
import type { NavTab } from '@shared/components/nav-tabs/nav-tabs.component';

/**
 * Sotto-navigazione della feature Magazzino.
 *
 * ⭐ **Delega la veste a `app-nav-tabs`** dal 04/09/2026: la stessa fila di
 * schede serviva anche alla Cassa, e duplicarne quarantadue righe di stile
 * avrebbe significato che cambiarne una lascia l'altra indietro.
 */
@Component({
  selector: 'app-inventory-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NavTabsComponent],
  templateUrl: './inventory-tabs.component.html',
})
export class InventoryTabsComponent {
  protected readonly tabs: readonly NavTab[] = [
    { label: 'Giacenze', link: '/app/inventory' },
    { label: 'Situazione', link: '/app/inventory/situation' },
    { label: 'Cerca', link: '/app/inventory/lookup' },
    { label: 'Movimenti', link: '/app/inventory/movements' },
    { label: 'Inventario', link: '/app/inventory/counts', exact: false },
  ];
}
