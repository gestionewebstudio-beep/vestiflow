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
import { catchError, forkJoin, of } from 'rxjs';

import { AuthService } from '@core/auth';
import { canManageSettingsCompany } from '@core/permissions/tenant-permissions.util';
import { ToastService } from '@core/services/toast.service';
import { VatCodeService, type UpsertVatCodeBody } from '@core/services/vat-code.service';
import { BackButtonComponent } from '@shared/components/back-button/back-button.component';
import { BadgeComponent } from '@shared/components/badge/badge.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { DataTableCellDirective } from '@shared/components/data-table/data-table-cell.directive';
import { DataTableRowCardDirective } from '@shared/components/data-table/data-table-row-card.directive';
import { DataTableComponent } from '@shared/components/data-table/data-table.component';
import type {
  DataTableRowTone,
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from '@shared/components/data-table/data-table.model';
import { DeleteConfirmComponent } from '@shared/components/delete-confirm/delete-confirm.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { ListActionsBarComponent } from '@shared/components/list-actions-bar/list-actions-bar.component';
import { SlidePanelComponent } from '@shared/components/slide-panel/slide-panel.component';
import { TableColumnPickerComponent } from '@shared/components/table-column-picker/table-column-picker.component';
import { TableFiltersButtonComponent } from '@shared/components/table-filters/table-filters-button.component';
import { TableFiltersPanelComponent } from '@shared/components/table-filters/table-filters-panel.component';
import { TableSelectionToggleComponent } from '@shared/components/table-selection-toggle/table-selection-toggle.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import { createColumnFilters } from '@shared/table-columns/column-filters';
import { ordinaPerColonne } from '@shared/table-columns/column-sort.util';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { comando } from '@shared/models/list-action-catalog';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import type { ListAction } from '@shared/models/list-selection.model';
import { createListSelection } from '@shared/utils/list-selection';
import { createSelectionMode } from '@shared/utils/selection-mode';

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

import {
  VAT_CODES_COLUMN_DEFS,
  VAT_CODES_COLUMN_PRESETS,
  VAT_CODES_VIEW,
} from '../../models/vat-codes-table-columns.config';

type PanelMode = 'create' | 'edit' | 'duplicate';

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
 *
 * ⭐ **L’elenco è sul motore comune** (`docs/26` A6 · D3, 11/09/2026): una
 * sezione COMPRIMIBILE per Natura — la capacità aggiunta al motore apposta —
 * i tre `<select>` locali sostituiti dai filtri di colonna con lo stesso
 * significato (Natura, Ambito, Stato), la Ricerca in barra, «Duplica» come
 * comando di riga, il clic di riga che apre la scheda come prima.
 */
@Component({
  selector: 'app-vat-codes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    BackButtonComponent,
    BadgeComponent,
    ButtonComponent,
    DeleteConfirmComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SlidePanelComponent,
    TableSkeletonComponent,
    DataTableComponent,
    DataTableCellDirective,
    DataTableRowCardDirective,
    ListActionsBarComponent,
    TableColumnPickerComponent,
    TableFiltersButtonComponent,
    TableFiltersPanelComponent,
    TableSelectionToggleComponent,
  ],
  templateUrl: './vat-codes-page.component.html',
  styleUrl: './vat-codes-page.component.scss',
})
export class VatCodesPageComponent {
  private readonly vatCodeService = inject(VatCodeService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly preferenzeColonne = inject(TableColumnPreferenceService);
  private readonly filterStore = inject(ColumnFilterStore);

  /**
   * Chi non lo ha vede l'elenco e la scheda di un Codice IVA, ma non i comandi
   * che ne creano, duplicano, salvano o eliminano uno: la sezione Impostazioni
   * apre questa pagina, le scritture restano al permesso «Impostazioni azienda».
   */
  protected readonly puoGestireImpostazioniAzienda = computed(() =>
    canManageSettingsCompany(this.auth.currentUser()),
  );

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

  // ── Motore tabella ────────────────────────────────────────────────
  protected readonly vista = VAT_CODES_VIEW;
  // ⛔ Assegnate nel costruttore, dopo `registerView`.
  protected readonly colonne: ReturnType<TableColumnPreferenceService['visibleColumns']>;
  protected readonly ordine = signal<readonly DataTableSort[]>([]);
  protected readonly filtriAperti = signal(false);

  protected readonly rowId = (entry: VatCode): string => entry.id;
  protected readonly rowLabel = (entry: VatCode): string => `Apri ${entry.code}`;
  protected readonly selectionLabel = (entry: VatCode): string => `Seleziona ${entry.code}`;

  /**
   * ⭐ **«Duplica» sta nella barra comandi, sulla selezione** — la stessa forma
   * di Clienti e Fornitori (`regole-stile-ui`, «La barra comandi di un elenco»).
   * Era un pulsante per riga: il motore tiene quel comando di riga come
   * transitorio e nessun altro elenco lo usa più.
   */
  private readonly selection = createListSelection('multiple');
  protected readonly selectedIds = this.selection.ids;
  /** La modalità «Seleziona» della vista a card: spegnerla azzera (`createSelectionMode`). */
  protected readonly modoSelezione = createSelectionMode(this.selection);

  protected readonly listActions = computed<readonly ListAction[]>(() => {
    if (!this.puoGestireImpostazioniAzienda()) {
      return [];
    }
    return [
      comando('duplicate', {
        ariaLabel: 'Duplica il Codice IVA selezionato',
        run: (target) => {
          if (target.scope === 'selection' && target.ids[0]) {
            const entry = this.vatCodes().find((codice) => codice.id === target.ids[0]);
            if (entry) {
              this.openDuplicate(entry);
            }
          }
        },
      }),
    ];
  });

  /**
   * ⭐ **La riga totali non sparisce mai** (`regole-stile-ui`): qui non c’è
   * niente da sommare — aliquote di codici diversi non fanno un numero — ma il
   * conteggio «N voci» c’è, e segue il filtro e la selezione come ovunque.
   */
  protected readonly totali = computed<DataTableTotals>(() =>
    totaliDiElenco(this.righeFiltrate(), {
      rowId: this.rowId,
      selectedIds: this.selectedIds(),
      columns: this.colonne(),
      campi: {},
    }),
  );

  protected toggleSelection(id: string, selected: boolean): void {
    this.selection.toggle(id, selected);
  }

  protected toggleSelectAll(selected: boolean): void {
    this.selection.setAll(
      this.righeFiltrate().map((entry) => entry.id),
      selected,
    );
  }

  protected clearSelection(): void {
    this.selection.clear();
  }
  protected readonly rowTone = (entry: VatCode): DataTableRowTone | null =>
    entry.isActive ? null : 'muted';

  /** Il testo di ogni cella: è ciò che filtri, ordinamento e card leggono. */
  protected readonly testoCella = (entry: VatCode, colonna: string): string => {
    switch (colonna) {
      case 'vatCode':
        return entry.code;
      case 'ratePercent':
        return formatVatRate(entry.ratePercent);
      case 'nonDeductiblePercent':
        return entry.nonDeductiblePercent > 0 ? formatVatRate(entry.nonDeductiblePercent) : '—';
      case 'description':
        return entry.description;
      case 'vatNotes':
        return entry.notes || '—';
      case 'natura':
        return entry.nature.label;
      case 'usageScope':
        return VAT_USAGE_SCOPE_LABELS[entry.usageScope];
      case 'status':
        return entry.isActive ? 'Attivo' : 'Disattivato';
      default:
        return '';
    }
  };

  // ⚠️ `numeroDi` sulle due percentuali: senza, il filtro a intervallo non
  //    filtra e l’ordinamento confronta «10 %» prima di «4 %».
  private readonly numeroDi = (entry: VatCode, colonna: string): number | null => {
    if (colonna === 'ratePercent') {
      return entry.ratePercent;
    }
    if (colonna === 'nonDeductiblePercent') {
      return entry.nonDeductiblePercent;
    }
    return null;
  };

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

  /** La Ricerca resta in barra: è uno dei due filtri che non entrano nelle colonne. */
  protected readonly filteredCodes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.vatCodes();
    }
    return this.vatCodes().filter((entry) => {
      const haystack =
        `${entry.code} ${entry.description} ${entry.notes ?? ''} ${entry.nature.label}`.toLowerCase();
      return haystack.includes(query);
    });
  });

  // ⭐ Natura, Ambito e Stato: gli stessi tre filtri di prima, come filtri di
  //    colonna condivisi — con lo stesso significato, ma a valori, con la
  //    ricerca nel pannello e il verso Includi/Escludi.
  private readonly righeFiltrate = createColumnFilters<VatCode>({
    viewId: () => VAT_CODES_VIEW,
    righe: () => this.filteredCodes(),
    cellText: this.testoCella,
    numeroDi: this.numeroDi,
  });

  /**
   * ⭐ **Una sezione COMPRIMIBILE per Natura**, nell’ordine delle Nature; dentro,
   * l’ordine del catalogo (`sortOrder`, poi codice) finché l’operatore non ne
   * sceglie uno dalle intestazioni. Il conteggio sta nel titolo, come prima.
   */
  protected readonly sezioni = computed<readonly DataTableSection<VatCode>[]>(() => {
    const byNature = new Map<string, VatCode[]>();
    for (const entry of this.righeFiltrate()) {
      const bucket = byNature.get(entry.natureId);
      if (bucket) {
        bucket.push(entry);
      } else {
        byNature.set(entry.natureId, [entry]);
      }
    }
    return [...byNature.values()]
      .map((codes) => {
        const ordinati = [...codes].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
        );
        // Non-null: ogni bucket contiene almeno una voce con la propria nature.
        const nature = ordinati[0]!.nature;
        return {
          nature,
          sezione: {
            id: nature.id,
            header: `${nature.label} (${ordinati.length})`,
            collapsible: true,
            rows: ordinaPerColonne(ordinati, this.ordine(), {
              cellText: this.testoCella,
              numeroDi: this.numeroDi,
            }),
          } satisfies DataTableSection<VatCode>,
        };
      })
      .sort((a, b) => a.nature.sortOrder - b.nature.sortOrder)
      .map((voce) => voce.sezione);
  });

  protected readonly hasFilters = computed(
    () => this.searchQuery().trim().length > 0 || this.filterStore.conteggio(VAT_CODES_VIEW)() > 0,
  );

  protected readonly emptyStateDescription = computed(() => {
    if (this.hasFilters()) {
      return 'Nessuna voce corrisponde ai filtri correnti.';
    }
    return this.puoGestireImpostazioniAzienda()
      ? 'Crea il primo Codice IVA per usarlo su articoli e documenti.'
      : 'Il negozio non ha ancora Codici IVA configurati.';
  });

  /** Vuota = nessuna CTA: a chi non può creare non si propone di creare. */
  protected readonly emptyStateCtaLabel = computed(() => {
    if (this.hasFilters()) {
      return 'Azzera filtri';
    }
    return this.puoGestireImpostazioniAzienda() ? 'Nuovo Codice IVA' : '';
  });

  protected readonly panelTitle = computed(() => {
    if (!this.puoGestireImpostazioniAzienda()) {
      return 'Dettaglio Codice IVA';
    }
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
    this.preferenzeColonne.registerView(
      VAT_CODES_VIEW,
      VAT_CODES_COLUMN_DEFS,
      VAT_CODES_COLUMN_PRESETS,
    );
    this.colonne = this.preferenzeColonne.visibleColumns(VAT_CODES_VIEW);

    if (!this.puoGestireImpostazioniAzienda()) {
      // La scheda resta consultabile: i campi mostrano i valori salvati, ma non
      // accettano modifiche che il server rifiuterebbe comunque.
      this.form.disable();
    }
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

  protected onSearchInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.searchQuery.set(target.value);
    }
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.filterStore.azzera(VAT_CODES_VIEW);
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
