import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { LocationContextService } from '@core/services/location-context.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';
import { SalesOrderFulfillmentStatus } from '@core/models/sales-order.model';
import type { SalesOrder } from '@core/models/sales-order.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder } from '@core/models/supplier-order.model';
import { isLowStock } from '@core/utils/inventory.util';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { StatCardComponent } from '@shared/components/stat-card/stat-card.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { InventoryService } from '@features/inventory/services/inventory.service';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { SupplierOrderService } from '@features/orders/services/supplier-order.service';
import { SalesOrderService } from '@features/sales-orders/services/sales-order.service';

import { LowStockTableComponent } from './components/low-stock-table/low-stock-table.component';
import { RecentSalesTableComponent } from './components/recent-sales-table/recent-sales-table.component';
import type { LowStockRow, RecentSaleRow } from './models/dashboard-view.model';

// I mock sono piccoli: una pagina larga copre l'intero dataset.
// Col backend reale la dashboard avra' endpoint aggregati dedicati.
const WIDE_PAGE_SIZE = 100;
const LOW_STOCK_LIMIT = 8;
const RECENT_SALES_LIMIT = 6;

interface DashboardData {
  readonly levels: readonly InventoryLevel[];
  readonly locations: readonly Location[];
  readonly summaries: readonly VariantSummary[];
  readonly salesOrders: readonly SalesOrder[];
  readonly supplierOrders: readonly SupplierOrder[];
}

type DashboardState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: DashboardData }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Dashboard operativa (smart): KPI, varianti sotto soglia e ultime vendite,
 * aggregati client-side dai service mock.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ErrorStateComponent,
    StatCardComponent,
    TableSkeletonComponent,
    LowStockTableComponent,
    RecentSalesTableComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly productService = inject(ProductService);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly supplierOrderService = inject(SupplierOrderService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);

  /** Nome della location attiva (per contestualizzare i KPI di stock). */
  protected readonly activeLocationName = computed(() => {
    const id = this.locationContext.activeLocationId();
    if (!id) {
      return null;
    }
    return this.data()?.locations.find((location) => location.id === id)?.name ?? null;
  });

  private readonly refreshTick = signal(0);

  private readonly state = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() =>
        forkJoin({
          levels: this.inventoryService.getLevels(),
          locations: this.inventoryService.getLocations(),
          summaries: this.productService.getVariantSummaries(),
          salesOrders: this.salesOrderService
            .getSalesOrders({ page: 1, pageSize: WIDE_PAGE_SIZE })
            .pipe(map((response) => response.data)),
          supplierOrders: this.supplierOrderService
            .getSupplierOrders({ page: 1, pageSize: WIDE_PAGE_SIZE })
            .pipe(map((response) => response.data)),
        }).pipe(
          map((data): DashboardState => ({ status: 'success', data })),
          startWith<DashboardState>({ status: 'loading' }),
          catchError((err: unknown) =>
            of<DashboardState>({ status: 'error', error: this.toAppError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies DashboardState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  private readonly data = computed<DashboardData | null>(() => {
    const current = this.state();
    return current.status === 'success' ? current.data : null;
  });

  /** Giacenze visibili: filtrate per la location attiva del topbar. */
  private readonly visibleLevels = computed<readonly InventoryLevel[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const activeId = this.locationContext.activeLocationId();
    return activeId ? data.levels.filter((level) => level.locationId === activeId) : data.levels;
  });

  // ── KPI ─────────────────────────────────────────────────────────────────────
  protected readonly productCountLabel = computed(() => {
    const data = this.data();
    if (!data) {
      return '0';
    }
    return String(new Set(data.summaries.map((summary) => summary.productId)).size);
  });

  protected readonly availableUnitsLabel = computed(() =>
    String(this.visibleLevels().reduce((sum, level) => sum + level.available, 0)),
  );

  protected readonly lowStockCountLabel = computed(() => String(this.lowStockRows().length));

  protected readonly incomingOrdersLabel = computed(() => {
    const data = this.data();
    if (!data) {
      return '0';
    }
    return String(
      data.supplierOrders.filter(
        (order) =>
          order.status === SupplierOrderStatus.Sent ||
          order.status === SupplierOrderStatus.PartiallyReceived,
      ).length,
    );
  });

  protected readonly toFulfillLabel = computed(() => {
    const data = this.data();
    if (!data) {
      return '0';
    }
    return String(
      data.salesOrders.filter(
        (order) => order.fulfillmentStatus !== SalesOrderFulfillmentStatus.Fulfilled,
      ).length,
    );
  });

  // ── Liste ───────────────────────────────────────────────────────────────────
  protected readonly lowStockRows = computed<readonly LowStockRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const summaryByVariant = new Map(data.summaries.map((summary) => [summary.variantId, summary]));
    const locationById = new Map(data.locations.map((location) => [location.id, location]));
    return this.visibleLevels()
      .filter((level) => isLowStock(level))
      .sort((a, b) => a.available - b.available)
      .map((level): LowStockRow => {
        const summary = summaryByVariant.get(level.variantId);
        return {
          variantId: level.variantId,
          locationId: level.locationId,
          sku: summary?.sku ?? level.variantId,
          title: summary?.title ?? 'Variante sconosciuta',
          locationName: locationById.get(level.locationId)?.name ?? level.locationId,
          available: level.available,
          minThreshold: level.minThreshold,
        };
      });
  });

  protected readonly lowStockPreview = computed(() =>
    this.lowStockRows().slice(0, LOW_STOCK_LIMIT),
  );

  protected readonly recentSales = computed<readonly RecentSaleRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    return [...data.salesOrders]
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
      .slice(0, RECENT_SALES_LIMIT)
      .map(
        (order): RecentSaleRow => ({
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          placedAt: order.placedAt,
          financialStatus: order.financialStatus,
          total: order.total,
        }),
      );
  });

  protected openSale(row: RecentSaleRow): void {
    void this.router.navigate(['/app/sales', row.orderId]);
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
