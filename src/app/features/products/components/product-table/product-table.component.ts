import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { ElementRef } from '@angular/core';

import type { SortOrder } from '@core/models/api.model';
import type { ProductStatus } from '@core/models/product.model';
import type { Product } from '@core/models/product.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

import { catalogOriginShortLabel, catalogOriginTone } from '../../models/catalog-origin.util';
import { productDisplayCategoryShort } from '../../models/product-display.util';
import { productStatusLabel, productStatusTone } from '../../models/product-status.util';
import type { ProductSortField } from '../../models/product-list-query.model';

/**
 * Tabella prodotti (dumb puro). Mostra le righe, espone row click e richieste
 * di sort. Responsive: tabella su desktop, card impilate su mobile.
 */
@Component({
  selector: 'app-product-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  templateUrl: './product-table.component.html',
  styleUrl: './product-table.component.scss',
})
export class ProductTableComponent {
  readonly products = input.required<readonly Product[]>();
  readonly columns = input.required<readonly ResolvedTableColumn[]>();
  readonly sortField = input<ProductSortField>();
  readonly sortOrder = input<SortOrder>();
  readonly showShopifyColumn = input(false);
  readonly selectedProductIds = input<ReadonlySet<string>>(new Set<string>());
  readonly allOnPageSelected = input(false);
  readonly someOnPageSelected = input(false);

  /** Azioni Duplica/Elimina mostrate solo con permesso di gestione catalogo. */
  readonly canManage = input(false);

  readonly rowClick = output<Product>();
  readonly sortChange = output<ProductSortField>();
  readonly printLabel = output<Product>();
  readonly duplicate = output<Product>();
  readonly selectionToggle = output<{ readonly productId: string; readonly selected: boolean }>();
  readonly selectAllToggle = output<boolean>();

  private readonly selectAllCheckbox = viewChild<ElementRef<HTMLInputElement>>('selectAllCheckbox');

  protected showColumn(id: string): boolean {
    return this.columns().some((col) => col.id === id);
  }

  protected columnLabel(id: string): string {
    return this.columns().find((col) => col.id === id)?.label ?? id;
  }

  constructor() {
    effect(() => {
      const checkbox = this.selectAllCheckbox()?.nativeElement;
      if (!checkbox) {
        return;
      }
      checkbox.indeterminate = this.someOnPageSelected();
    });
  }

  /** Numero di combinazioni di varianti derivato dalle opzioni del prodotto. */
  protected variantCount(product: Product): number {
    if (product.options.length === 0) {
      return 0;
    }
    return product.options.reduce((total, option) => total * option.values.length, 1);
  }

  protected statusLabel(status: ProductStatus): string {
    return productStatusLabel(status);
  }

  protected statusTone(status: ProductStatus): BadgeTone {
    return productStatusTone(status);
  }

  /** Valore di aria-sort per l'header di una colonna ordinabile. */
  protected ariaSort(field: ProductSortField): 'ascending' | 'descending' | 'none' {
    if (this.sortField() !== field) {
      return 'none';
    }
    return this.sortOrder() === 'desc' ? 'descending' : 'ascending';
  }

  /** Icona PrimeIcons che riflette lo stato di ordinamento della colonna. */
  protected sortIcon(field: ProductSortField): string {
    if (this.sortField() !== field) {
      return 'pi-sort-alt';
    }
    return this.sortOrder() === 'desc' ? 'pi-sort-amount-down' : 'pi-sort-amount-up-alt';
  }

  protected rowLabel(product: Product): string {
    return `${product.name}, apri dettaglio`;
  }

  protected categoryLabel(product: Product): string {
    return productDisplayCategoryShort(product);
  }

  protected onPrintClick(event: Event, product: Product): void {
    event.stopPropagation();
    event.preventDefault();
    this.printLabel.emit(product);
  }

  protected onDuplicateClick(event: Event, product: Product): void {
    event.stopPropagation();
    event.preventDefault();
    this.duplicate.emit(product);
  }

  protected isSelected(product: Product): boolean {
    return this.selectedProductIds().has(product.id);
  }

  protected onSelectionClick(event: Event, product: Product): void {
    event.stopPropagation();
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement)) {
      return;
    }
    this.selectionToggle.emit({ productId: product.id, selected: checkbox.checked });
  }

  protected onSelectAllClick(event: Event): void {
    event.stopPropagation();
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement)) {
      return;
    }
    this.selectAllToggle.emit(checkbox.checked);
  }

  protected shopifyLabel(product: Product): string {
    switch (product.shopify?.status) {
      case ShopifySyncStatus.Synced:
        return 'Sincronizzato';
      case ShopifySyncStatus.Syncing:
        return 'Sync in corso';
      case ShopifySyncStatus.OutOfSync:
        return 'Non aggiornato';
      case ShopifySyncStatus.Error:
        return 'Errore sync';
      default:
        return 'Non collegato';
    }
  }

  protected shopifyTone(product: Product): BadgeTone {
    switch (product.shopify?.status) {
      case ShopifySyncStatus.Synced:
        return 'success';
      case ShopifySyncStatus.Syncing:
        return 'info';
      case ShopifySyncStatus.OutOfSync:
        return 'warning';
      case ShopifySyncStatus.Error:
        return 'error';
      default:
        return 'neutral';
    }
  }

  protected sourceLabel(product: Product): string {
    return catalogOriginShortLabel(product.catalogOrigin);
  }

  protected sourceTone(product: Product): BadgeTone {
    return catalogOriginTone(product.catalogOrigin);
  }
}
