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

/** Stesso nome a meno di maiuscole e spazi ai bordi: basta a SUGGERIRE, non a decidere. */
function stessoNome(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), 'it', { sensitivity: 'base' }) === 0;
}

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
   * Le voci del menu di una location, nell'ordine in cui si decidono: una voce
   * «Collega» per ogni sede VestiFlow non già collegata ad ALTRA location — con
   * la sede dallo STESSO NOME per prima e dichiarata «suggerita» —, poi «Crea
   * una nuova sede», distinta, poi «Lascia fuori».
   *
   * ⛔ Qui c'era l'ordine Lascia · Crea · Collega…, e «Crea la sede «Magazzino
   *    test 3»» compariva accanto a una sede che si chiamava già così: il
   *    proprietario, al collaudo del 14/09/2026, ha chiesto se fosse normale.
   *    Non lo era. ⚠️ Il nome uguale SUGGERISCE: la scelta resta della persona
   *    (`valoreSede` non propone niente finché non decide) — `docs/24` §8.11.1,
   *    «il nome serve alla lettura, mai all'abbinamento automatico».
   */
  protected opzioniSede(location: ShopifySetupLocationDto): readonly SelectMenuOption[] {
    const sedi = this.sedi().filter(
      (sede) =>
        sede.shopifyLocationId === null || sede.shopifyLocationId === location.shopifyLocationId,
    );
    const omonima = (sede: ShopifySetupSedeVestiFlowDto): boolean =>
      stessoNome(sede.name, location.name);
    const collega = [...sedi]
      .sort((a, b) => Number(omonima(b)) - Number(omonima(a)))
      .map((sede): SelectMenuOption => ({
        value: `${PREFISSO_COLLEGA}${sede.id}`,
        label: `Collega alla sede «${sede.name}»`,
        triggerLabel: `Collega alla sede «${sede.name}»`,
        ...(omonima(sede)
          ? { detail: 'stesso nome della location: suggerita, non applicata' }
          : {}),
      }));
    const conOmonima = sedi.some(omonima);
    return [
      ...collega,
      {
        value: VALORE_CREA,
        label: `Crea una nuova sede «${location.name}»`,
        triggerLabel: `Crea una nuova sede «${location.name}»`,
        detail: conOmonima
          ? 'una sede in più, oltre a quella con lo stesso nome'
          : 'nasce una sede VestiFlow nuova, collegata a questa location',
      },
      {
        value: VALORE_LASCIA,
        label: 'Lascia fuori da VestiFlow',
        detail: 'nessuna sede: non risulta da configurare',
      },
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
