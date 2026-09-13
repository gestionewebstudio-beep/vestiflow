import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, combineLatest, map, of, switchMap } from 'rxjs';

import type { Location } from '@core/models/location.model';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { ShopifyConnectionStore } from '@domain/channels/shopify/state/shopify-connection.store';
import { InventoryService } from '@domain/inventory/services/inventory.service';
import type { TenantCompany } from '@domain/tenant/models/tenant-company.model';
import { TenantCompanyService } from '@domain/tenant/services/tenant-company.service';

import { ShopifyIntegrationPanelComponent } from '../../components/shopify-integration-panel/shopify-integration-panel.component';
import {
  locationSetupStatusOf,
  mustChooseLocationsOf,
} from '../../models/location-setup-status.util';

/**
 * Impostazioni → Shopify: **la sola sede dei comandi generali** (11/09/2026).
 *
 * ⭐ Prima connessione, configurazione, sincronizzazione (catalogo, giacenze,
 * clienti, ordini) e stato/esiti stanno qui, e non più sparsi fra le barre di
 * Prodotti, Giacenze, Clienti e Ordini cliente. La rotta ha una guardia
 * propria (`shopifySettingsGuard`): la raggiunge chi ha il permesso di almeno
 * un comando, senza che questo gli apra le altre Impostazioni.
 *
 * ⚠️ Sedi e azienda si leggono solo per chi gestisce la connessione: sono i
 * dati che il passo «Sedi» della configurazione mostra, e a chi non lo vede
 * l’API risponderebbe 403 — non si chiede ciò che non si può mostrare.
 */
@Component({
  selector: 'app-shopify-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BackButtonComponent, ShopifyIntegrationPanelComponent],
  templateUrl: './shopify-settings-page.component.html',
  styleUrl: './shopify-settings-page.component.scss',
})
export class ShopifySettingsPageComponent {
  private readonly connectionStore = inject(ShopifyConnectionStore);
  private readonly inventoryService = inject(InventoryService);
  private readonly tenantCompanyService = inject(TenantCompanyService);
  private readonly route = inject(ActivatedRoute);

  /** La scheda aperta, dal segmento di rotta; «auto» = quella predefinita per lo stato. */
  protected readonly scheda = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('scheda'))),
    { initialValue: this.route.snapshot.paramMap.get('scheda') },
  );

  private readonly tick = signal(0);

  /** Chi gestisce la connessione: lo stesso cancello dello store. */
  private readonly gestisce = this.connectionStore.available;

  private readonly sedi = toSignal(
    combineLatest([toObservable(this.tick), toObservable(this.gestisce)]).pipe(
      switchMap(([, gestisce]) =>
        gestisce
          ? this.inventoryService
              .getLocations()
              .pipe(catchError(() => of([] as readonly Location[])))
          : of([] as readonly Location[]),
      ),
    ),
    { initialValue: [] as readonly Location[] },
  );

  private readonly azienda = toSignal(
    combineLatest([toObservable(this.tick), toObservable(this.gestisce)]).pipe(
      switchMap(([, gestisce]) =>
        gestisce
          ? this.tenantCompanyService.getCompany().pipe(
              map((company): TenantCompany | null => company),
              catchError(() => of(null)),
            )
          : of(null),
      ),
    ),
    { initialValue: null as TenantCompany | null },
  );

  protected readonly locationSetupStatus = computed(() =>
    locationSetupStatusOf(this.sedi(), this.azienda()?.licensedLocationCount ?? 1),
  );

  protected readonly mustChooseLocations = computed(() =>
    mustChooseLocationsOf(
      this.azienda()?.licensedLocationCount ?? 1,
      this.azienda()?.licensedLocationActiveCount ?? 0,
    ),
  );

  /** Il pannello ha toccato le sedi lato server (sync, disconnessione): si rileggono. */
  protected onLocationsChanged(): void {
    this.inventoryService.invalidateLocationsCache();
    this.tick.update((n) => n + 1);
  }
}
