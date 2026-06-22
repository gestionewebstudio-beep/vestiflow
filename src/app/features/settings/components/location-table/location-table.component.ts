import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { Location } from '@core/models/location.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { isShopifyManagedLocation } from '@core/utils/location-selection.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';

/** Elenco location del tenant (dumb puro, read-only). */
@Component({
  selector: 'app-location-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './location-table.component.html',
  styleUrl: './location-table.component.scss',
})
export class LocationTableComponent {
  readonly locations = input.required<readonly Location[]>();
  readonly showShopifyColumn = input(true);
  readonly groupByShopifySource = input(false);

  protected readonly shopifyLocations = computed(() =>
    this.locations().filter((location) => isShopifyManagedLocation(location)),
  );

  protected readonly localLocations = computed(() =>
    this.locations().filter((location) => !isShopifyManagedLocation(location)),
  );

  protected readonly useGroupedLayout = computed(
    () => this.groupByShopifySource() && this.showShopifyColumn(),
  );

  protected formatAddress(location: Location): string {
    const address = location.address;
    if (!address) {
      return '—';
    }

    const cityLine = [address.postalCode, address.city].filter(Boolean).join(' ');
    const parts = [address.line1, cityLine, address.province].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '—';
  }

  protected shopifyLabel(location: Location): string {
    switch (location.shopify?.status) {
      case ShopifySyncStatus.Synced:
        return 'Sincronizzata';
      case ShopifySyncStatus.Syncing:
        return 'Sync in corso';
      case ShopifySyncStatus.OutOfSync:
        return 'Non aggiornata';
      case ShopifySyncStatus.Error:
        return 'Errore sync';
      default:
        return 'Non collegata';
    }
  }

  protected shopifyTone(location: Location): BadgeTone {
    switch (location.shopify?.status) {
      case ShopifySyncStatus.Synced:
        return 'success';
      case ShopifySyncStatus.Syncing:
        return 'info';
      case ShopifySyncStatus.OutOfSync:
        return 'warning';
      case ShopifySyncStatus.Error:
        return 'error';
      default:
        return 'neutral';
    }
  }
}
