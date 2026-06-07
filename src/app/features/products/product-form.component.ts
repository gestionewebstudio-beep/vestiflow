import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap, tap } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductGeneralStepComponent } from './components/product-general-step/product-general-step.component';
import { ProductOptionsStepComponent } from './components/product-options-step/product-options-step.component';
import {
  emptyProductFormDraft,
  generateVariantDrafts,
  productToFormDraft,
} from './models/product-form.mapper';
import type {
  ProductFormDraft,
  ProductGeneralDraft,
  ProductOptionsDraft,
} from './models/product-form.model';
import type { ProductFilterOptions } from './models/product-list-query.model';
import { ProductService } from './services/product.service';

const EMPTY_FILTER_OPTIONS: ProductFilterOptions = { categories: [], brands: [], seasons: [] };

const PRODUCTS_LIST_PATH = '/app/products';

type ProductFormMode = 'create' | 'edit';

interface WizardStep {
  readonly id: 'general' | 'options' | 'variants' | 'review';
  readonly label: string;
}

const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 'general', label: 'Dati generali' },
  { id: 'options', label: 'Opzioni' },
  { id: 'variants', label: 'Varianti' },
  { id: 'review', label: 'Riepilogo' },
];

type FormLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'notFound' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Wizard creazione/modifica prodotto (smart). Questo micro-step (8.3) fornisce
 * la shell: rilevamento mode create/edit, prefill in edit, stato di caricamento
 * e navigazione tra gli step. I contenuti dei singoli step arrivano in 8.4-8.7.
 */
@Component({
  selector: 'app-product-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    ProductGeneralStepComponent,
    ProductOptionsStepComponent,
  ],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.scss',
})
export class ProductFormComponent {
  private readonly service = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly listPath = PRODUCTS_LIST_PATH;
  protected readonly steps = WIZARD_STEPS;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  private readonly productId = computed(() => this.paramMap().get('id'));
  protected readonly mode = computed<ProductFormMode>(() => (this.productId() ? 'edit' : 'create'));

  // Stato del form condiviso tra gli step. In edit viene prefillato al load.
  protected readonly draft = signal<ProductFormDraft>(emptyProductFormDraft());

  private readonly loadTick = signal(0);
  private readonly loadRequest = computed(() => ({ id: this.productId(), tick: this.loadTick() }));

  private readonly loadState = toSignal(
    toObservable(this.loadRequest).pipe(
      switchMap(({ id }) => {
        if (!id) {
          this.draft.set(emptyProductFormDraft());
          return of<FormLoadState>({ status: 'ready' });
        }
        return forkJoin({
          product: this.service.getProductById(id),
          variants: this.service.getProductVariants(id),
        }).pipe(
          tap(({ product, variants }) => this.draft.set(productToFormDraft(product, variants))),
          map((): FormLoadState => ({ status: 'ready' })),
          startWith<FormLoadState>({ status: 'loading' }),
          catchError((err: unknown) => of(this.toErrorState(err))),
        );
      }),
    ),
    { initialValue: this.initialLoadState() },
  );

  // Facets per i select categoria/stagione. initialValue null = ancora in caricamento;
  // su errore si degrada a opzioni vuote (il general step mostra il fallback esplicito).
  private readonly filterOptions = toSignal<ProductFilterOptions | null>(
    this.service.getFilterOptions().pipe(catchError(() => of(EMPTY_FILTER_OPTIONS))),
    { initialValue: null },
  );
  protected readonly filtersReady = computed(() => this.filterOptions() !== null);
  protected readonly categories = computed(() => this.filterOptions()?.categories ?? []);
  protected readonly seasons = computed(() => this.filterOptions()?.seasons ?? []);

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly notFound = computed(() => this.loadState().status === 'notFound');
  protected readonly error = computed(() => {
    const current = this.loadState();
    return current.status === 'error' ? current.error : null;
  });
  protected readonly ready = computed(() => this.loadState().status === 'ready');

  private readonly _currentStep = signal(0);
  protected readonly currentStep = this._currentStep.asReadonly();
  protected readonly currentStepId = computed(() => this.steps[this._currentStep()]?.id);
  protected readonly isFirstStep = computed(() => this._currentStep() === 0);
  protected readonly isLastStep = computed(() => this._currentStep() === this.steps.length - 1);

  // Validità "Dati generali": tutti i campi obbligatori valorizzati (trim).
  // Gli step 8.5-8.7 aggiungeranno le proprie regole nella catena di gating.
  private readonly generalValid = computed(() => {
    const { name, brand, category, season } = this.draft().general;
    return (
      name.trim() !== '' && brand.trim() !== '' && category.trim() !== '' && season.trim() !== ''
    );
  });

  // Step "Opzioni" valido se esiste almeno una combinazione generata.
  private readonly optionsValid = computed(() => this.draft().variants.length > 0);

  /** Lo step corrente è valido e consente l'avanzamento. */
  protected readonly canAdvance = computed(() => {
    switch (this.currentStepId()) {
      case 'general':
        return this.generalValid();
      case 'options':
        return this.optionsValid();
      default:
        return true;
    }
  });

  protected onGeneralChange(value: ProductGeneralDraft): void {
    this.draft.update((draft) => ({ ...draft, general: value }));
  }

  /**
   * Aggiorna le opzioni e rigenera le varianti per (taglia,colore), preservando
   * i dati gia' inseriti e scartando le combinazioni non piu' esistenti.
   */
  protected onOptionsChange(options: ProductOptionsDraft): void {
    this.draft.update((draft) => ({
      ...draft,
      options,
      variants: generateVariantDrafts(options, draft.general.name, draft.variants),
    }));
  }

  /** Tornare indietro è sempre consentito; avanzare solo allo step successivo se valido. */
  protected canReachStep(index: number): boolean {
    return index <= this._currentStep() || (index === this._currentStep() + 1 && this.canAdvance());
  }

  protected next(): void {
    if (!this.isLastStep() && this.canAdvance()) {
      this._currentStep.update((index) => index + 1);
    }
  }

  protected prev(): void {
    if (!this.isFirstStep()) {
      this._currentStep.update((index) => index - 1);
    }
  }

  protected goToStep(index: number): void {
    if (this.canReachStep(index)) {
      this._currentStep.set(index);
    }
  }

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  protected cancel(): void {
    const id = this.productId();
    void this.router.navigateByUrl(id ? `${PRODUCTS_LIST_PATH}/${id}` : PRODUCTS_LIST_PATH);
  }

  private initialLoadState(): FormLoadState {
    // Evita il flash di loading in create (nessun id da caricare).
    return this.route.snapshot.paramMap.get('id') ? { status: 'loading' } : { status: 'ready' };
  }

  private toErrorState(err: unknown): FormLoadState {
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
