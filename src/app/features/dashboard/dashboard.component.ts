import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { LocationContextService } from '@core/services/location-context.service';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { SalesOrderFulfillmentStatus } from '@core/models/sales-order.model';
import type { SalesOrder } from '@core/models/sales-order.model';
import { showShopifyIntegration } from '@core/models/tenant-channel-profile.model';
import { isLowStock } from '@core/utils/inventory.util';
import { formatDateTimeShort } from '@core/utils/date.util';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { StatCardComponent } from '@shared/components/stat-card/stat-card.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';

import { SalesOrderService } from '@features/sales-orders/services/sales-order.service';
import {
  shopifyConnectionStatusLabel,
  shopifyConnectionStatusTone,
} from '@features/integrations/shopify/models/shopify-connection-labels.util';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';

import { LowStockTableComponent } from './components/low-stock-table/low-stock-table.component';
import { RecentSalesTableComponent } from './components/recent-sales-table/recent-sales-table.component';
import type { DashboardLevel, DashboardSummary } from './models/dashboard-summary.model';
import type { LowStockRow, RecentSaleRow } from './models/dashboard-view.model';
import { DashboardService } from './services/dashboard.service';

// I mock vendite sono piccoli: una pagina larga copre l'intero dataset
// (Shopify e' owner delle vendite: niente endpoint di scrittura lato gestionale).
const WIDE_PAGE_SIZE = 100;
const LOW_STOCK_LIMIT = 8;
const RECENT_SALES_LIMIT = 6;

interface DashboardData {
  readonly summary: DashboardSummary;
  readonly salesOrders: readonly SalesOrder[];
}

type DashboardState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: DashboardData }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Dashboard operativa (smart): KPI, varianti sotto soglia e ultime vendite.
 * I KPI di magazzino arrivano da un solo endpoint aggregato; le vendite sono
 * ancora mock (owner Shopify). Il filtro per location resta client-side.
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
    BadgeComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly authService = inject(AuthService);
  private readonly locationContext = inject(LocationContextService);
  private readonly router = inject(Router);

  protected readonly connectionStatusLabel = shopifyConnectionStatusLabel;
  protected readonly connectionStatusTone = shopifyConnectionStatusTone;
  protected readonly formatDateTimeShort = formatDateTimeShort;

  protected readonly showShopifyPanel = computed(() =>
    showShopifyIntegration(this.authService.currentUser()?.tenantChannelProfile),
  );

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null },
  );

  protected readonly shopifyConnectionSummary = computed(() => this.shopifyConnection());

  /** Nome della location attiva (per contestualizzare i KPI di stock). */
  protected readonly activeLocationName = computed(() => {
    const id = this.locationContext.activeLocationId();
    if (!id) {
      return null;
    }
    return this.data()?.summary.locations.find((location) => location.id === id)?.name ?? null;
  });

  private readonly refreshTick = signal(0);

  private readonly state = toSignal(
    toObservable(this.refreshTick).pipe(
      switchMap(() =>
        forkJoin({
          summary: this.dashboardService.getSummary(),
          salesOrders: this.salesOrderService
            .getSalesOrders({ page: 1, pageSize: WIDE_PAGE_SIZE })
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
  private readonly visibleLevels = computed<readonly DashboardLevel[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    const activeId = this.locationContext.activeLocationId();
    return activeId
      ? data.summary.levels.filter((level) => level.locationId === activeId)
      : data.summary.levels;
  });

  // ── KPI ─────────────────────────────────────────────────────────────────────
  protected readonly productCountLabel = computed(() =>
    String(this.data()?.summary.productCount ?? 0),
  );

  protected readonly availableUnitsLabel = computed(() =>
    String(this.visibleLevels().reduce((sum, level) => sum + level.available, 0)),
  );

  protected readonly lowStockCountLabel = computed(() => String(this.lowStockRows().length));

  protected readonly incomingOrdersLabel = computed(() =>
    String(this.data()?.summary.incomingSupplierOrders ?? 0),
  );

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
  protected readonly lowStockRows = computed<readonly LowStockRow[]>(() =>
    [...this.visibleLevels()]
      .filter((level) => isLowStock(level))
      .sort((a, b) => a.available - b.available)
      .map(
        (level): LowStockRow => ({
          variantId: level.variantId,
          locationId: level.locationId,
          sku: level.sku,
          title: level.title,
          locationName: level.locationName,
          available: level.available,
          minThreshold: level.minThreshold,
        }),
      ),
  );

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
