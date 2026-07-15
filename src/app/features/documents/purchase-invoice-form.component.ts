import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap, take } from 'rxjs';

import type { AppError } from '@core/models/app-error.model';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { mapHttpErrorToAppError } from '@core/interceptors/http-error.mapper';
import type { Money } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  moneyToDecimalString,
  parseMoneyInput,
} from '@core/utils/money.util';
import { formatDate } from '@core/utils/date.util';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DateInputComponent } from '@shared/components/date-input/date-input.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { LinkableGoodsReceipt } from './models/goods-receipt-causal.model';
import { DocumentService } from './services/document.service';

type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'error'; readonly error: AppError };

/** Arrivo merce incluso nella registrazione (riga riepilogativa in maschera). */
interface IncludedReceiptRow {
  readonly id: string;
  readonly number?: number;
  readonly reference?: string;
  readonly documentDate: string;
  readonly causalText?: string;
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
}

/**
 * Registrazione fattura fornitore (prompt §5-7): documento contabile che
 * collega uno o più Arrivi merce alla fattura ricevuta. NON movimenta mai il
 * magazzino: le giacenze restano quelle caricate dagli Arrivi merce.
 */
@Component({
  selector: 'app-purchase-invoice-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    DateInputComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SelectMenuComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './purchase-invoice-form.component.html',
  styleUrl: './purchase-invoice-form.component.scss',
})
export class PurchaseInvoiceFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly documentService = inject(DocumentService);
  private readonly supplierService = inject(SupplierService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly listPath = '/app/documents/registro';
  protected readonly currency = DEFAULT_CURRENCY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  private readonly paramMap = toSignal(this.route.paramMap, { requireSync: true });
  protected readonly editDocumentId = computed(() => this.paramMap().get('id'));
  protected readonly isEditMode = computed(() => Boolean(this.editDocumentId()));

  protected readonly pageTitle = computed(() =>
    this.isEditMode() ? 'Modifica registrazione fattura' : 'Registrazione fattura',
  );

  readonly form = this.fb.group({
    supplierId: this.fb.control('', { validators: [Validators.required] }),
    documentDate: this.fb.control(new Date().toISOString().slice(0, 10), {
      validators: [Validators.required],
    }),
    externalDocNumber: this.fb.control(''),
    externalDocDate: this.fb.control(''),
    totalText: this.fb.control('', { validators: [Validators.required] }),
    notes: this.fb.control(''),
  });

  private readonly loadedDocument = signal<DocumentRecord | null>(null);
  protected readonly loadedReference = computed(() => this.loadedDocument()?.reference ?? null);

  /** Arrivi merce inclusi (righe riepilogative, prompt §5.2). */
  protected readonly includedReceipts = signal<readonly IncludedReceiptRow[]>([]);

  protected readonly includePanelOpen = signal(false);
  protected readonly linkableReceipts = signal<readonly LinkableGoodsReceipt[]>([]);
  protected readonly linkableLoading = signal(false);
  protected readonly linkableError = signal<AppError | null>(null);
  protected readonly linkableSelection = signal<ReadonlySet<string>>(new Set());

  private readonly _submitState = signal<SubmitState>({ status: 'idle' });
  protected readonly saving = computed(() => this._submitState().status === 'saving');
  protected readonly submitError = computed(() => {
    const state = this._submitState();
    return state.status === 'error' ? state.error : null;
  });

  private readonly suppliers = toSignal(
    this.supplierService.getSuppliers().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly supplierOptions = computed<readonly SelectMenuOption[]>(() =>
    this.suppliers().map((supplier) => ({ value: supplier.id, label: supplier.name })),
  );

  /** "Mostra avviso" (anagrafica fornitore): banner alla selezione. */
  protected readonly supplierDocumentAlert = computed(() => {
    const supplierId = this.selectedSupplierId();
    if (!supplierId) {
      return '';
    }
    const supplier = this.suppliers().find((entry) => entry.id === supplierId);
    return supplier?.documentCreationAlert?.trim() ?? '';
  });

  private readonly selectedSupplierId = signal('');

  /** Ultima nota anagrafica inserita in automatico nelle note documento. */
  private lastAutoInsertedNote = '';

  /**
   * Ultimo importo scritto automaticamente nel campo "Totale fattura" come
   * comodo default (somma degli arrivi inclusi). Distingue un default non
   * ancora toccato da un valore inserito a mano, che va sempre rispettato:
   * il confronto/controllo tra i due totali non è un requisito (il totale
   * fattura reale può legittimamente differire per sconti, spese o
   * arrotondamenti non presenti sugli arrivi).
   */
  private readonly autoFilledTotalMinor = signal<number | null>(null);

  protected readonly receiptsTotal = computed<Money>(() => ({
    amountMinor: this.includedReceipts().reduce((sum, row) => sum + row.total.amountMinor, 0),
    currencyCode: this.currency,
  }));

  protected readonly receiptsSubtotal = computed<Money>(() => ({
    amountMinor: this.includedReceipts().reduce((sum, row) => sum + row.subtotal.amountMinor, 0),
    currencyCode: this.currency,
  }));

  protected readonly receiptsTax = computed<Money>(() => ({
    amountMinor: this.includedReceipts().reduce((sum, row) => sum + row.tax.amountMinor, 0),
    currencyCode: this.currency,
  }));

  private readonly loadTick = signal(0);
  private readonly loadState = toSignal(
    toObservable(computed(() => ({ id: this.editDocumentId(), tick: this.loadTick() }))).pipe(
      switchMap(({ id }) => {
        if (!id) {
          return of<'ready' | 'loading' | 'not-found' | 'error'>('ready');
        }
        return this.documentService.getDocumentById(id).pipe(
          map((doc) => {
            if (doc.type !== DocumentType.SupplierInvoice) {
              return 'not-found' as const;
            }
            this.loadedDocument.set(doc);
            this.patchFormFromDocument(doc);
            return 'ready' as const;
          }),
          startWith<'ready' | 'loading' | 'not-found' | 'error'>('loading'),
          catchError(() => of('error' as const)),
        );
      }),
    ),
    { initialValue: this.editDocumentId() ? 'loading' : 'ready' },
  );

  protected readonly loading = computed(() => this.loadState() === 'loading');
  protected readonly loadError = computed(() => this.loadState() === 'error');
  protected readonly notFound = computed(() => this.loadState() === 'not-found');

  protected reload(): void {
    this.loadTick.update((tick) => tick + 1);
  }

  protected fieldInvalid(name: 'supplierId' | 'documentDate' | 'totalText'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected totalInvalid(): boolean {
    const control = this.form.controls.totalText;
    if (!(control.touched || control.dirty) || !control.value.trim()) {
      return false;
    }
    const parsed = parseMoneyInput(control.value, this.currency);
    return parsed === null || parsed.amountMinor < 0;
  }

  protected onSupplierSelect(value: string | null): void {
    const previous = this.form.controls.supplierId.value;
    this.form.controls.supplierId.setValue(value ?? '');
    this.form.controls.supplierId.markAsTouched();
    this.selectedSupplierId.set(value ?? '');
    this.applySupplierDocumentNote(value ?? '');
    if (previous && previous !== value && this.includedReceipts().length > 0) {
      // Gli arrivi inclusi appartengono al fornitore precedente: non più validi.
      this.includedReceipts.set([]);
      this.syncAutoTotal();
    }
  }

  /**
   * "Inserisci nota" (anagrafica fornitore): compila le note della
   * registrazione senza sovrascrivere testo digitato dall'operatore.
   */
  private applySupplierDocumentNote(supplierId: string): void {
    if (this.isEditMode()) {
      return;
    }
    const supplier = supplierId
      ? (this.suppliers().find((entry) => entry.id === supplierId) ?? null)
      : null;
    const note = supplier?.documentCreationNote?.trim() ?? '';
    const control = this.form.controls.notes;
    const current = control.value.trim();
    if (note && (!current || current === this.lastAutoInsertedNote)) {
      control.setValue(note);
      this.lastAutoInsertedNote = note;
    } else if (!note && current && current === this.lastAutoInsertedNote) {
      control.setValue('');
      this.lastAutoInsertedNote = '';
    }
  }

  // ── Includi documento (prompt §5.1) ─────────────────────────────────────────

  protected openIncludePanel(): void {
    const supplierId = this.form.controls.supplierId.value;
    if (!supplierId) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Seleziona prima il fornitore: gli arrivi includibili dipendono dal fornitore.',
        },
      });
      return;
    }
    this._submitState.set({ status: 'idle' });
    this.includePanelOpen.set(true);
    this.linkableSelection.set(new Set());
    this.loadLinkableReceipts(supplierId);
  }

  protected closeIncludePanel(): void {
    this.includePanelOpen.set(false);
  }

  private loadLinkableReceipts(supplierId: string): void {
    this.linkableLoading.set(true);
    this.linkableError.set(null);
    this.documentService
      .listLinkableGoodsReceipts(supplierId, this.editDocumentId() ?? undefined)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          const includedIds = new Set(this.includedReceipts().map((row) => row.id));
          this.linkableReceipts.set(rows.filter((row) => !includedIds.has(row.id)));
          this.linkableLoading.set(false);
        },
        error: (err: unknown) => {
          this.linkableLoading.set(false);
          this.linkableError.set(this.toAppError(err));
        },
      });
  }

  protected toggleLinkableSelection(id: string): void {
    this.linkableSelection.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected includeSelectedReceipts(): void {
    const selection = this.linkableSelection();
    const toInclude = this.linkableReceipts().filter((row) => selection.has(row.id));
    if (toInclude.length === 0) {
      return;
    }
    this.includedReceipts.update((current) => [
      ...current,
      ...toInclude.map(
        (row): IncludedReceiptRow => ({
          id: row.id,
          number: row.number,
          reference: row.reference,
          documentDate: row.documentDate,
          causalText: row.causalText,
          subtotal: row.subtotal,
          tax: row.tax,
          total: row.total,
        }),
      ),
    ]);
    this.includePanelOpen.set(false);
    this.syncAutoTotal();
  }

  protected removeReceipt(id: string): void {
    this.includedReceipts.update((current) => current.filter((row) => row.id !== id));
    this.syncAutoTotal();
  }

  /** Riga riepilogativa (§5.2): "Arrivo merce n. 3 del 30/05/2026 - DDT 145…". */
  protected receiptSummaryLabel(row: IncludedReceiptRow): string {
    const number = row.number != null ? `n. ${row.number}` : (row.reference ?? '');
    const base = `Arrivo merce ${number} del ${formatDate(row.documentDate)}`.trim();
    return row.causalText?.trim() ? `${base} - ${row.causalText.trim()}` : base;
  }

  /**
   * Precompila il campo "Totale fattura" con la somma degli arrivi inclusi
   * (comodo default), ma solo finché l'utente non lo ha modificato a mano:
   * il valore digitato manualmente non viene mai sovrascritto, perché è
   * l'importo reale della fattura del fornitore che deve arrivare ai report.
   */
  private syncAutoTotal(): void {
    if (!this.isTotalTextAutoSafe()) {
      return;
    }
    const sumMinor = this.includedReceipts().reduce((sum, row) => sum + row.total.amountMinor, 0);
    this.autoFilledTotalMinor.set(sumMinor);
    this.form.controls.totalText.setValue(
      this.moneyToInputText({ amountMinor: sumMinor, currencyCode: this.currency }),
    );
  }

  /** True se il campo totale è ancora "vergine" oppure coincide con l'ultimo default scritto da noi. */
  private isTotalTextAutoSafe(): boolean {
    const control = this.form.controls.totalText;
    if (control.dirty) {
      return false;
    }
    const raw = control.value.trim();
    if (raw === '') {
      return true;
    }
    const parsed = parseMoneyInput(raw, this.currency);
    return parsed !== null && parsed.amountMinor === this.autoFilledTotalMinor();
  }

  // ── Salvataggio ─────────────────────────────────────────────────────────────

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.controls.supplierId.invalid || this.form.controls.documentDate.invalid) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Compila fornitore e data registrazione prima di salvare.',
        },
      });
      return;
    }
    const total = parseMoneyInput(this.form.controls.totalText.value, this.currency);
    if (total === null || total.amountMinor < 0) {
      this._submitState.set({
        status: 'error',
        error: {
          kind: AppErrorKind.Validation,
          message: 'Inserisci il totale della fattura ricevuta dal fornitore.',
        },
      });
      return;
    }

    const raw = this.form.getRawValue();
    this._submitState.set({ status: 'saving' });
    this.documentService
      .savePurchaseInvoice({
        id: this.editDocumentId() ?? this.loadedDocument()?.id ?? undefined,
        supplierId: raw.supplierId,
        documentDate: new Date(raw.documentDate).toISOString(),
        externalDocNumber: raw.externalDocNumber.trim() || undefined,
        externalDocDate: raw.externalDocDate
          ? new Date(raw.externalDocDate).toISOString()
          : undefined,
        notes: raw.notes.trim() || undefined,
        currency: this.currency,
        totalMinor: total.amountMinor,
        goodsReceiptIds: this.includedReceipts().map((row) => row.id),
      })
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Il totale fattura inserito a mano è sempre quello registrato: il
        // confronto con la somma degli arrivi è puramente informativo (vedi
        // tfoot della tabella arrivi inclusi) e non blocca né condiziona il
        // salvataggio.
        next: ({ document }) => {
          this._submitState.set({ status: 'idle' });
          void this.router.navigate(['/app/documents', document.id]);
        },
        error: (err: unknown) => {
          this._submitState.set({ status: 'error', error: this.toAppError(err) });
        },
      });
  }

  protected cancel(): void {
    void this.router.navigateByUrl(this.listPath + '?type=supplier_invoice');
  }

  private patchFormFromDocument(doc: DocumentRecord): void {
    this.selectedSupplierId.set(doc.supplierId ?? '');
    this.form.patchValue({
      supplierId: doc.supplierId ?? '',
      documentDate: doc.documentDate.slice(0, 10),
      externalDocNumber: doc.externalDocNumber ?? '',
      externalDocDate: doc.externalDocDate ? doc.externalDocDate.slice(0, 10) : '',
      totalText: this.moneyToInputText(doc.total),
      notes: doc.notes ?? '',
    });
    this.includedReceipts.set(
      (doc.linkedGoodsReceipts ?? []).map(
        (receipt): IncludedReceiptRow => ({
          id: receipt.id,
          number: receipt.number,
          reference: receipt.reference,
          documentDate: receipt.documentDate,
          causalText: receipt.causalText,
          subtotal: receipt.subtotal,
          tax: receipt.tax,
          total: receipt.total,
        }),
      ),
    );
  }

  private moneyToInputText(money: Money): string {
    if (money.amountMinor === 0) {
      return '';
    }
    return moneyToDecimalString(money).replace('.', ',');
  }

  private toAppError(err: unknown): AppError {
    return isAppError(err) ? err : mapHttpErrorToAppError(err);
  }
}
