import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, map, of, switchMap, take } from 'rxjs';

import type { EntityId, IsoDateString, Money } from '@core/models/common.model';
import { DocumentStatus, DocumentType } from '@core/models/document.model';
import { SalesOrderFulfillmentStatus, SalesOrderSource } from '@core/models/sales-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import { SalesOrderService } from '@features/sales-orders/services/sales-order.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

import {
  INCLUDE_SOURCE_LABELS,
  IncludeSourceKind,
  includedPayloadFromQuote,
  includedPayloadFromSalesOrder,
  type IncludedDocumentPayload,
} from '../../models/document-include.util';
import { DocumentService } from '../../services/document.service';

const SEARCH_DEBOUNCE_MS = 300;
const LIST_PAGE_SIZE = 30;

/** Riga della lista documenti includibili (vista unificata Preventivo/Ordine). */
interface IncludableRow {
  readonly id: EntityId;
  readonly reference: string;
  readonly documentDate: IsoDateString;
  readonly customerName: string;
  readonly total: Money;
}

/**
 * Pannello «Includi documento» (logica trasversale): mostra i tipi di
 * documento compatibili col documento corrente e, scelto il tipo, l'elenco dei
 * documenti includibili. Alla scelta emette il payload normalizzato: riga di
 * testo descrittiva con il riferimento all'origine + righe articolo copiate.
 * I dati di testata restano quelli del documento corrente (mai sovrascritti).
 */
@Component({
  selector: 'app-document-include-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonComponent, EmptyStateComponent],
  templateUrl: './document-include-panel.component.html',
  styleUrl: './document-include-panel.component.scss',
})
export class DocumentIncludePanelComponent {
  /** Tipi di documento compatibili (mappa in document-include.util). */
  readonly sourceKinds = input.required<readonly IncludeSourceKind[]>();
  /** Incrementato a ogni apertura: reinizializza tipo scelto e ricerca. */
  readonly launchSeq = input(0);

  readonly included = output<IncludedDocumentPayload>();
  readonly dismissed = output<void>();

  private readonly documentService = inject(DocumentService);
  private readonly salesOrderService = inject(SalesOrderService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
  protected readonly kindLabels = INCLUDE_SOURCE_LABELS;

  protected readonly selectedKind = signal<IncludeSourceKind | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly includingId = signal<EntityId | null>(null);
  protected readonly includeError = signal<string | null>(null);

  /** Tipo effettivo in lista: selezione esplicita o unico tipo disponibile. */
  protected readonly activeKind = computed<IncludeSourceKind | null>(() => {
    const kinds = this.sourceKinds();
    const selected = this.selectedKind();
    if (selected && kinds.includes(selected)) {
      return selected;
    }
    return kinds.length === 1 ? kinds[0]! : null;
  });

  private readonly listState = toSignal(
    toObservable(
      computed(() => ({
        kind: this.activeKind(),
        search: this.searchQuery().trim(),
        seq: this.launchSeq(),
      })),
    ).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      switchMap(({ kind, search }) => {
        if (!kind) {
          return of({ status: 'ready' as const, rows: [] as readonly IncludableRow[] });
        }
        const rows$ =
          kind === IncludeSourceKind.Quote
            ? this.loadQuotes(search)
            : this.loadCustomerOrders(search);
        return rows$.pipe(
          map((rows) => ({ status: 'ready' as const, rows })),
          catchError(() => of({ status: 'error' as const, rows: [] as readonly IncludableRow[] })),
        );
      }),
    ),
    { initialValue: { status: 'ready' as const, rows: [] as readonly IncludableRow[] } },
  );

  protected readonly rows = computed(() => this.listState().rows);
  protected readonly listError = computed(() => this.listState().status === 'error');

  constructor() {
    // Reset a ogni apertura del pannello (nuovo launchSeq).
    effect(() => {
      this.launchSeq();
      this.selectedKind.set(null);
      this.searchQuery.set('');
      this.includingId.set(null);
      this.includeError.set(null);
    });
  }

  private loadQuotes(search: string) {
    return this.documentService
      .getDocuments({
        type: DocumentType.Quote,
        search: search || undefined,
        page: 1,
        pageSize: LIST_PAGE_SIZE,
      })
      .pipe(
        map((response) =>
          response.data
            .filter((doc) => doc.status !== DocumentStatus.Cancelled)
            .map(
              (doc): IncludableRow => ({
                id: doc.id,
                reference: doc.reference ?? `Bozza · serie ${doc.series}`,
                documentDate: doc.documentDate,
                customerName: doc.customerName ?? '—',
                total: doc.total,
              }),
            ),
        ),
      );
  }

  private loadCustomerOrders(search: string) {
    return this.salesOrderService
      .getSalesOrders({
        source: SalesOrderSource.Manual,
        search: search || undefined,
        page: 1,
        pageSize: LIST_PAGE_SIZE,
      })
      .pipe(
        map((response) =>
          response.data
            // Includibili solo gli ordini ancora aperti: quelli annullati o già
            // evasi (anche parzialmente) da un documento di scarico non possono
            // essere agganciati a un nuovo DDT (prompt DDT §LOGICA MAGAZZINO).
            .filter(
              (order) =>
                !order.cancelledAt &&
                !order.fulfilledAt &&
                order.fulfillmentStatus !== SalesOrderFulfillmentStatus.Partial,
            )
            .map(
              (order): IncludableRow => ({
                id: order.id,
                reference: order.orderNumber,
                documentDate: order.placedAt,
                customerName: order.customerName,
                total: order.total,
              }),
            ),
        ),
      );
  }

  protected selectKind(kind: IncludeSourceKind): void {
    this.selectedKind.set(kind);
    this.includeError.set(null);
  }

  protected backToKinds(): void {
    this.selectedKind.set(null);
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  /** Includi: carica il documento completo (con righe) ed emette il payload. */
  protected include(row: IncludableRow): void {
    const kind = this.activeKind();
    if (!kind || this.includingId()) {
      return;
    }
    this.includingId.set(row.id);
    this.includeError.set(null);
    const payload$ =
      kind === IncludeSourceKind.Quote
        ? this.documentService.getDocumentById(row.id).pipe(map(includedPayloadFromQuote))
        : this.salesOrderService.getSalesOrderById(row.id).pipe(map(includedPayloadFromSalesOrder));
    payload$.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (payload) => {
        this.includingId.set(null);
        this.included.emit(payload);
      },
      error: () => {
        this.includingId.set(null);
        this.includeError.set('Impossibile caricare il documento selezionato. Riprova.');
      },
    });
  }

  protected close(): void {
    this.dismissed.emit();
  }
}
