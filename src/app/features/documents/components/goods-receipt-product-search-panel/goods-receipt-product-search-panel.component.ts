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

  protected resultDetail(variant: VariantSummary): string {
    const parts: string[] = [variant.sku];
    if (variant.barcode) {
      parts.push(`EAN ${variant.barcode}`);
    }
    if (variant.category) {
      parts.push(variant.category);
    }
    if (variant.supplierSku) {
      parts.push(`Cod. forn. ${variant.supplierSku}`);
    }
    if (variant.stockOnHand != null) {
      parts.push(`Disp. ${variant.stockOnHand}`);
    }
    if (variant.sellingPrice.amountMinor > 0) {
      parts.push(formatMoney(variant.sellingPrice));
    }
    return parts.join(' · ');
  }
}
