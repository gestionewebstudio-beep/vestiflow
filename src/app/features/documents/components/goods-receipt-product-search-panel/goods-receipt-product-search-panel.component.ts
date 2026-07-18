import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, of, switchMap } from 'rxjs';

import { StockStatus } from '@core/models/inventory-level.model';
import { stockStatusOf } from '@core/utils/inventory.util';
import { formatMoney } from '@core/utils/money.util';
import type { VariantSummary } from '@features/products/models/variant-summary.model';
import { ProductService } from '@features/products/services/product.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-goods-receipt-product-search-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonComponent, EmptyStateComponent],
  templateUrl: './goods-receipt-product-search-panel.component.html',
  styleUrl: './goods-receipt-product-search-panel.component.scss',
})
export class GoodsReceiptProductSearchPanelComponent {
  /** Termine catturato all'apertura del pannello (campo griglia). */
  readonly launchTerm = input('');
  /** Incrementato a ogni apertura: reinizializza la query senza sovrascriverla durante la digitazione. */
  readonly launchSeq = input(0);
  readonly locationId = input<string | null>(null);

  readonly variantSelected = output<{ readonly variantId: string }>();
  readonly dismissed = output<void>();

  private readonly productService = inject(ProductService);

  protected readonly searchQuery = signal('');
  /** Forza riesecuzione ricerca anche se il testo non cambia (Invio / pulsante Cerca). */
  private readonly searchRevision = signal(0);
  protected readonly formatMoney = formatMoney;
  protected readonly StockStatus = StockStatus;

  private readonly searchResults = toSignal(
    toObservable(
      computed(() => ({
        query: this.searchQuery(),
        revision: this.searchRevision(),
        locationId: this.locationId(),
      })),
    ).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      switchMap(({ query, locationId }) => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
          return of([] as readonly VariantSummary[]);
        }
        return this.productService
          .searchVariantSummaries({
            search: trimmed,
            locationId: locationId ?? undefined,
            pageSize: 40,
          })
          .pipe(catchError(() => of([] as readonly VariantSummary[])));
      }),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  protected readonly results = computed(() => this.searchResults() ?? []);

  constructor() {
    effect(() => {
      this.launchSeq();
      this.searchQuery.set(untracked(() => this.launchTerm()));
      this.searchRevision.update((value) => value + 1);
    });
  }

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchRevision.update((value) => value + 1);
  }

  protected runSearch(): void {
    this.searchRevision.update((value) => value + 1);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.runSearch();
    }
  }

  protected selectVariant(variantId: string): void {
    this.variantSelected.emit({ variantId });
  }

  protected close(): void {
    this.dismissed.emit();
  }

  /** Riga codici sotto il nome: codice articolo, SKU e EAN (i presenti). */
  protected resultCodes(variant: VariantSummary): string {
    const parts: string[] = [];
    if (variant.articleCode) {
      parts.push(`Art. ${variant.articleCode}`);
    }
    if (variant.sku) {
      parts.push(`SKU ${variant.sku}`);
    }
    if (variant.barcode) {
      parts.push(`EAN ${variant.barcode}`);
    }
    return parts.join(' · ');
  }

  /** Stato disponibilità (verde/arancione/rosso); null se non gestito a magazzino o senza giacenza. */
  protected stockStatus(variant: VariantSummary): StockStatus | null {
    if (variant.managesStock === false || variant.stockAvailable == null) {
      return null;
    }
    return stockStatusOf({
      available: variant.stockAvailable,
      minThreshold: variant.stockMinThreshold ?? 0,
    });
  }

  protected stockLabel(variant: VariantSummary): string {
    if (this.stockStatus(variant) === StockStatus.Empty) {
      return 'Esaurito';
    }
    return `Disp. ${variant.stockAvailable}`;
  }

  protected priceLabel(variant: VariantSummary): string {
    return variant.sellingPrice.amountMinor > 0 ? formatMoney(variant.sellingPrice) : '';
  }
}
