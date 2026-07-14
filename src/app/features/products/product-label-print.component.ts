import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { ProductVariant } from '@core/models/product-variant.model';
import type { Product } from '@core/models/product.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductLabelComponent } from './components/product-label/product-label.component';
import type { ProductLabelViewModel } from './models/product-label.model';
import { toProductLabelViewModels } from './models/product-label.mapper';
import { ProductService } from './services/product.service';

const PRODUCTS_LIST_PATH = '/app/products';

type LabelPrintState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly product: Product;
      readonly variants: readonly ProductVariant[];
    }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Anteprima stampa etichette prodotto (smart). Apre il dialogo di stampa del
 * browser; compatibile con stampanti A4 e etichettatrici collegate al PC.
 */
@Component({
  selector: 'app-product-label-print',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.product-label-print--auto]': 'autoPrint()',
  },
  imports: [
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ProductLabelComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './product-label-print.component.html',
  styleUrl: './product-label-print.component.scss',
})
export class ProductLabelPrintComponent {
  private readonly service = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private autoPrintStarted = false;

  protected readonly listPath = PRODUCTS_LIST_PATH;
  protected readonly skeletonColumns = 3;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParamMap = toSignal(this.route.queryParamMap, { requireSync: true });

  private readonly productId = computed(() => this.paramMap().get('id'));
  private readonly variantFilterId = computed(() => this.queryParamMap().get('variantId'));
  protected readonly autoPrint = computed(() => this.queryParamMap().get('autoPrint') === '1');

  /** Copie per etichetta (default 1, o valore passato dal fallback popup bloccato). */
  protected readonly quantity = signal(this.readInitialQuantity());

  private readInitialQuantity(): number {
    const raw = Number(this.route.snapshot.queryParamMap.get('copies'));
    return Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 500) : 1;
  }

  /** Etichette da stampare/mostrare, ripetute per il numero di copie richiesto. */
  protected readonly expandedLabels = computed((): readonly ProductLabelViewModel[] => {
    const base = this.labels();
    const copies = this.quantity();
    if (copies <= 1) {
      return base;
    }
    const expanded: ProductLabelViewModel[] = [];
    for (const label of base) {
      for (let i = 0; i < copies; i += 1) {
        expanded.push(label);
      }
    }
    return expanded;
  });

  protected setQuantity(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    this.quantity.set(Math.min(Math.max(Math.floor(value), 1), 500));
  }

  constructor() {
    effect(() => {
      if (!this.autoPrint()) {
        return;
      }

      if (this.loading() || this.notFound() || this.error()) {
        return;
      }

      const labels = this.labels();
      if (labels.length === 0) {
        untracked(() => {
          void this.router.navigateByUrl(PRODUCTS_LIST_PATH);
        });
        return;
      }

      if (this.autoPrintStarted) {
        return;
      }

      untracked(() => {
        this.autoPrintStarted = true;
        globalThis.setTimeout(() => this.openPrintDialog(), 600);
      });
    });
  }

  private readonly refreshTick = signal(0);

  private readonly request = computed(() => ({
    id: this.productId(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<LabelPrintState>({ status: 'notFound' });
        }
        return forkJoin({
          product: this.service.getProductById(id),
          variants: this.service.getProductVariants(id),
        }).pipe(
          map(
            ({ product, variants }): LabelPrintState => ({
              status: 'success',
              product,
              variants,
            }),
          ),
          startWith<LabelPrintState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.toErrorState(err))),
        );
      }),
    ),
    { initialValue: { status: 'loading' } satisfies LabelPrintState },
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

  protected readonly labels = computed((): readonly ProductLabelViewModel[] => {
    const current = this.state();
    if (current.status !== 'success') {
      return [];
    }

    return toProductLabelViewModels(
      current.product,
      current.variants,
      this.variantFilterId() ?? undefined,
    );
  });

  protected readonly detailPath = computed(() => {
    const id = this.productId();
    return id ? `${PRODUCTS_LIST_PATH}/${id}` : PRODUCTS_LIST_PATH;
  });

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected print(): void {
    this.openPrintDialog(false);
  }

  private openPrintDialog(returnToListAfter = true): void {
    if (returnToListAfter && this.autoPrint()) {
      const returnToList = (): void => {
        void this.router.navigateByUrl(PRODUCTS_LIST_PATH);
      };
      globalThis.addEventListener('afterprint', returnToList, { once: true });
    }

    globalThis.print();
  }

  protected goToList(): void {
    void this.router.navigateByUrl(PRODUCTS_LIST_PATH);
  }

  protected goToDetail(): void {
    void this.router.navigateByUrl(this.detailPath());
  }

  private toErrorState(err: unknown): LabelPrintState {
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
