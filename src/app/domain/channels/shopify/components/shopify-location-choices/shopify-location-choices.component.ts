import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';

import { ViewportService } from '@core/services/viewport.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type {
  ShopifySetupLocationChoiceInput,
  ShopifySetupLocationDto,
  ShopifySetupSedeVestiFlowDto,
} from '../../models/shopify-setup.dto';

/** Il comando su una location, come lo emette la tabella delle scelte. */
export interface ShopifySetupSedeScelta {
  readonly shopifyLocationId: string;
  readonly scelta: ShopifySetupLocationChoiceInput;
}

const VALORE_LASCIA = 'lascia';
const VALORE_CREA = 'crea';
const PREFISSO_COLLEGA = 'collega:';

/**
 * ⭐ **La scelta di una persona per ogni location Shopify** — collega a una
 *    sede, crea la sede, lascia fuori (`docs/24` §1.13.1, B7). È la stessa
 *    tabella nella fase 2 del percorso di prima connessione (`docs/27` §1) e
 *    nella sezione Sedi di Impostazioni → Shopify, dove serve **fuori dal
 *    percorso**: alle connessioni nate prima e dopo una disconnessione e
 *    riconnessione, quando le sedi vanno riscelte (mandato del 12/09/2026).
 *
 * ⚠️ Componente dumb: riceve location e sedi, emette la scelta. Una sede già
 *    collegata a un'ALTRA location non si offre: una sede raccoglie una
 *    location (`docs/24` §8.11.1).
 */
@Component({
  selector: 'app-shopify-location-choices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, SelectMenuComponent],
  templateUrl: './shopify-location-choices.component.html',
  styleUrl: './shopify-location-choices.component.scss',
})
export class ShopifyLocationChoicesComponent {
  /** È viva la vista a card? Lì il pannello della tendina resta nel flusso. */
  protected readonly compatta = inject(ViewportService).compact;

  readonly locations = input.required<readonly ShopifySetupLocationDto[]>();
  readonly sedi = input.required<readonly ShopifySetupSedeVestiFlowDto[]>();
  /** Le scelte si cambiano; altrimenti si leggono. */
  readonly modificabile = input(true);

  readonly sedeScelta = output<ShopifySetupSedeScelta>();

  /**
   * Le voci del menu di una location: «Lascia fuori», «Crea la sede», e una
   * voce per ogni sede VestiFlow non già collegata ad ALTRA location.
   */
  protected opzioniSede(location: ShopifySetupLocationDto): readonly SelectMenuOption[] {
    const sedi = this.sedi().filter(
      (sede) =>
        sede.shopifyLocationId === null || sede.shopifyLocationId === location.shopifyLocationId,
    );
    return [
      { value: VALORE_LASCIA, label: 'Lascia fuori da VestiFlow' },
      { value: VALORE_CREA, label: `Crea la sede «${location.name}»` },
      ...sedi.map((sede) => ({
        value: `${PREFISSO_COLLEGA}${sede.id}`,
        label: `Collega a «${sede.name}»`,
        triggerLabel: `Collega a «${sede.name}»`,
      })),
    ];
  }

  protected valoreSede(location: ShopifySetupLocationDto): string | null {
    switch (location.choice) {
      case 'lascia':
        return VALORE_LASCIA;
      case 'crea':
      case 'collega':
        return location.locationId ? `${PREFISSO_COLLEGA}${location.locationId}` : VALORE_CREA;
      default:
        return null;
    }
  }

  protected onSedeScelta(location: ShopifySetupLocationDto, valore: string | null): void {
    if (!valore) {
      return;
    }
    const scelta: ShopifySetupLocationChoiceInput =
      valore === VALORE_LASCIA
        ? { choice: 'lascia' }
        : valore === VALORE_CREA
          ? { choice: 'crea' }
          : { choice: 'collega', locationId: valore.slice(PREFISSO_COLLEGA.length) };
    this.sedeScelta.emit({ shopifyLocationId: location.shopifyLocationId, scelta });
  }
}
