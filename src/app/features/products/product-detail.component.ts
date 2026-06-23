import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  filter,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
  take,
  timer,
  type Observable,
  type Subscription,
  timeout as rxTimeout,
} from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { AuthService } from '@core/auth';
import {
  canDeleteProducts,
  canManageCatalog,
  canSyncProductToShopify,
} from '@core/permissions/tenant-permissions.util';
import type { IsoDateString } from '@core/models/common.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product, ProductStatus } from '@core/models/product.model';
import type { ShopifyMetafieldRef } from '@core/models/shopify-product-metadata.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import type { BadgeTone } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductVariantTableComponent } from './components/product-variant-table/product-variant-table.component';
import { productStatusLabel, productStatusTone } from './models/product-status.util';
import {
  catalogOriginLabel,
  catalogOriginTone,
  isShopifyCatalogProduct,
  SHOPIFY_CATALOG_EDIT_TITLE,
  SHOPIFY_CATALOG_READONLY_BANNER,
} from './models/catalog-origin.util';
import { ProductService } from './services/product.service';

const PRODUCTS_LIST_PATH = '/app/products';
const SHOPIFY_FOLLOW_UP_POLL_MS = 2000;
const SHOPIFY_FOLLOW_UP_MAX_WAIT_MS = 120_000;

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

interface ProductDetailShopifyMetafieldRow {
  readonly trackId: string;
  readonly label: string;
  readonly value: string;
}

/** Metafield già mostrati in "Dati generali": non ripetere in "Dati Shopify". */
const SUPPRESSED_SHOPIFY_METAFIELD_KEYS = new Set(['vestiflow.season']);

/** Etichette leggibili per metafield custom (non taxonomy categoria). */
const CUSTOM_SHOPIFY_METAFIELD_LABELS: Readonly<Record<string, string>> = {
  'vestiflow.season': 'Stagione',
};

function shopifyCustomMetafieldLabel(namespace: string, key: string): string {
  const mapped = CUSTOM_SHOPIFY_METAFIELD_LABELS[`${namespace}.${key}`];
  if (mapped) {
    return mapped;
  }
  return key
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

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
    ConfirmDialogComponent,
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
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = PRODUCTS_LIST_PATH;
  protected readonly skeletonColumns = 5;
  protected readonly shopifySyncStatus = ShopifySyncStatus;

  protected readonly canManageCatalog = computed(() =>
    canManageCatalog(this.authService.currentUser()),
  );
  protected readonly canDeleteProduct = computed(() => {
    const product = this.product();
    if (product && isShopifyCatalogProduct(product)) {
      return false;
    }
    return canDeleteProducts(this.authService.currentUser());
  });
  protected readonly canSyncProductToShopify = computed(() => {
    const product = this.product();
    if (product && isShopifyCatalogProduct(product)) {
      return false;
    }
    return canSyncProductToShopify(this.authService.currentUser());
  });
  protected readonly shopifyCatalogBanner = SHOPIFY_CATALOG_READONLY_BANNER;
  protected readonly shopifyCatalogEditTitle = SHOPIFY_CATALOG_EDIT_TITLE;
  protected readonly isShopifyCatalogProduct = isShopifyCatalogProduct;
  protected readonly catalogOriginLabel = catalogOriginLabel;
  protected readonly catalogOriginTone = catalogOriginTone;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  private readonly productId = computed(() => this.paramMap().get('id'));
  private readonly refreshTick = signal(0);
  private readonly autoPollShopifyProductId = signal<string | null>(null);

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

  /** Metafield Shopify non già mostrati in "Dati generali". */
  protected supplementaryShopifyMetafields(product: Product): readonly ShopifyMetafieldRef[] {
    const categoryKeys = new Set(
      (product.shopifyCategoryMetafields ?? []).map((field) => `${field.namespace}.${field.key}`),
    );
    return (product.shopifyMetafields ?? []).filter((field) => {
      const key = `${field.namespace}.${field.key}`;
      if (categoryKeys.has(key)) {
        return false;
      }
      if (SUPPRESSED_SHOPIFY_METAFIELD_KEYS.has(key) && product.season?.trim()) {
        return false;
      }
      return true;
    });
  }

  /** Metafield di categoria Shopify (namespace shopify.*), allineato a Shopify Admin. */
  protected shopifyCategoryMetafieldsForDisplay(
    product: Product,
  ): readonly ProductDetailShopifyMetafieldRow[] {
    return (product.shopifyCategoryMetafields ?? []).map((field) => ({
      trackId: `category:${field.namespace}.${field.key}`,
      label: field.attributeName,
      value: field.values.map((entry) => entry.name).join(', ') || '—',
    }));
  }

  /** Metafield prodotto custom (es. vestiflow.season), esclusi quelli di categoria. */
  protected shopifyCustomMetafieldsForDisplay(
    product: Product,
  ): readonly ProductDetailShopifyMetafieldRow[] {
    return this.supplementaryShopifyMetafields(product).map((field) => ({
      trackId: `custom:${field.namespace}.${field.key}`,
      label: shopifyCustomMetafieldLabel(field.namespace, field.key),
      value: field.value,
    }));
  }

  /** @deprecated Usare shopifyCategoryMetafieldsForDisplay + shopifyCustomMetafieldsForDisplay. */
  protected shopifyMetafieldsForDisplay(
    product: Product,
  ): readonly ProductDetailShopifyMetafieldRow[] {
    return [
      ...this.shopifyCategoryMetafieldsForDisplay(product),
      ...this.shopifyCustomMetafieldsForDisplay(product),
    ];
  }

  protected formatDate(value: IsoDateString): string {
    return DATE_FORMAT.format(new Date(value));
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected syncWithShopify(productId: string): void {
    if (this.syncingShopify()) {
      return;
    }
    this.syncingShopify.set(true);
    this.shopifySyncMessage.set(null);
    this.service
      .syncProductToShopify(productId)
      .pipe(
        switchMap((result) => {
          if (!result.pushed || !result.followUpInBackground) {
            return of({ result, product: null as Product | null });
          }
          this.shopifySyncMessage.set(
            'Sincronizzazione con Shopify in corso… attendi qualche istante.',
          );
          this.reload();
          return this.pollShopifyFollowUpComplete(productId).pipe(
            map((product) => ({ result, product })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ result, product }) => {
          this.syncingShopify.set(false);
          if (!result.pushed) {
            this.shopifySyncMessage.set(
              'Sync non eseguita: verifica connessione Shopify e permessi catalogo.',
            );
          } else if (product?.shopify?.status === ShopifySyncStatus.Synced) {
            this.shopifySyncMessage.set('Sincronizzazione Shopify completata.');
          } else if (product?.shopify?.lastError) {
            this.shopifySyncMessage.set(product.shopify.lastError);
          } else if (product?.shopify?.status === ShopifySyncStatus.Syncing) {
            this.shopifySyncMessage.set(
              'La sincronizzazione è ancora in corso. Aggiorna la pagina tra qualche istante.',
            );
          } else {
            this.shopifySyncMessage.set(
              'Sync non completata. Verifica i metafield di categoria su Shopify Admin.',
            );
          }
          this.reload();
        },
        error: (err: unknown) => {
          this.syncingShopify.set(false);
          this.shopifySyncMessage.set(this.syncErrorMessage(err));
        },
      });
  }

  private pollShopifyFollowUpComplete(productId: string): Observable<Product | null> {
    return timer(SHOPIFY_FOLLOW_UP_POLL_MS, SHOPIFY_FOLLOW_UP_POLL_MS).pipe(
      switchMap(() => this.service.getProductById(productId)),
      filter((product) => product.shopify?.status !== ShopifySyncStatus.Syncing),
      take(1),
      rxTimeout(SHOPIFY_FOLLOW_UP_MAX_WAIT_MS),
      catchError(() => this.service.getProductById(productId)),
    );
  }

  private syncErrorMessage(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    if (/504|gateway timeout|timeout/i.test(message)) {
      return 'La sincronizzazione ha impiegato troppo tempo. Controlla lo stato Shopify tra qualche istante.';
    }
    return 'Errore durante la sincronizzazione con Shopify.';
  }

  protected goToList(): void {
    void this.router.navigateByUrl(PRODUCTS_LIST_PATH);
  }

  protected goToEdit(productId: string): void {
    void this.router.navigateByUrl(`${PRODUCTS_LIST_PATH}/${productId}/edit`);
  }

  // ── Eliminazione (azione sensibile: confirm dialog obbligatorio) ───────────
  protected readonly deleteDialogOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly syncingShopify = signal(false);
  protected readonly shopifySyncMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      const current = this.state();
      if (current.status !== 'success') {
        this.autoPollShopifyProductId.set(null);
        return;
      }

      const product = current.product;
      if (product.shopify?.status !== ShopifySyncStatus.Syncing) {
        this.autoPollShopifyProductId.set(null);
        return;
      }

      if (this.syncingShopify() || this.autoPollShopifyProductId() === product.id) {
        return;
      }

      this.autoPollShopifyProductId.set(product.id);
      this.pollShopifyFollowUpComplete(product.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (refreshed) => {
            if (refreshed?.shopify?.lastError) {
              this.shopifySyncMessage.set(refreshed.shopify.lastError);
            } else if (refreshed?.shopify?.status === ShopifySyncStatus.Synced) {
              this.shopifySyncMessage.set('Sincronizzazione Shopify completata.');
            }
            this.refreshTick.update((tick) => tick + 1);
          },
          error: () => {
            this.refreshTick.update((tick) => tick + 1);
          },
        });
    });
  }

  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private deleteSubscription: Subscription | null = null;

  protected askDelete(): void {
    this.deleteError.set(null);
    this.deleteDialogOpen.set(true);
  }

  protected confirmDelete(productId: string): void {
    this.deleting.set(true);
    this.deleteSubscription = this.service
      .deleteProduct(productId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.deleteDialogOpen.set(false);
          void this.router.navigateByUrl(PRODUCTS_LIST_PATH);
        },
        error: (err: unknown) => {
          this.deleting.set(false);
          this.deleteDialogOpen.set(false);
          this.deleteError.set(this.toAppError(err).message);
        },
      });
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
