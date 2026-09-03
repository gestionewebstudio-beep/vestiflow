import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AuthService } from '@core/auth';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { canAccessSalesSection, canViewDocFamily } from '@core/permissions/tenant-permissions.util';
import { reportPageSubtitle } from '@core/models/tenant-channel-profile.model';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { BusinessAnalyticsPanelComponent } from '@domain/analytics/components/business-analytics-panel/business-analytics-panel.component';
import {
  InventoryService,
  type LocationInventoryReportRow,
} from '@domain/inventory/services/inventory.service';

import { ReportLocationTableComponent } from './components/report-location-table/report-location-table.component';
import type { LocationReportRow } from './models/report-view.model';

interface ReportData {
  readonly locationReport: readonly LocationInventoryReportRow[];
}

type ReportState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: ReportData }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Report operativi: snapshot di magazzino e pannello analitico.
 *
 * ⛔ **Il vecchio «Export Corrispettivi» è stato rimosso il 03/09/2026.**
 * Costruiva il file dai movimenti moltiplicati per il prezzo di LISTINO
 * CORRENTE, quindi lo stesso periodo valeva importi diversi a ogni cambio di
 * listino — su un file che va al commercialista. Il Registro canonico
 * (Vendite → Corrispettivi) è l'unica fonte, e il link in cima ci porta.
 *
 * ⚠️ Con quel blocco è sparito anche **tutto l'apparato del periodo** di questa
 * pagina — selettore, date personalizzate, sincronizzazione con l'URL: serviva
 * soltanto a lui. Le giacenze sono uno snapshot corrente e non lo usano, e il
 * pannello analitico ha il proprio, che qui era spento (`hidePeriodFilter`)
 * perché glielo forniva la card.
 */
@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ErrorStateComponent,
    BusinessAnalyticsPanelComponent,
    TableSkeletonComponent,
    ReportLocationTableComponent,
  ],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly authService = inject(AuthService);

  private readonly refreshTick = signal(0);

  private readonly tenantProfile = computed(
    () => this.authService.currentUser()?.tenantChannelProfile,
  );

  protected readonly pageSubtitle = computed(() => reportPageSubtitle(this.tenantProfile()));

  /**
   * ⛔ **Il link al Registro non si mostra a chi può ESPORTARE: a chi può
   * ENTRARE.** Erano due domande diverse tenute per una sola.
   *
   * Il predicato è lo stesso che usa la voce di sidebar «Corrispettivi», ed è
   * la traduzione di `ONLINE_SALES_VIEW_GROUPS` — i permessi che la rotta
   * canonica pretende. Con `canExportOperationalData` il link compariva anche
   * a chi la guardia poi rimbalzava in dashboard.
   */
  protected readonly canOpenCorrispettiviRegister = computed(() => {
    const user = this.authService.currentUser();
    return canAccessSalesSection(user) && canViewDocFamily(user, 'online_sale');
  });

  private readonly request = computed(() => ({
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(() =>
        this.inventoryService.getLocationInventoryReport().pipe(
          map((locationReport): ReportState => ({
            status: 'success',
            data: { locationReport },
          })),
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

  protected readonly locationRows = computed<readonly LocationReportRow[]>(() => {
    const data = this.data();
    if (!data) {
      return [];
    }
    return data.locationReport.map((row): LocationReportRow => ({
      locationId: row.locationId,
      locationName: row.locationName,
      trackedVariants: row.trackedVariants,
      availableUnits: row.availableUnits,
      lowStockCount: row.lowStockCount,
      stockValue: {
        amountMinor: row.stockValueMinor,
        currencyCode: row.currencyCode || DEFAULT_CURRENCY,
      },
    }));
  });

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
