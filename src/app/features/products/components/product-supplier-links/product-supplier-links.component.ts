import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { canManageCatalog } from '@core/permissions/tenant-permissions.util';
import type { EntityId } from '@core/models/common.model';
import type { SupplierVariantLink } from '@core/models/supplier.model';
import { formatMoney } from '@core/utils/money.util';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/**
 * I fornitori collegati alle varianti dell'articolo, nella scheda prodotto.
 *
 * ⭐ **Sul MOTORE comune** (`docs/26` A15, 11/09/2026): era una `<table>` a mano
 *    con la propria griglia. È un piccolo elenco di consultazione dentro una
 *    scheda: colonne dal catalogo (Fornitore, SKU), ordinamento, card sotto
 *    `lg`; senza vista di colonne, filtri o totali — un prezzo di acquisto per
 *    fornitore non si somma, e su cinque righe un filtro non filtra niente.
 */
@Component({
  selector: 'app-product-supplier-links',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyStateComponent,
    TableSkeletonComponent,
    DataTableComponent,
    DataTableRowCardDirective,
  ],
  templateUrl: './product-supplier-links.component.html',
  styleUrl: './product-supplier-links.component.scss',
})
export class ProductSupplierLinksComponent {
  private readonly supplierService = inject(SupplierService);
  private readonly authService = inject(AuthService);

  readonly productId = input.required<EntityId>();

  protected readonly canManage = computed(() => canManageCatalog(this.authService.currentUser()));
  private readonly refreshTick = signal(0);

  private readonly request = computed(() => ({
    id: this.productId(),
    tick: this.refreshTick(),
  }));

  private readonly linksState = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.supplierService.getVariantLinksByProduct(id).pipe(
          map((links) => ({ status: 'success' as const, links })),
          startWith({ status: 'loading' as const, links: [] as readonly SupplierVariantLink[] }),
          catchError(() =>
            of({ status: 'error' as const, links: [] as readonly SupplierVariantLink[] }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' as const, links: [] as readonly SupplierVariantLink[] } },
  );

  protected readonly loading = computed(() => this.linksState().status === 'loading');
  protected readonly links = computed(() => this.linksState().links);

  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  protected readonly rowId = (link: SupplierVariantLink): string => link.id;

  protected readonly colonne: readonly ResolvedTableColumn[] = [
    { ...colonna('supplier', { defaultVisible: true, cardTitle: true }), pinned: false },
    {
      ...colonna('sku', { display: 'code', defaultVisible: true, defaultWidthPx: 140 }),
      pinned: false,
    },
    {
      id: 'supplierSku',
      label: 'Codice fornitore',
      display: 'code',
      defaultVisible: true,
      defaultWidthPx: 150,
      pinned: false,
    },
    {
      id: 'preferred',
      label: 'Preferenziale',
      defaultVisible: true,
      defaultWidthPx: 110,
      pinned: false,
    },
    {
      id: 'lastPrice',
      label: 'Ultimo prezzo',
      numeric: true,
      summable: false,
      defaultVisible: true,
      defaultWidthPx: 130,
      pinned: false,
    },
  ];

  protected readonly testoCella = (link: SupplierVariantLink, colonna: string): string => {
    switch (colonna) {
      case 'supplier':
        return link.supplier.name;
      case 'sku':
        return link.variant.sku;
      case 'supplierSku':
        return link.supplierSku ?? '—';
      case 'preferred':
        return link.isPreferred ? 'Sì' : 'No';
      case 'lastPrice':
        return this.formatPrice(link);
      default:
        return '';
    }
  };

  // Il prezzo si ordina sul valore in unità minori, non sul testo; l'assenza vale −∞.
  private readonly numeroDi = (link: SupplierVariantLink, colonna: string): number | null =>
    colonna === 'lastPrice' ? (link.lastPurchasePriceMinor ?? null) : null;

  protected readonly sezioni = computed<readonly DataTableSection<SupplierVariantLink>[]>(() => [
    {
      id: 'fornitori',
      rows: ordinaPerColonne(this.links(), this.ordine(), {
        cellText: this.testoCella,
        numeroDi: this.numeroDi,
      }),
    },
  ]);

  protected formatPrice(link: SupplierVariantLink): string {
    if (link.lastPurchasePriceMinor == null) {
      return '—';
    }
    return formatMoney({
      amountMinor: link.lastPurchasePriceMinor,
      currencyCode: link.currency,
    });
  }
}
