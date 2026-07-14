import { computed, inject, Injectable } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, merge, of, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { Location } from '@core/models/location.model';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { isPlatformOperator } from '@core/permissions/platform-operator.util';
import {
  filterLocationsForInventorySelection,
  isLicensedOperationalLocation,
} from '@core/utils/location-selection.util';
import {
  filterLocationsForRead,
  filterLocationsByUserAssignment,
  resolveFixedOperationalLocationId,
  isFixedSingleStoreUser,
} from '@core/utils/user-location-scope.util';

import { InventoryService } from '@features/inventory/services/inventory.service';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@features/integrations/shopify/services/shopify-sync-watch.service';
import { canManageShopifyConnection } from '@core/permissions/tenant-permissions.util';

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
      toObservable(this.authService.currentUser).pipe(map(() => 'user' as const)),
      this.shopifySyncWatch.watchSyncCompleted().pipe(map(() => 'sync' as const)),
      this.shopifySyncWatch.watchConnectionInvalidated().pipe(map(() => 'connection' as const)),
    ).pipe(
      switchMap(() => {
        const user = this.authService.currentUser();
        if (isPlatformOperator(user)) {
          return of(null);
        }
        const profile = user?.tenantChannelProfile;
        if (profile !== TenantChannelProfile.Shopify || !canManageShopifyConnection(user)) {
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

  private readonly licensedOperationalLocations = computed(() =>
    this.allLocations().filter(isLicensedOperationalLocation),
  );

  private readonly inventoryLocationContext = computed(() => {
    const user = this.authService.currentUser();
    return {
      channelProfile: user?.tenantChannelProfile,
      shopifyConnectionStatus: this.shopifyConnectionStatus(),
    };
  });

  /** Sedi visibili in consultazione (liste, filtri, topbar, report). */
  readonly locations = computed(() => {
    const user = this.authService.currentUser();
    const filtered = filterLocationsForInventorySelection(
      this.licensedOperationalLocations(),
      this.inventoryLocationContext(),
    );
    const scoped = filterLocationsForRead(filtered, user);
    return this.withAssignedLocationFallback(scoped, user);
  });

  /** Destinazioni trasferimento: tutte le sedi operative licenziate (origine resta sulla sede assegnata). */
  readonly transferTargetLocations = computed(() =>
    filterLocationsForInventorySelection(
      this.licensedOperationalLocations(),
      this.inventoryLocationContext(),
    ),
  );

  /** Sedi su cui l'utente può agire (form movimenti origine, inventario, vendite al banco). */
  readonly writeLocations = computed(() => {
    const user = this.authService.currentUser();
    const filtered = filterLocationsForInventorySelection(
      this.licensedOperationalLocations(),
      this.inventoryLocationContext(),
    );
    const scoped = filterLocationsByUserAssignment(filtered, user);
    return this.withAssignedLocationFallback(scoped, user);
  });

  /** Alias esplicito per form e liste operative magazzino. */
  readonly actionLocations = this.writeLocations;

  /**
   * Sede predefinita dell'utente: valorizzata SOLO se è tra le sedi su cui può
   * agire (writeLocations), altrimenti null. È un SUGGERIMENTO per i form:
   * mai usarla come fallback automatico "prima location disponibile".
   */
  readonly defaultLocation = computed<Location | null>(() => {
    const defaultId = this.authService.currentUser()?.defaultLocationId;
    if (!defaultId) {
      return null;
    }
    return this.writeLocations().find((location) => location.id === defaultId) ?? null;
  });

  /**
   * Sede suggerita nei form operativi: la predefinita se autorizzata, altrimenti
   * l'unica sede scrivibile quando l'utente è mono-location. Solo suggerimento,
   * mai autoselezione.
   */
  readonly suggestedWriteLocation = computed<Location | null>(() => {
    const preferred = this.defaultLocation();
    if (preferred) {
      return preferred;
    }
    const writable = this.writeLocations();
    return writable.length === 1 ? (writable[0] ?? null) : null;
  });

  readonly isFixedSingleStore = computed(() =>
    isFixedSingleStoreUser(this.authService.currentUser()),
  );

  readonly fixedSingleStoreLocationId = computed(() =>
    resolveFixedOperationalLocationId(this.authService.currentUser()),
  );

  readonly fixedSingleStoreLabel = computed(() => {
    const locations = this.authService.currentUser()?.assignedLocations ?? [];
    return locations.length === 1 ? (locations[0]?.name ?? null) : null;
  });

  /** Commesso/manager: se il filtro Shopify restituisce vuoto, usa la sede assegnata licenziata. */
  private withAssignedLocationFallback(
    scoped: readonly Location[],
    user: ReturnType<AuthService['currentUser']>,
  ): readonly Location[] {
    if (scoped.length > 0 || !isFixedSingleStoreUser(user)) {
      return scoped;
    }
    const licensed = this.allLocations().filter(isLicensedOperationalLocation);
    return filterLocationsByUserAssignment(licensed, user);
  }
}
