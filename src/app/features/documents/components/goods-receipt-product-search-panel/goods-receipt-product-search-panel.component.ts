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
  readonly initialSearch = input('');
  readonly supplierId = input<string | null>(null);
  readonly locationId = input<string | null>(null);

  readonly variantSelected = output<{ readonly variantId: string }>();
  readonly dismissed = output<void>();

  private readonly productService = inject(ProductService);

  protected readonly searchDraft = signal('');
  protected readonly formatMoney = formatMoney;

  private readonly searchResults = toSignal(
    toObservable(this.searchDraft).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      switchMap((term) => {
        const trimmed = term.trim();
        return this.productService
          .searchVariantSummaries({
            search: trimmed.length > 0 ? trimmed : undefined,
            supplierId: this.supplierId() ?? undefined,
            locationId: this.locationId() ?? undefined,
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
      const initial = this.initialSearch();
      this.searchDraft.set(initial);
    });
  }

  protected onSearchInput(value: string): void {
    this.searchDraft.set(value);
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
    if (variant.supplierSku) {
      parts.push(`Cod. forn. ${variant.supplierSku}`);
    }
    if (variant.stockOnHand != null) {
      parts.push(`Giac. ${variant.stockOnHand}`);
    }
    return parts.join(' · ');
  }
}
