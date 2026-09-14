import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import type { Location } from '@core/models/location.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { isShopifyManagedLocation } from '@core/utils/location-selection.util';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/** Un gruppo di sedi: titolo, spiegazione e le sue righe. */
interface GruppoSedi {
  readonly id: string;
  readonly titolo: string;
  readonly spiegazione: string;
  readonly righe: readonly Location[];
  /** Le colonne che il gruppo mostra: le disattivate e la locale non hanno Shopify. */
  readonly colonne: readonly ResolvedTableColumn[];
}

/**
 * Elenco delle sedi del tenant (dumb puro, in sola lettura).
 *
 * ⭐ **Sul MOTORE comune** (`docs/26` A7, 11/09/2026): erano QUATTRO `<table>`
 *    scritte a mano — una per gruppo più quella piatta — con la stessa griglia
 *    ricopiata quattro volte. Ora ogni gruppo è un `app-data-table`: stessa
 *    grammatica delle altre tabelle, ordinamento dalle intestazioni, card sotto
 *    `lg` con la sede in testa e lo stato come ancora.
 *
 * ⚠️ **Senza vista di colonne e senza filtri, di proposito**: sono al più una
 *    manciata di righe, e le colonne dipendono dal PROFILO del tenant
 *    (`showShopifyColumn`, `showLicensedColumn`), non da una preferenza
 *    dell'operatore. Un selettore Colonne e un pulsante Filtri su tre righe
 *    sarebbero comandi senza significato.
 *
 * ⚠️ **I gruppi restano tre tabelle, non tre sezioni di una**: ogni gruppo porta
 *    una SPIEGAZIONE («se ne rimuovi una da Shopify, premi Sincronizza…») che
 *    una sezione del motore non ha dove mettere, e che è la parte utile.
 */
@Component({
  selector: 'app-location-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, DataTableComponent, DataTableCellDirective, DataTableRowCardDirective],
  templateUrl: './location-table.component.html',
  styleUrl: './location-table.component.scss',
})
export class LocationTableComponent {
  readonly locations = input.required<readonly Location[]>();
  readonly showShopifyColumn = input(true);
  readonly showLicensedColumn = input(false);
  readonly groupByShopifySource = input(false);

  protected readonly rowId = (location: Location): string => location.id;

  /** Un ordinamento per tabella: sono tabelle diverse, e non si contaminano. */
  protected readonly ordini = signal<Readonly<Record<string, readonly DataTableSort[]>>>({});

  protected readonly testoCella = (location: Location, colonna: string): string => {
    switch (colonna) {
      case 'name':
        return location.name;
      case 'address':
        return this.formatAddress(location);
      case 'code':
        return location.code ?? '—';
      case 'status':
        return location.isActive ? 'Attiva' : 'Disattivata';
      case 'shopify':
        return this.shopifyLabel(location);
      case 'licensed':
        return this.licensedLabel(location);
      default:
        return '';
    }
  };

  private readonly colonneBase: readonly ResolvedTableColumn[] = [
    { id: 'name', label: 'Nome', defaultVisible: true, cardTitle: true, pinned: false },
    { id: 'address', label: 'Indirizzo', defaultVisible: true, pinned: false },
    { ...colonna('code', { defaultVisible: true, defaultWidthPx: 120 }), pinned: false },
    { ...colonna('status', { defaultVisible: true, defaultWidthPx: 120 }), pinned: false },
  ];
  private readonly colonnaShopify: ResolvedTableColumn = {
    id: 'shopify',
    label: 'Shopify',
    defaultVisible: true,
    defaultWidthPx: 140,
    pinned: false,
  };
  private readonly colonnaLicenza: ResolvedTableColumn = {
    id: 'licensed',
    label: 'VestiFlow',
    defaultVisible: true,
    defaultWidthPx: 120,
    pinned: false,
  };

  private readonly shopifyLocations = computed(() =>
    this.locations().filter((location) => location.isActive && isShopifyManagedLocation(location)),
  );

  private readonly archivedShopifyLocations = computed(() =>
    this.locations().filter((location) => !location.isActive && isShopifyManagedLocation(location)),
  );

  private readonly localLocations = computed(() =>
    this.locations().filter((location) => location.isActive && !isShopifyManagedLocation(location)),
  );

  private readonly useGroupedLayout = computed(
    () => this.groupByShopifySource() && this.showShopifyColumn(),
  );

  /** I gruppi da rendere, ciascuno con le proprie colonne; vuoti esclusi. */
  protected readonly gruppi = computed<readonly GruppoSedi[]>(() => {
    if (!this.useGroupedLayout()) {
      return [
        {
          id: 'tutte',
          titolo: '',
          spiegazione: '',
          righe: this.locations(),
          colonne: this.showShopifyColumn()
            ? [...this.colonneBase, this.colonnaShopify]
            : this.colonneBase,
        },
      ];
    }
    const conShopify = this.showLicensedColumn()
      ? [...this.colonneBase, this.colonnaShopify, this.colonnaLicenza]
      : [...this.colonneBase, this.colonnaShopify];
    return [
      {
        id: 'shopify',
        titolo: 'Sedi Shopify',
        spiegazione:
          'Sedi operative attive su Shopify (stesso elenco visibile in Shopify Admin → Sedi). Se ne rimuovi una da Shopify, premi «Sincronizza location» in VestiFlow per aggiornare l’elenco.',
        righe: this.shopifyLocations(),
        colonne: conShopify,
      },
      {
        id: 'archiviate',
        titolo: 'Sedi Shopify disattivate',
        spiegazione:
          'Non compaiono nel selettore in alto. Restano in archivio solo se avevano giacenze o movimenti collegati.',
        righe: this.archivedShopifyLocations(),
        colonne: this.colonneBase,
      },
      {
        id: 'locale',
        titolo: 'Sede locale',
        spiegazione:
          'Creata in fase di registrazione del cliente su VestiFlow. Non è una sede Shopify: il nome dell’azienda (es. il cliente che hai registrato) non compare in Shopify Admin.',
        righe: this.localLocations(),
        colonne: this.colonneBase,
      },
    ].filter((gruppo) => gruppo.righe.length > 0);
  });

  protected sezioniDi(gruppo: GruppoSedi): readonly DataTableSection<Location>[] {
    return [
      {
        id: gruppo.id,
        rows: ordinaPerColonne(gruppo.righe, this.ordineDi(gruppo.id), {
          cellText: this.testoCella,
        }),
      },
    ];
  }

  protected ordineDi(id: string): readonly DataTableSort[] {
    return this.ordini()[id] ?? [];
  }

  protected ordina(id: string, ordine: readonly DataTableSort[]): void {
    this.ordini.set({ ...this.ordini(), [id]: ordine });
  }

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
        // Collegata (l'id segue la coppia) ma con i dati non ancora letti da
        // Shopify: non è «non collegata» (13/09/2026).
        return location.shopify?.shopifyId ? 'Collegata' : 'Non collegata';
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
        return location.shopify?.shopifyId ? 'info' : 'neutral';
    }
  }

  protected licensedLabel(location: Location): string {
    return location.licensedInVf ? 'Attiva in VF' : 'Non attiva';
  }

  protected licensedTone(location: Location): BadgeTone {
    return location.licensedInVf ? 'success' : 'neutral';
  }
}
