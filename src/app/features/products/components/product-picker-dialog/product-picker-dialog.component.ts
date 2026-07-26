import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, of, switchMap, tap } from 'rxjs';

import { StockStatus } from '@core/models/inventory-level.model';
import { stockStatusOf } from '@core/utils/inventory.util';
import { formatMoney } from '@core/utils/money.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import type { VariantSummary } from '../../models/variant-summary.model';
import { ProductService } from '../../services/product.service';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 100;

/** Prodotto del primo livello, con le sue varianti già in memoria. */
interface PickerProduct {
  readonly productId: string;
  readonly name: string;
  readonly imageUrl?: string;
  readonly priceLabel: string;
  readonly variants: readonly VariantSummary[];
}

/**
 * Modale «Seleziona prodotti»: primo livello per prodotto, secondo livello per
 * variante con selezione multipla. Full-screen su mobile, dialog centrato su
 * desktop (solo CSS: il markup è lo stesso).
 *
 * I due livelli si costruiscono da una sola ricerca varianti raggruppata per
 * prodotto: niente endpoint nuovi e niente chiamata per prodotto all'apertura
 * del secondo livello.
 */
@Component({
  selector: 'app-product-picker-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './product-picker-dialog.component.html',
  styleUrl: './product-picker-dialog.component.scss',
})
export class ProductPickerDialogComponent {
  /** Location per cui leggere le disponibilità mostrate accanto alle varianti. */
  readonly locationId = input<string | null>(null);

  /** Varianti scelte: una riga documento per ciascuna. */
  readonly variantsPicked = output<readonly string[]>();
  readonly dismissed = output<void>();

  private readonly productService = inject(ProductService);

  protected readonly StockStatus = StockStatus;
  protected readonly searchDraft = signal('');
  /** Prodotto aperto nel secondo livello; null = primo livello. */
  protected readonly openProduct = signal<PickerProduct | null>(null);
  protected readonly selectedVariantIds = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly loading = signal(false);

  private readonly results = toSignal(
    toObservable(this.searchDraft).pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      tap(() => this.loading.set(true)),
      switchMap((search) =>
        this.productService
          .searchVariantSummaries({
            search: search.trim() || undefined,
            pageSize: SEARCH_PAGE_SIZE,
            locationId: this.locationId() ?? undefined,
          })
          .pipe(catchError(() => of([] as readonly VariantSummary[]))),
      ),
      tap(() => this.loading.set(false)),
    ),
    { initialValue: [] as readonly VariantSummary[] },
  );

  /** Primo livello: varianti raggruppate per prodotto, ordine di arrivo. */
  protected readonly products = computed<readonly PickerProduct[]>(() => {
    const grouped = new Map<string, VariantSummary[]>();
    for (const variant of this.results()) {
      const bucket = grouped.get(variant.productId);
      if (bucket) {
        bucket.push(variant);
      } else {
        grouped.set(variant.productId, [variant]);
      }
    }
    return [...grouped.entries()].map(([productId, variants]) => {
      const first = variants[0]!;
      return {
        productId,
        name: first.productName || first.title,
        imageUrl: variants.find((variant) => variant.imageUrl)?.imageUrl,
        priceLabel: this.priceRangeLabel(variants),
        variants,
      };
    });
  });

  protected readonly selectedCount = computed(() => this.selectedVariantIds().size);

  /** Prezzo indicativo: valore unico o intervallo min–max tra le varianti. */
  private priceRangeLabel(variants: readonly VariantSummary[]): string {
    const amounts = variants
      .map((variant) => variant.sellingPrice.amountMinor)
      .filter((amount) => amount > 0);
    if (amounts.length === 0) {
      return '';
    }
    const currencyCode = variants[0]!.sellingPrice.currencyCode;
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    const from = formatMoney({ amountMinor: min, currencyCode });
    return min === max ? from : `da ${from}`;
  }

  /** Etichetta della variante senza ripetere il nome prodotto già a video. */
  protected variantLabel(product: PickerProduct, variant: VariantSummary): string {
    const title = variant.title.trim();
    const name = product.name.trim();
    if (name && title.toLowerCase().startsWith(name.toLowerCase())) {
      const rest = title
        .slice(name.length)
        .replace(/^[\s—–-]+/, '')
        .trim();
      if (rest) {
        return rest;
      }
    }
    return variant.sku || title || 'Variante';
  }

  protected variantPrice(variant: VariantSummary): string {
    return variant.sellingPrice.amountMinor > 0 ? formatMoney(variant.sellingPrice) : '';
  }

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

  protected onSearchInput(value: string): void {
    this.searchDraft.set(value);
    this.openProduct.set(null);
  }

  /**
   * Tap su un prodotto: con più varianti apre il secondo livello, altrimenti
   * aggiunge subito la riga (non c'è nulla da scegliere).
   */
  protected onProductTap(product: PickerProduct): void {
    if (product.variants.length <= 1) {
      const variant = product.variants[0];
      if (variant) {
        this.variantsPicked.emit([variant.variantId]);
      }
      return;
    }
    this.openProduct.set(product);
  }

  protected backToProducts(): void {
    this.openProduct.set(null);
  }

  protected isSelected(variantId: string): boolean {
    return this.selectedVariantIds().has(variantId);
  }

  protected toggleVariant(variantId: string): void {
    this.selectedVariantIds.update((current) => {
      const next = new Set(current);
      if (!next.delete(variantId)) {
        next.add(variantId);
      }
      return next;
    });
  }

  protected confirm(): void {
    const ids = [...this.selectedVariantIds()];
    if (ids.length > 0) {
      this.variantsPicked.emit(ids);
    }
  }

  protected close(): void {
    this.dismissed.emit();
  }
}
