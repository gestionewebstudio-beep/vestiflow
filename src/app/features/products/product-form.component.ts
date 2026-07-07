import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
  tap,
  take,
} from 'rxjs';
import type { Subscription } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { CatalogOrigin } from '@core/models/catalog-origin.model';
import type { CatalogOrigin as CatalogOriginType } from '@core/models/catalog-origin.model';
import { AuthService } from '@core/auth';
import type { CanComponentDeactivate } from '@core/guards/unsaved-changes.guard';
import {
  TenantChannelProfile,
  showShopifyIntegration as isShopifyTenantProfile,
} from '@core/models/tenant-channel-profile.model';
import type { ProductImage } from '@core/models/product-image.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { ProductGeneralStepComponent } from './components/product-general-step/product-general-step.component';
import { ProductImagesFieldComponent } from './components/product-images-field/product-images-field.component';
import { ProductOptionsStepComponent } from './components/product-options-step/product-options-step.component';
import { ProductQuickVariantFieldsComponent } from './components/product-quick-variant-fields/product-quick-variant-fields.component';
import { ProductReviewStepComponent } from './components/product-review-step/product-review-step.component';
import { ProductVariantsStepComponent } from './components/product-variants-step/product-variants-step.component';
import type { ProductEmbeddedCreatePrefill } from './models/product-form.mapper';
import {
  emptyProductFormDraft,
  ensureQuickModeDraft,
  generateVariantDrafts,
  productFormDraftFromEmbeddedPrefill,
  productToFormDraft,
  toCreateProductDto,
  toUpdateProductDto,
} from './models/product-form.mapper';
import type {
  ProductFormDraft,
  ProductGeneralDraft,
  ProductOptionsDraft,
  VariantDraft,
} from './models/product-form.model';
import type { BarcodeAvailabilityResult, SkuAvailabilityResult } from './models/product.dto';
import {
  findDuplicateAxisNames,
  findDuplicateBarcodes,
  findDuplicateSkus,
  isBarcodeDistinct,
  isValidAxisName,
  isValidSku,
} from './models/product-form.validators';
import type { ProductFilterOptions } from './models/product-list-query.model';
import {
  SHOPIFY_CATALOG_EDIT_TITLE,
  SHOPIFY_CATALOG_READONLY_BANNER,
} from './models/catalog-origin.util';
import { ProductService } from './services/product.service';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';

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

const QUICK_WIZARD_STEPS: readonly WizardStep[] = [{ id: 'general', label: 'Dati essenziali' }];

type ProductCreationMode = 'quick' | 'full';

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
    ProductImagesFieldComponent,
    ProductOptionsStepComponent,
    ProductQuickVariantFieldsComponent,
    ProductVariantsStepComponent,
    ProductReviewStepComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.scss',
})
export class ProductFormComponent implements CanComponentDeactivate {
  /** Quando true, il form vive in un pannello laterale (es. arrivo merce). */
  readonly embeddedPanel = input(false);
  /** Prefill opzionale in creazione embedded (dati dalla riga documento). */
  readonly embeddedPrefill = input<ProductEmbeddedCreatePrefill | null>(null);
  /** Id prodotto in modifica embedded (es. anagrafica da arrivo merce). */
  readonly embeddedProductId = input<string | null>(null);

  readonly productCreatedWithAttach = output<{ readonly variantId: string }>();
  readonly productSavedWithoutAttach = output<{ readonly variantId: string }>();
  readonly productUpdatedInPanel = output<{ readonly productId: string }>();
  readonly panelDismissed = output<void>();

  private readonly service = inject(ProductService);
  private readonly shopifyConnectionService = inject(ShopifyConnectionService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = PRODUCTS_LIST_PATH;

  /** In creazione: rapido (1 SKU) o wizard completo con opzioni. */
  protected readonly creationMode = signal<ProductCreationMode>('quick');
  private readonly skuManuallyEdited = signal(false);
  private readonly quickVariantStepValid = signal(false);

  protected readonly steps = computed(() => {
    if (this.mode() === 'create' && this.creationMode() === 'quick') {
      return QUICK_WIZARD_STEPS;
    }
    return WIZARD_STEPS;
  });

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  private readonly productId = computed(() => {
    if (this.embeddedPanel()) {
      return this.embeddedProductId();
    }
    return this.paramMap().get('id');
  });
  protected readonly mode = computed<ProductFormMode>(() => (this.productId() ? 'edit' : 'create'));

  // Stato del form condiviso tra gli step. In edit viene prefillato al load.
  protected readonly draft = signal<ProductFormDraft>(emptyProductFormDraft());

  // Baseline per il rilevamento modifiche non salvate: serializzazione del draft
  // al momento del load (vuoto in create, prefill in edit).
  private readonly pristine = signal<string>(this.serialize(emptyProductFormDraft()));
  // Diventa true dopo un salvataggio riuscito: disattiva il guard di uscita.
  protected readonly saved = signal(false);
  protected readonly isDirty = computed(
    () =>
      !this.saved() &&
      (this.serialize(this.draft()) !== this.pristine() || this.pendingImageFiles().length > 0),
  );

  protected readonly leaveDialogOpen = signal(false);
  private pendingDeactivate: ((allow: boolean) => void) | null = null;

  protected readonly pendingImageFiles = signal<readonly File[]>([]);
  protected readonly existingImages = signal<readonly ProductImage[]>([]);
  protected readonly catalogOrigin = signal<CatalogOriginType>(CatalogOrigin.VestiFlow);
  protected readonly shopifyCatalogLocked = computed(
    () => this.mode() === 'edit' && this.catalogOrigin() === CatalogOrigin.Shopify,
  );
  protected readonly shopifyCatalogBanner = SHOPIFY_CATALOG_READONLY_BANNER;
  protected readonly formTitle = computed(() => {
    if (this.mode() === 'create') {
      return 'Nuovo prodotto';
    }
    return this.shopifyCatalogLocked() ? SHOPIFY_CATALOG_EDIT_TITLE : 'Modifica prodotto';
  });

  // Stato submit (dichiarati prima del pipe di load, che usa resetDraft in init).
  private readonly _submitState = signal<'idle' | 'submitting' | 'error'>('idle');
  protected readonly submitError = signal<AppError | null>(null);
  private readonly embeddedAttachAfterSave = signal(true);

  private readonly loadTick = signal(0);
  private readonly loadRequest = computed(() => ({ id: this.productId(), tick: this.loadTick() }));

  private readonly loadState = toSignal(
    toObservable(this.loadRequest).pipe(
      switchMap(({ id }) => {
        if (!id) {
          this.catalogOrigin.set(CatalogOrigin.VestiFlow);
          this.creationMode.set('quick');
          this.skuManuallyEdited.set(false);
          const prefill = this.embeddedPrefill();
          const initialDraft = prefill
            ? productFormDraftFromEmbeddedPrefill(prefill)
            : ensureQuickModeDraft(emptyProductFormDraft());
          this.resetDraft(initialDraft);
          if (prefill?.sku?.trim()) {
            this.skuManuallyEdited.set(true);
          }
          return of<FormLoadState>({ status: 'ready' });
        }
        return forkJoin({
          product: this.service.getProductById(id),
          variants: this.service.getProductVariants(id),
        }).pipe(
          tap(({ product, variants }) => {
            this.catalogOrigin.set(product.catalogOrigin ?? CatalogOrigin.VestiFlow);
            this.resetDraft(productToFormDraft(product, variants));
            this.existingImages.set(product.images ?? []);
          }),
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

  private readonly shopifyConnection = toSignal(
    this.shopifyConnectionService.getConnection().pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  protected readonly shopifyConnected = computed(() => {
    const profile = this.authService.currentUser()?.tenantChannelProfile;
    if (profile !== TenantChannelProfile.Shopify) {
      return false;
    }
    return this.shopifyConnection()?.status === ShopifyConnectionStatus.Connected;
  });
  protected readonly showShopifyIntegration = computed(() =>
    isShopifyTenantProfile(this.authService.currentUser()?.tenantChannelProfile),
  );

  protected readonly categories = computed(() => this.filterOptions()?.categories ?? []);

  // Validità del formato compareAtPrice (testo libero) riportata dallo step
  private readonly variantsStepValid = signal(true);

  // SKU non vuoti delle varianti correnti, per la verifica di disponibilita'.
  private readonly variantSkus = computed(() =>
    this.draft()
      .variants.map((variant) => variant.sku.trim())
      .filter((sku) => sku.length > 0),
  );

  // Barcode non vuoti delle varianti correnti, per la verifica di disponibilita'.
  private readonly variantBarcodes = computed(() =>
    this.draft()
      .variants.map((variant) => variant.barcode.trim())
      .filter((barcode) => barcode.length > 0),
  );

  // Verifica unicita' SKU lato "server" (debounced). In edit esclude il prodotto
  // corrente cosi' le sue varianti non si auto-segnalano come gia' in uso.
  private readonly skuAvailability = toSignal(
    toObservable(this.variantSkus).pipe(
      debounceTime(400),
      distinctUntilChanged((a, b) => a.length === b.length && a.every((sku, i) => sku === b[i])),
      switchMap((skus) =>
        skus.length === 0
          ? of<SkuAvailabilityResult>({ available: true, taken: [] })
          : this.service
              .checkSkuAvailability(skus, this.productId() ?? undefined)
              .pipe(catchError(() => of<SkuAvailabilityResult>({ available: true, taken: [] }))),
      ),
    ),
    { initialValue: { available: true, taken: [] } },
  );
  protected readonly takenSkus = computed(() => this.skuAvailability().taken);

  // Verifica unicita' barcode lato server (debounced). In edit esclude il prodotto
  // corrente cosi' i barcode delle sue varianti non si auto-segnalano come gia' in uso.
  private readonly barcodeAvailability = toSignal(
    toObservable(this.variantBarcodes).pipe(
      debounceTime(400),
      distinctUntilChanged(
        (a, b) => a.length === b.length && a.every((barcode, i) => barcode === b[i]),
      ),
      switchMap((barcodes) =>
        barcodes.length === 0
          ? of<BarcodeAvailabilityResult>({ available: true, taken: [] })
          : this.service
              .checkBarcodeAvailability(barcodes, this.productId() ?? undefined)
              .pipe(
                catchError(() => of<BarcodeAvailabilityResult>({ available: true, taken: [] })),
              ),
      ),
    ),
    { initialValue: { available: true, taken: [] } },
  );
  protected readonly takenBarcodes = computed(() => this.barcodeAvailability().taken);

  protected readonly loading = computed(() => this.loadState().status === 'loading');
  protected readonly notFound = computed(() => this.loadState().status === 'notFound');
  protected readonly error = computed(() => {
    const current = this.loadState();
    return current.status === 'error' ? current.error : null;
  });
  protected readonly ready = computed(() => this.loadState().status === 'ready');

  private readonly _currentStep = signal(0);
  protected readonly currentStep = this._currentStep.asReadonly();
  protected readonly currentStepId = computed(() => this.steps()[this._currentStep()]?.id);
  protected readonly isFirstStep = computed(() => this._currentStep() === 0);
  protected readonly isLastStep = computed(() => this._currentStep() === this.steps().length - 1);
  protected readonly quickVariant = computed(() => this.draft().variants[0] ?? null);

  // Validità "Dati generali": solo il nome è obbligatorio (brand/categoria completabili dopo).
  private readonly generalValid = computed(() => {
    if (this.shopifyCatalogLocked()) {
      return true;
    }
    return this.draft().general.name.trim() !== '';
  });

  protected readonly isQuickCreate = computed(
    () => this.mode() === 'create' && this.creationMode() === 'quick',
  );

  // Step "Opzioni" valido se: c'è almeno una combinazione generata e i nomi degli
  // assi sono validi (non vuoti) e univoci (es. il 3° asse non duplica Taglia/Colore).
  private readonly optionsValid = computed(() => {
    if (this.isQuickCreate()) {
      return true;
    }
    if (this.shopifyCatalogLocked()) {
      return true;
    }
    if (this.draft().variants.length === 0) {
      return false;
    }
    const names = this.draft().options.axes.map((axis) => axis.name);
    if (names.some((name) => !isValidAxisName(name))) {
      return false;
    }
    if (findDuplicateAxisNames(names).length > 0) {
      return false;
    }
    const hasOptionValues = this.draft().options.axes.some((axis) => axis.values.length > 0);
    if (!hasOptionValues) {
      return this.draft().variants.length === 1;
    }
    return true;
  });

  // Step "Varianti" valido: regole pure su ogni variante + nessun duplicato
  // intra-form + nessuno SKU gia' in uso lato "server".
  private readonly variantsValid = computed(() => {
    const variants = this.draft().variants;
    if (this.shopifyCatalogLocked()) {
      return (
        variants.length > 0 &&
        variants.every((variant) => variant.purchasePrice == null || variant.purchasePrice >= 0)
      );
    }
    if (variants.length === 0) {
      return false;
    }
    if (findDuplicateSkus(variants.map((variant) => variant.sku)).length > 0) {
      return false;
    }
    if (findDuplicateBarcodes(variants.map((variant) => variant.barcode)).length > 0) {
      return false;
    }
    if (this.takenSkus().length > 0) {
      return false;
    }
    if (this.takenBarcodes().length > 0) {
      return false;
    }
    // Il prezzo barrato (testo) è validato dallo step: il formato non valido non
    // è rappresentabile nel draft numerico, quindi entra qui via signal dedicato.
    if (!this.variantsStepValid()) {
      return false;
    }
    return variants.every(
      (variant) =>
        isValidSku(variant.sku) &&
        variant.sellingPrice != null &&
        variant.sellingPrice >= 0 &&
        (variant.purchasePrice == null || variant.purchasePrice >= 0) &&
        isBarcodeDistinct(variant.sku, variant.barcode),
    );
  });

  /** Lo step corrente è valido e consente l'avanzamento. */
  protected readonly canAdvance = computed(() => {
    if (this.isQuickCreate()) {
      return false;
    }
    switch (this.currentStepId()) {
      case 'general':
        return this.generalValid();
      case 'options':
        return this.optionsValid();
      case 'variants':
        return this.variantsValid();
      default:
        return true;
    }
  });

  protected onGeneralChange(value: ProductGeneralDraft): void {
    this.draft.update((draft) => {
      const nextGeneral = value;
      let next = { ...draft, general: nextGeneral };
      if (this.isQuickCreate() && !this.skuManuallyEdited()) {
        next = ensureQuickModeDraft(next, false);
      }
      return next;
    });
  }

  protected onQuickVariantChange(variant: VariantDraft): void {
    this.draft.update((draft) => ({ ...draft, variants: [variant] }));
  }

  protected onQuickSkuEdited(): void {
    this.skuManuallyEdited.set(true);
  }

  protected onQuickVariantValidChange(valid: boolean): void {
    this.quickVariantStepValid.set(valid);
  }

  protected setCreationMode(mode: ProductCreationMode): void {
    if (this.mode() !== 'create' || this.creationMode() === mode) {
      return;
    }
    this.creationMode.set(mode);
    this._currentStep.set(0);
    if (mode === 'quick') {
      this.skuManuallyEdited.set(false);
      this.draft.update((draft) => ensureQuickModeDraft(draft, false));
    }
  }

  protected switchToFullWizard(): void {
    this.setCreationMode('full');
  }

  protected onPendingImagesChange(files: readonly File[]): void {
    this.pendingImageFiles.set(files);
  }

  protected onRemoveExistingImage(imageId: string): void {
    const productId = this.productId();
    if (!productId) {
      return;
    }
    this.service
      .deleteProductImage(productId, imageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.existingImages.update((images) => images.filter((image) => image.id !== imageId));
        },
      });
  }

  /**
   * Aggiorna le opzioni e rigenera le varianti dal prodotto cartesiano degli
   * assi, preservando i dati gia' inseriti (merge per proiezione sugli assi
   * attivi) e scartando le combinazioni non piu' esistenti.
   */
  protected onOptionsChange(options: ProductOptionsDraft): void {
    this.draft.update((draft) => ({
      ...draft,
      options,
      variants: generateVariantDrafts(options, draft.general.name, draft.variants),
    }));
  }

  protected onVariantsChange(variants: readonly VariantDraft[]): void {
    this.draft.update((draft) => ({ ...draft, variants }));
  }

  protected onVariantsValidChange(valid: boolean): void {
    this.variantsStepValid.set(valid);
  }

  // ── Submit (create/update) ────────────────────────────────────────────────
  protected readonly submitting = computed(() => this._submitState() === 'submitting');
  // takeUntilDestroyed() gestisce l'unsubscribe; il campo evita subscription "ignorate".
  private submitSub?: Subscription;

  // L'intero draft è valido: ogni step gating soddisfatto. Indipendente dallo
  // step corrente, così il bottone Salva non dipende da dove ci si trova.
  protected readonly canSubmit = computed(() => {
    if (this.submitting()) {
      return false;
    }
    if (this.isQuickCreate()) {
      return this.generalValid() && this.quickVariantStepValid();
    }
    return this.generalValid() && this.optionsValid() && this.variantsValid();
  });

  protected readonly showSubmitOnCurrentStep = computed(() => {
    if (this.isLastStep()) {
      return true;
    }
    return this.isQuickCreate() && this.isFirstStep();
  });

  protected onSubmit(attachToDocument = true): void {
    if (this.embeddedPanel()) {
      this.embeddedAttachAfterSave.set(attachToDocument);
    }
    this.submitProduct();
  }

  private submitProduct(): void {
    if (!this.canSubmit()) {
      return;
    }
    const draft = this.draft();
    const id = this.productId();
    const pendingFiles = [...this.pendingImageFiles()];
    if (this.shopifyCatalogLocked() && pendingFiles.length > 0) {
      return;
    }
    const baseRequest$ = id
      ? this.service.updateProduct(id, toUpdateProductDto(draft))
      : this.service.createProduct(toCreateProductDto(draft));

    const request$ = baseRequest$.pipe(
      switchMap((product) => {
        if (pendingFiles.length === 0) {
          return of(product);
        }
        return forkJoin(
          pendingFiles.map((file) => this.service.uploadProductImage(product.id, file)),
        ).pipe(map(() => product));
      }),
    );

    this._submitState.set('submitting');
    this.submitError.set(null);

    this.submitSub = request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (product) => {
        this.saved.set(true);
        if (this.embeddedPanel()) {
          if (id) {
            this.productUpdatedInPanel.emit({ productId: product.id });
            return;
          }
          this.service
            .getProductVariants(product.id)
            .pipe(take(1), takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (variants) => {
                const variantId = variants[0]?.id;
                if (!variantId) {
                  this.panelDismissed.emit();
                  return;
                }
                if (this.embeddedAttachAfterSave()) {
                  this.productCreatedWithAttach.emit({ variantId });
                } else {
                  this.productSavedWithoutAttach.emit({ variantId });
                }
              },
              error: () => this.panelDismissed.emit(),
            });
          return;
        }
        void this.router.navigateByUrl(`${PRODUCTS_LIST_PATH}/${product.id}`);
      },
      error: (err: unknown) => {
        this._submitState.set('error');
        this.submitError.set(this.toAppError(err));
      },
    });
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
    if (this.embeddedPanel()) {
      this.panelDismissed.emit();
      return;
    }
    const id = this.productId();
    void this.router.navigateByUrl(id ? `${PRODUCTS_LIST_PATH}/${id}` : PRODUCTS_LIST_PATH);
  }

  // ── Modifiche non salvate ─────────────────────────────────────────────────
  /** Chiamato dal CanDeactivate guard prima di lasciare la route. */
  canDeactivate(): boolean | Promise<boolean> {
    if (!this.isDirty()) {
      return true;
    }

    this.leaveDialogOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.pendingDeactivate = resolve;
    });
  }

  protected confirmLeave(): void {
    const resolve = this.pendingDeactivate;
    this.pendingDeactivate = null;
    this.leaveDialogOpen.set(false);
    resolve?.(true);
  }

  protected cancelLeave(): void {
    const resolve = this.pendingDeactivate;
    this.pendingDeactivate = null;
    this.leaveDialogOpen.set(false);
    resolve?.(false);
  }

  // Protezione refresh/chiusura tab (il browser mostra solo il dialog nativo).
  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private resetDraft(draft: ProductFormDraft): void {
    this.draft.set(draft);
    this.pristine.set(this.serialize(draft));
    this.pendingImageFiles.set([]);
    this.saved.set(false);
    this._submitState.set('idle');
    this.submitError.set(null);
  }

  private serialize(draft: ProductFormDraft): string {
    return JSON.stringify(draft);
  }

  private initialLoadState(): FormLoadState {
    // Evita il flash di loading in create (nessun id da caricare).
    const routeId = this.route.snapshot.paramMap.get('id');
    const embeddedId = this.embeddedPanel() ? this.embeddedProductId() : null;
    return routeId || embeddedId ? { status: 'loading' } : { status: 'ready' };
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
