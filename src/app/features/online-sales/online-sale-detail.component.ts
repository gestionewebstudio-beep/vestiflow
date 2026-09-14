import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { Money } from '@core/models/money.model';
import { formatDate, formatDateTime } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import {
  ChannelOrderRettificheComponent,
  type QuantitaRiga,
  type RettificaCanale,
} from '@domain/sales-orders/components/channel-order-rettifiche/channel-order-rettifiche.component';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableSection,
  DataTableSort,
} from '@shared/components/data-table/data-table.model';
import { DetailFactsComponent } from '@shared/components/detail-facts/detail-facts.component';
import type { DetailFact } from '@shared/components/detail-facts/detail-facts.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { colonna } from '@shared/table-columns/column-catalog';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import {
  onlineSaleInventoryStatusLabel,
  onlineSaleInventoryStatusTone,
} from '@domain/sales-orders/models/sales-order-labels.util';

import type { OnlineSaleDetail, OnlineSaleMovementRow } from './models/online-sale.model';
import { OnlineSalesService } from './services/online-sales.service';

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly sale: OnlineSaleDetail }
  | { readonly status: 'not-found' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Dettaglio Vendita online (fase 3 §4): righe con quantità/prezzi/IVA,
 * movimenti collegati (impegni consumati inclusi), ordine origine, dati
 * canale ed eventuale DDT. Snapshot read-only.
 */
@Component({
  selector: 'app-online-sale-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackButtonComponent,
    BadgeComponent,
    ChannelOrderRettificheComponent,
    DetailFactsComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    DataTableComponent,
    DataTableRowCardDirective,
  ],
  templateUrl: './online-sale-detail.component.html',
  styleUrl: './online-sale-detail.component.scss',
})
export class OnlineSaleDetailComponent {
  private readonly service = inject(OnlineSalesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly listPath = '/app/sales/online';
  protected readonly skeletonColumns = 4;

  protected readonly inventoryLabel = onlineSaleInventoryStatusLabel;
  protected readonly inventoryTone = onlineSaleInventoryStatusTone;
  protected readonly formatDate = formatDate;

  // ── I movimenti collegati, sul MOTORE comune (`docs/26` A16) ─────────────
  // Le righe della vendita restano una griglia documentale (grammatica delle
  // maschere, già condivisa); i movimenti sono un piccolo ELENCO di
  // registrazioni: colonne dal catalogo, ordinamento, card sotto `lg`.
  protected readonly ordineMovimenti = signal<readonly DataTableSort[]>([]);
  protected readonly rigaMovimentoId = (m: OnlineSaleMovementRow): string => m.id;
  protected readonly colonneMovimenti: readonly ResolvedTableColumn[] = [
    { ...colonna('type', { defaultVisible: true, cardTitle: true }), pinned: false },
    {
      id: 'quantity',
      label: 'Quantità',
      numeric: true,
      defaultVisible: true,
      defaultWidthPx: 100,
      pinned: false,
    },
    { ...colonna('location', { defaultVisible: true, defaultWidthPx: 180 }), pinned: false },
    { ...colonna('documentDate', { defaultVisible: true, defaultWidthPx: 130 }), pinned: false },
  ];
  protected readonly testoMovimento = (m: OnlineSaleMovementRow, colonna: string): string => {
    switch (colonna) {
      case 'type':
        return this.movementTypeLabel(m.type);
      case 'quantity':
        return String(m.quantity);
      case 'location':
        return m.locationName;
      case 'documentDate':
        return formatDate(m.createdAt);
      default:
        return '';
    }
  };
  private readonly numeroMovimento = (m: OnlineSaleMovementRow, colonna: string): number | null =>
    colonna === 'quantity' ? m.quantity : null;
  private readonly dataMovimento = (m: OnlineSaleMovementRow, colonna: string): string | null =>
    colonna === 'documentDate' ? m.createdAt : null;
  protected readonly sezioniMovimenti = computed<
    readonly DataTableSection<OnlineSaleMovementRow>[]
  >(() => [
    {
      id: 'movimenti',
      rows: ordinaPerColonne(this.sale()?.movements ?? [], this.ordineMovimenti(), {
        cellText: this.testoMovimento,
        numeroDi: this.numeroMovimento,
        dataDi: this.dataMovimento,
      }),
    },
  ]);

  private readonly refreshTick = signal(0);

  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly request = computed(() => ({
    id: this.params().get('id') ?? '',
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.service.getOnlineSaleById(id).pipe(
          map((sale): DetailState => ({ status: 'success', sale })),
          startWith<DetailState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.errorToState(err))),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly notFound = computed(() => this.state().status === 'not-found');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly sale = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.sale : null;
  });

  /** Dati canale e ordine origine (fase 3 §4). */
  protected readonly facts = computed<readonly DetailFact[]>(() => {
    const sale = this.sale();
    if (!sale) {
      return [];
    }
    const facts: DetailFact[] = [
      { label: 'Canale', value: sale.channelLabel },
      {
        label: 'Ordine origine',
        value: sale.orderNumber,
        href: `/app/sales/${sale.salesOrderId}`,
        linkLabel: 'Apri ordine',
      },
      { label: 'ID ordine canale', value: sale.externalOrderId, numeric: true },
      { label: 'Data ordine', value: formatDateTime(sale.orderPlacedAt), numeric: true },
      { label: 'Data evasione', value: formatDateTime(sale.fulfilledAt), numeric: true },
      { label: 'Cliente', value: sale.customerName },
      { label: 'Indirizzo', value: sale.customerAddress ?? '—' },
      { label: 'Sede', value: sale.locationName ?? '—' },
      { label: 'Stato pagamento', value: sale.paymentStatus },
    ];
    if (sale.externalFulfillmentId) {
      facts.push({
        label: 'ID evasione canale',
        value: sale.externalFulfillmentId,
        numeric: true,
      });
    }
    for (const doc of sale.linkedDocuments) {
      facts.push({
        label: 'DDT collegato',
        value: doc.reference ?? 'DDT vendita',
        href: `/app/documents/${doc.id}`,
        linkLabel: 'Apri documento',
      });
    }
    return facts;
  });

  /** Le rettifiche e le quantità nella forma del blocco condiviso con l'Ordine di canale. */
  protected readonly rettifiche = computed((): readonly RettificaCanale[] => {
    const s = this.sale();
    return s
      ? s.refunds.map((r) => ({
          id: r.id,
          kind: r.kind,
          occurredAt: r.occurredAt,
          total: { amountMinor: r.totalMinor, currencyCode: s.currency },
          note: r.note,
        }))
      : [];
  });
  protected readonly quantita = computed((): readonly QuantitaRiga[] => {
    const s = this.sale();
    return s
      ? s.lines.map((l) => ({
          id: l.id,
          description: l.description,
          ordered: l.orderedQuantity,
          cancelled: l.cancelledQuantity,
          shipped: l.shippedQuantity,
        }))
      : [];
  });
  protected readonly valoreOriginario = computed(() => {
    const s = this.sale();
    return { amountMinor: s?.totalMinor ?? 0, currencyCode: s?.currency ?? 'EUR' };
  });
  /** Somma e totale aggiornato arrivano dall'API (la somma è di testata dell'ordine). */
  protected readonly sommaRettifiche = computed(() => {
    const s = this.sale();
    return { amountMinor: s?.refundTotalMinor ?? 0, currencyCode: s?.currency ?? 'EUR' };
  });
  protected readonly totaleAggiornato = computed(() => {
    const s = this.sale();
    return {
      amountMinor: s?.updatedTotalMinor ?? s?.totalMinor ?? 0,
      currencyCode: s?.currency ?? 'EUR',
    };
  });

  protected money(amountMinor: number): string {
    const sale = this.sale();
    const money: Money = { amountMinor, currencyCode: sale?.currency ?? 'EUR' };
    return formatMoney(money);
  }

  /** Etichetta Codice IVA riconosciuto per corrispondenza inversa, altrimenti solo l'aliquota grezza. */
  protected vatLabel(line: {
    readonly vatCodeLabel: string | null;
    readonly vatRatePercent: number | null;
  }): string {
    if (line.vatCodeLabel) {
      return line.vatCodeLabel;
    }
    return line.vatRatePercent == null ? '—' : `${line.vatRatePercent}%`;
  }

  protected movementTypeLabel(type: string): string {
    switch (type) {
      case 'online_sale':
        return 'Vendita online (scarico)';
      case 'return':
        return 'Reso';
      default:
        return type;
    }
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToList(): void {
    void this.router.navigateByUrl(this.listPath);
  }

  private errorToState(err: unknown): DetailState {
    const appError = this.toAppError(err);
    if (appError.kind === AppErrorKind.NotFound) {
      return { status: 'not-found' };
    }
    return { status: 'error', error: appError };
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
