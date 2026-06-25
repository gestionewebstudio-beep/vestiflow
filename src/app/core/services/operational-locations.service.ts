import { computed, inject, Injectable } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, merge, of, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { Location } from '@core/models/location.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { isPlatformOperator } from '@core/permissions/platform-operator.util';
import { filterLocationsForOperationalSelection } from '@core/utils/location-selection.util';

import { InventoryService } from '@features/inventory/services/inventory.service';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@features/integrations/shopify/services/shopify-sync-watch.service';

/**
 * Location selezionabili per operazioni (topbar, filtri magazzino, form).
 * Esclude sedi non incluse nel piano e residui Shopify non attivi.
 */
@Injectable({ providedIn: 'root' })
export class OperationalLocationsService {
  private readonly authService = inject(AuthService);
  private readonly inventoryService = inject(InventoryService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly shopifySyncWatch = inject(ShopifySyncWatchService);

  private readonly shopifyConnection = toSignal<ShopifyConnection | null>(
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

  private readonly shopifyConnectionStatus = computed(
    () => this.shopifyConnection()?.status ?? null,
  );

  private readonly allLocations = toSignal(
    merge(
      toObservable(this.authService.currentUser).pipe(map(() => 'user' as const)),
      this.shopifySyncWatch.watchConnectionInvalidated().pipe(map(() => 'connection' as const)),
      this.inventoryService.watchLocationsInvalidated().pipe(map(() => 'locations' as const)),
    ).pipe(
      switchMap((reason) => {
        const user = this.authService.currentUser();
        if (isPlatformOperator(user)) {
          return of([] as readonly Location[]);
        }
        if (reason === 'connection') {
          this.inventoryService.invalidateLocationsCache();
        }
        return this.inventoryService
          .getLocations()
          .pipe(catchError(() => of([] as readonly Location[])));
      }),
    ),
    { initialValue: [] as readonly Location[] },
  );

  /** Tutte le location del tenant (anagrafica grezza). */
  readonly allTenantLocations = this.allLocations;

  /** Sedi attive nel piano, selezionabili in UI operativa. */
  readonly locations = computed(() =>
    filterLocationsForOperationalSelection(this.allLocations(), {
      channelProfile: this.authService.currentUser()?.tenantChannelProfile,
      shopifyConnectionStatus: this.shopifyConnectionStatus(),
    }),
  );
}
