import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import type { Product } from '@core/models/product.model';
import { InlineBannerComponent } from '@shared/components/inline-banner/inline-banner.component';
import { ListPageComponent } from '@shared/components/list-page/list-page.component';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { DEFAULT_PRODUCT_PAGE_SIZE } from '@domain/products/models/product-list-query.model';
import { ProductService } from '@domain/products/services/product.service';

import { ProductTableComponent } from './components/product-table/product-table.component';
import {
  PRODUCT_LIST_COLUMN_DEFS,
  PRODUCT_LIST_COLUMN_PRESETS,
  PRODUCT_LIST_VIEW,
} from './models/product-table-columns.config';

type TrashLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly products: readonly Product[] }
  | { readonly status: 'error'; readonly message: string };

/**
 * Vista amministrativa CESTINO (docs/24 §6): mostra ESCLUSIVAMENTE i prodotti
 * nel cestino, in sola lettura. L'elenco ordinario li esclude; questa pagina è
 * l'unico posto dove si vedono, e il badge «Nel cestino» lo dice su ogni riga.
 *
 * ⛔ Niente comandi: Ripristina ed Elimina definitivamente sono della tranche
 *    successiva. Aggiungerli qui «perché tanto la pagina c'è» è esattamente
 *    l'ampliamento di perimetro che la tranche vieta.
 *
 * ⭐ Il filtro NON è deciso qui: è `trash=true` verso l'API, che applica il
 *    predicato unico di `product-lifecycle.util` e nega la vista a chi non ha
 *    `catalog.delete`. La rotta lo chiede a sua volta, ma il gate vero è sul
 *    server.
 */
@Component({
  selector: 'app-product-trash',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InlineBannerComponent, ListPageComponent, ProductTableComponent],
  templateUrl: './product-trash.component.html',
  styleUrl: './product-trash.component.scss',
})
export class ProductTrashComponent {
  private readonly service = inject(ProductService);
  private readonly router = inject(Router);
  private readonly columnPreferences = inject(TableColumnPreferenceService);

  private readonly reloadTick = signal(0);

  // Stesse colonne e stesso selettore dell'elenco: è lo stesso tipo di riga,
  // solo in un altro stato. Una seconda vista colonne sarebbe da riallineare.
  protected readonly productListView = PRODUCT_LIST_VIEW;
  protected readonly tableColumns;
  protected readonly skeletonColumns = 7;

  private readonly state = toSignal(
    toObservable(this.reloadTick).pipe(
      switchMap(() =>
        this.service
          .getProducts(
            { page: 1, pageSize: DEFAULT_PRODUCT_PAGE_SIZE, trash: true },
            { tutto: true },
          )
          .pipe(
            map((response): TrashLoadState => ({ status: 'success', products: response.data })),
            startWith<TrashLoadState>({ status: 'loading' }),
            catchError((err: unknown) =>
              of<TrashLoadState>({
                status: 'error',
                message:
                  err instanceof Error && err.message
                    ? err.message
                    : 'Impossibile caricare il cestino.',
              }),
            ),
          ),
      ),
    ),
    { initialValue: { status: 'loading' } },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => {
    const s = this.state();
    return s.status === 'error' ? s.message : null;
  });
  protected readonly products = computed(() => {
    const s = this.state();
    return s.status === 'success' ? s.products : [];
  });
  protected readonly isEmpty = computed(
    () => this.state().status === 'success' && this.products().length === 0,
  );

  constructor() {
    this.columnPreferences.registerView(
      PRODUCT_LIST_VIEW,
      PRODUCT_LIST_COLUMN_DEFS,
      PRODUCT_LIST_COLUMN_PRESETS,
    );
    this.tableColumns = this.columnPreferences.visibleColumns(PRODUCT_LIST_VIEW);
  }

  protected reload(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  /** Sola consultazione: la riga apre il Dettaglio, non la Modifica. */
  protected openProduct(product: Product): void {
    void this.router.navigate(['/app/products', product.id]);
  }
}
