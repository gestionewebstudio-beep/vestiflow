import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { IsoDateString } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product, ProductStatus } from '@core/models/product.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductVariantTableComponent } from './components/product-variant-table/product-variant-table.component';
import { productStatusLabel, productStatusTone } from './models/product-status.util';
import { ProductService } from './services/product.service';

const PRODUCTS_LIST_PATH = '/app/products';

const DATE_FORMAT = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

const SHOPIFY_LABELS: Readonly<Record<ShopifySyncStatus, string>> = {
  [ShopifySyncStatus.NotConnected]: 'Non collegato',
  [ShopifySyncStatus.Synced]: 'Sincronizzato',
  [ShopifySyncStatus.OutOfSync]: 'Da sincronizzare',
  [ShopifySyncStatus.Syncing]: 'Sync in corso',
  [ShopifySyncStatus.Error]: 'Errore sync',
};

const SHOPIFY_TONES: Readonly<Record<ShopifySyncStatus, BadgeTone>> = {
  [ShopifySyncStatus.NotConnected]: 'neutral',
  [ShopifySyncStatus.Synced]: 'success',
  [ShopifySyncStatus.OutOfSync]: 'warning',
  [ShopifySyncStatus.Syncing]: 'info',
  [ShopifySyncStatus.Error]: 'error',
};

type ProductDetailState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly product: Product;
      readonly variants: readonly ProductVariant[];
    }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Dettaglio prodotto (smart, read-only). Anagrafica + varianti. Stesso pattern
 * di stato della lista (loading/error), con stato not-found dedicato.
 * Niente edit e niente stock per negozio: quest'ultimo resta al Magazzino.
 */
@Component({
  selector: 'app-product-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    ProductVariantTableComponent,
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
})
export class ProductDetailComponent {
  private readonly service = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly listPath = PRODUCTS_LIST_PATH;
  protected readonly skeletonColumns = 5;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  private readonly productId = computed(() => this.paramMap().get('id'));
  private readonly refreshTick = signal(0);

  private readonly request = computed(() => ({ id: this.productId(), tick: this.refreshTick() }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<ProductDetailState>({ status: 'notFound' });
        }
        return forkJoin({
          product: this.service.getProductById(id),
          variants: this.service.getProductVariants(id),
        }).pipe(
          map(
            ({ product, variants }): ProductDetailState => ({
              status: 'success',
              product,
              variants,
            }),
          ),
          startWith<ProductDetailState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.toErrorState(err))),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies ProductDetailState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly notFound = computed(() => this.state().status === 'notFound');

  protected readonly error = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.error : null;
  });

  protected readonly product = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.product : null;
  });

  protected readonly variants = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.variants : [];
  });

  protected statusLabel(status: ProductStatus): string {
    return productStatusLabel(status);
  }

  protected statusTone(status: ProductStatus): BadgeTone {
    return productStatusTone(status);
  }

  protected shopifyLabel(status: ShopifySyncStatus): string {
    return SHOPIFY_LABELS[status];
  }

  protected shopifyTone(status: ShopifySyncStatus): BadgeTone {
    return SHOPIFY_TONES[status];
  }

  protected formatDate(value: IsoDateString): string {
    return DATE_FORMAT.format(new Date(value));
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected goToList(): void {
    void this.router.navigateByUrl(PRODUCTS_LIST_PATH);
  }

  protected goToEdit(productId: string): void {
    void this.router.navigateByUrl(`${PRODUCTS_LIST_PATH}/${productId}/edit`);
  }

  private toErrorState(err: unknown): ProductDetailState {
    const appError = this.toAppError(err);
    return appError.kind === AppErrorKind.NotFound
      ? { status: 'notFound' }
      : { status: 'error', error: appError };
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
