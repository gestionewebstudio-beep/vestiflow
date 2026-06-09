import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import type { Money } from '@core/models/common.model';
import { SalesOrderFinancialStatus } from '@core/models/sales-order.model';
import type { SalesOrder } from '@core/models/sales-order.model';
import { isLowStock } from '@core/utils/inventory.util';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { StatCardComponent } from '@shared/components/stat-card/stat-card.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { InventoryService } from '@features/inventory/services/inventory.service';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { SalesOrderService } from '@features/sales-orders/services/sales-order.service';

import { ReportLocationTableComponent } from './components/report-location-table/report-location-table.component';
import { ReportSalesTableComponent } from './components/report-sales-table/report-sales-table.component';
import type { LocationReportRow, SalesReportRow } from './models/report-view.model';

// Le vendite mock sono poche: una pagina larga copre l'intero dataset.
// Col backend reale i report avranno endpoint aggregati dedicati.
const REPORT_SALES_PAGE_SIZE = 100;

interface ReportData {
  readonly levels: readonly InventoryLevel[];
  readonly locations: readonly Location[];
  readonly summaries: readonly VariantSummary[];
  readonly orders: readonly SalesOrder[];
}

type ReportState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ReportData }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Report base (smart): KPI di magazzino e vendite aggregati client-side dai
 * service mock. Read-only, nessun filtro persistente in questa prima versione.
 */
@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ErrorStateComponent,
    StatCardComponent,
    TableSkeletonComponent,
    ReportLocationTableComponent,
    ReportSalesTableComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly productService = inject(ProductService);
  private readonly salesOrderService = inject(SalesOrderService);

  private readonly refreshTick = signal(0);

  private readonly state = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() =>
        forkJoin({
          levels: this.inventoryService.getLevels(),
          locations: this.inventoryService.getLocations(),
          summaries: this.productService.getVariantSummaries(),
          orders: this.salesOrderService
            .getSalesOrders({ page: 1, pageSize: REPORT_SALES_PAGE_SIZE })
            .pipe(map((response) => response.data)),
        }).pipe(
          map((data): ReportState => ({ status: 'success', data })),
          startWith<ReportState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<ReportState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies ReportState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  private readonly data = computed<ReportData | null>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data : null;
  });

  /** Aggregato giacenze per location (valore a prezzo di vendita). */
  protected readonly locationRows = computed<readonly LocationReportRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const priceByVariant = new Map(
      data.summaries.map((summary) => [summary.variantId, summary.sellingPrice]),
    );
    return data.locations.map((location): LocationReportRow => {
      const levels = data.levels.filter((level) => level.locationId === location.id);
      const stockValueMinor = levels.reduce((sum, level) => {
        const price = priceByVariant.get(level.variantId);
        return sum + Math.max(0, level.available) * (price?.amountMinor ?? 0);
      }, 0);
      return {
        locationId: location.id,
        locationName: location.name,
        trackedVariants: levels.length,
        availableUnits: levels.reduce((sum, level) => sum + level.available, 0),
        lowStockCount: levels.filter((level) => isLowStock(level)).length,
        stockValue: { amountMinor: stockValueMinor, currencyCode: DEFAULT_CURRENCY },
      };
    });
  });

  /** Aggregato vendite per stato pagamento (solo stati presenti nei dati). */
  protected readonly salesRows = computed<readonly SalesReportRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const byStatus = new Map<SalesOrder['financialStatus'], SalesReportRow>();
    for (const order of data.orders) {
      const existing = byStatus.get(order.financialStatus);
      const units = order.lines.reduce((sum, line) => sum + line.quantity, 0);
      if (existing) {
        byStatus.set(order.financialStatus, {
          status: order.financialStatus,
          orders: existing.orders + 1,
          units: existing.units + units,
          total: {
            amountMinor: existing.total.amountMinor + order.total.amountMinor,
            currencyCode: existing.total.currencyCode,
          },
        });
      } else {
        byStatus.set(order.financialStatus, {
          status: order.financialStatus,
          orders: 1,
          units,
          total: order.total,
        });
      }
    }
    return [...byStatus.values()].sort((a, b) => b.total.amountMinor - a.total.amountMinor);
  });

  // ── KPI ─────────────────────────────────────────────────────────────────────
  protected readonly stockValueLabel = computed(() => {
    const totalMinor = this.locationRows().reduce(
      (sum, row) => sum + row.stockValue.amountMinor,
      0,
    );
    return formatMoney(this.eur(totalMinor));
  });

  protected readonly availableUnitsLabel = computed(() =>
    String(this.locationRows().reduce((sum, row) => sum + row.availableUnits, 0)),
  );

  protected readonly lowStockLabel = computed(() =>
    String(this.locationRows().reduce((sum, row) => sum + row.lowStockCount, 0)),
  );

  protected readonly revenueLabel = computed(() => {
    const data = this.data();
    if (!data) {
      return formatMoney(this.eur(0));
    }
    // Fatturato lordo: ordini pagati o rimborsati parzialmente.
    const totalMinor = data.orders
      .filter(
        (order) =>
          order.financialStatus === SalesOrderFinancialStatus.Paid ||
          order.financialStatus === SalesOrderFinancialStatus.PartiallyRefunded,
      )
      .reduce((sum, order) => sum + order.total.amountMinor, 0);
    return formatMoney(this.eur(totalMinor));
  });

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  private eur(amountMinor: number): Money {
    return { amountMinor, currencyCode: DEFAULT_CURRENCY };
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
