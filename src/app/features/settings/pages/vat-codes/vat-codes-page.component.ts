import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { ToastService } from '@core/services/toast.service';
import { VatCodeService, type UpsertVatCodeBody } from '@core/services/vat-code.service';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import type { EntityId } from '@core/models/common.model';
import {
  formatVatRate,
  VAT_CALCULATION_MODE_LABELS,
  VAT_USAGE_SCOPE_LABELS,
  type VatCalculationMode,
  type VatCode,
  type VatNature,
  type VatUsageScope,
} from '@core/models/vat-code.model';

type ActiveFilter = 'all' | 'active' | 'inactive';
type PanelMode = 'create' | 'edit' | 'duplicate';

interface VatCodeGroup {
  readonly nature: VatNature;
  readonly codes: readonly VatCode[];
}

const CODE_PATTERN = /^[A-Za-z0-9._-]{1,16}$/;

const USAGE_SCOPE_OPTIONS: readonly { readonly value: VatUsageScope; readonly label: string }[] = (
  ['both', 'purchase', 'sales'] as const
).map((value) => ({ value, label: VAT_USAGE_SCOPE_LABELS[value] }));

const CALCULATION_MODE_OPTIONS: readonly {
  readonly value: VatCalculationMode;
  readonly label: string;
}[] = (
  [
    'standard',
    'zero_rate',
    'reverse_charge',
    'split_payment',
    'margin_scheme',
    'informational',
  ] as const
).map((value) => ({ value, label: VAT_CALCULATION_MODE_LABELS[value] }));

/**
 * Pagina Impostazioni > Codici IVA: elenco raggruppato per Natura,
 * ricerca, filtri e CRUD con pannello laterale (§5).
 */
@Component({
  selector: 'app-vat-codes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './vat-codes-page.component.html',
  styleUrl: './vat-codes-page.component.scss',
})
export class VatCodesPageComponent {
  private readonly vatCodeService = inject(VatCodeService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly usageScopeOptions = USAGE_SCOPE_OPTIONS;
  protected readonly calculationModeOptions = CALCULATION_MODE_OPTIONS;
  protected readonly scopeLabels = VAT_USAGE_SCOPE_LABELS;
  protected readonly modeLabels = VAT_CALCULATION_MODE_LABELS;

  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly vatCodes = signal<readonly VatCode[]>([]);
  protected readonly natures = signal<readonly VatNature[]>([]);

  // ── Filtri ────────────────────────────────────────────────────────
  protected readonly searchQuery = signal('');
  protected readonly natureFilter = signal<string>('');
  protected readonly scopeFilter = signal<string>('');
  protected readonly activeFilter = signal<ActiveFilter>('all');
  private readonly collapsedNatureIds = signal<ReadonlySet<string>>(new Set());

  // ── Pannello di modifica ──────────────────────────────────────────
  protected readonly panelOpen = signal(false);
  protected readonly panelMode = signal<PanelMode>('create');
  protected readonly editingId = signal<EntityId | null>(null);
  protected readonly saving = signal(false);
  protected readonly panelError = signal<string | null>(null);
  protected readonly deleteDialogOpen = signal(false);
  protected readonly deleting = signal(false);

  protected readonly form = this.fb.group({
    code: this.fb.control('', {
      validators: [Validators.required, Validators.pattern(CODE_PATTERN)],
    }),
    natureId: this.fb.control('', { validators: [Validators.required] }),
    ratePercent: this.fb.control(0, {
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    nonDeductiblePercent: this.fb.control(0, {
      validators: [Validators.min(0), Validators.max(100)],
    }),
    description: this.fb.control('', { validators: [Validators.required] }),
    notes: this.fb.control(''),
    usageScope: this.fb.control<VatUsageScope>('both'),
    calculationMode: this.fb.control<VatCalculationMode>('standard'),
    vatAffectsSupplierTotal: this.fb.control(true),
    isDefault: this.fb.control(false),
    isActive: this.fb.control(true),
  });

  protected readonly filteredCodes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const natureId = this.natureFilter();
    const scope = this.scopeFilter();
    const active = this.activeFilter();
    return this.vatCodes().filter((entry) => {
      if (natureId && entry.natureId !== natureId) {
        return false;
      }
      if (scope && entry.usageScope !== scope) {
        return false;
      }
      if (active === 'active' && !entry.isActive) {
        return false;
      }
      if (active === 'inactive' && entry.isActive) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack =
        `${entry.code} ${entry.description} ${entry.notes ?? ''} ${entry.nature.label}`.toLowerCase();
      return haystack.includes(query);
    });
  });

  protected readonly groups = computed<readonly VatCodeGroup[]>(() => {
    const byNature = new Map<string, VatCode[]>();
    for (const entry of this.filteredCodes()) {
      const bucket = byNature.get(entry.natureId);
      if (bucket) {
        bucket.push(entry);
      } else {
        byNature.set(entry.natureId, [entry]);
      }
    }
    return [...byNature.entries()]
      .map(([, codes]) => {
        const sorted = [...codes].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
        );
        // Non-null: ogni bucket contiene almeno una voce con la propria nature.
        return { nature: sorted[0]!.nature, codes: sorted } satisfies VatCodeGroup;
      })
      .sort((a, b) => a.nature.sortOrder - b.nature.sortOrder);
  });

  protected readonly hasFilters = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.natureFilter() !== '' ||
      this.scopeFilter() !== '' ||
      this.activeFilter() !== 'all',
  );

  protected readonly panelTitle = computed(() => {
    switch (this.panelMode()) {
      case 'create':
        return 'Nuovo Codice IVA';
      case 'duplicate':
        return 'Duplica Codice IVA';
      case 'edit':
        return 'Modifica Codice IVA';
    }
  });

  protected readonly editingCode = computed(() => {
    const id = this.editingId();
    return id ? (this.vatCodes().find((entry) => entry.id === id) ?? null) : null;
  });

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set(false);
    forkJoin({
      codes: this.vatCodeService.list(),
      natures: this.vatCodeService.listNatures(),
    })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of(null);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (!result) {
          return;
        }
        this.vatCodes.set(result.codes);
        this.natures.set(result.natures);
      });
  }

  protected formatRate(ratePercent: number): string {
    return formatVatRate(ratePercent);
  }

  protected isCollapsed(natureId: string): boolean {
    return this.collapsedNatureIds().has(natureId);
  }

  protected toggleGroup(natureId: string): void {
    const next = new Set(this.collapsedNatureIds());
    if (next.has(natureId)) {
      next.delete(natureId);
    } else {
      next.add(natureId);
    }
    this.collapsedNatureIds.set(next);
  }

  protected onSearchInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.searchQuery.set(target.value);
    }
  }

  protected onNatureFilterChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      this.natureFilter.set(target.value);
    }
  }

  protected onScopeFilterChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      this.scopeFilter.set(target.value);
    }
  }

  protected onActiveFilterChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      this.activeFilter.set(target.value as ActiveFilter);
    }
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.natureFilter.set('');
    this.scopeFilter.set('');
    this.activeFilter.set('all');
  }

  // ── Pannello ──────────────────────────────────────────────────────

  protected openCreate(): void {
    this.panelMode.set('create');
    this.editingId.set(null);
    this.panelError.set(null);
    const defaultNature = this.natures().find((nature) => nature.key === 'TAXABLE');
    this.form.reset({
      code: '',
      natureId: defaultNature?.id ?? '',
      ratePercent: 0,
      nonDeductiblePercent: 0,
      description: '',
      notes: '',
      usageScope: 'both',
      calculationMode: 'standard',
      vatAffectsSupplierTotal: true,
      isDefault: false,
      isActive: true,
    });
    this.panelOpen.set(true);
  }

  protected openEdit(entry: VatCode): void {
    this.panelMode.set('edit');
    this.editingId.set(entry.id);
    this.panelError.set(null);
    this.form.reset(this.formValueFrom(entry));
    this.panelOpen.set(true);
  }

  protected openDuplicate(entry: VatCode): void {
    this.panelMode.set('duplicate');
    this.editingId.set(null);
    this.panelError.set(null);
    this.form.reset({
      ...this.formValueFrom(entry),
      code: '',
      isDefault: false,
    });
    this.panelOpen.set(true);
  }

  protected closePanel(): void {
    if (this.saving()) {
      return;
    }
    this.panelOpen.set(false);
  }

  /** Alla scelta della Natura in creazione, precompila ambito e modalità dai default. */
  protected onNatureChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement) || this.panelMode() === 'edit') {
      return;
    }
    const nature = this.natures().find((entry) => entry.id === target.value);
    if (nature) {
      this.form.patchValue({
        usageScope: nature.defaultUsageScope,
        calculationMode: nature.defaultCalculationMode,
      });
    }
  }

  protected save(): void {
    if (this.saving()) {
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const raw = this.form.getRawValue();
    const body: UpsertVatCodeBody = {
      code: raw.code.trim(),
      natureId: raw.natureId,
      ratePercent: raw.ratePercent,
      nonDeductiblePercent: raw.nonDeductiblePercent,
      description: raw.description.trim(),
      notes: raw.notes.trim(),
      usageScope: raw.usageScope,
      calculationMode: raw.calculationMode,
      vatAffectsSupplierTotal: raw.vatAffectsSupplierTotal,
      isDefault: raw.isDefault,
      isActive: raw.isActive,
    };
    this.saving.set(true);
    this.panelError.set(null);
    const editingId = this.editingId();
    const request$ = editingId
      ? this.vatCodeService.update(editingId, body)
      : this.vatCodeService.create(body);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.panelOpen.set(false);
        this.toast.showInfo(editingId ? 'Codice IVA aggiornato.' : 'Codice IVA creato.');
        this.reload();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.panelError.set(this.errorMessage(error));
      },
    });
  }

  protected requestDelete(): void {
    this.deleteDialogOpen.set(true);
  }

  protected confirmDelete(): void {
    const id = this.editingId();
    if (!id || this.deleting()) {
      return;
    }
    this.deleting.set(true);
    this.vatCodeService
      .delete(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.deleteDialogOpen.set(false);
          this.panelOpen.set(false);
          this.toast.showInfo('Codice IVA eliminato.');
          this.reload();
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.deleteDialogOpen.set(false);
          this.panelError.set(this.errorMessage(error));
        },
      });
  }

  private formValueFrom(entry: VatCode): {
    code: string;
    natureId: string;
    ratePercent: number;
    nonDeductiblePercent: number;
    description: string;
    notes: string;
    usageScope: VatUsageScope;
    calculationMode: VatCalculationMode;
    vatAffectsSupplierTotal: boolean;
    isDefault: boolean;
    isActive: boolean;
  } {
    return {
      code: entry.code,
      natureId: entry.natureId,
      ratePercent: entry.ratePercent,
      nonDeductiblePercent: entry.nonDeductiblePercent,
      description: entry.description,
      notes: entry.notes ?? '',
      usageScope: entry.usageScope,
      calculationMode: entry.calculationMode,
      vatAffectsSupplierTotal: entry.vatAffectsSupplierTotal,
      isDefault: entry.isDefault,
      isActive: entry.isActive,
    };
  }

  private errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const { message } = error;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
    return 'Operazione non riuscita. Riprova.';
  }
}
