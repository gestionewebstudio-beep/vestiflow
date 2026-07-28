import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type FormControl,
  type FormGroup,
} from '@angular/forms';
import { Router } from '@angular/router';
import type { Subscription } from 'rxjs';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import { DocumentType } from '@core/models/document.model';
import type { DocumentTypeSetting } from '@core/models/document.model';
import { ToastService } from '@core/services/toast.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { DocumentCountersComponent } from './components/document-counters/document-counters.component';
import { documentTypeLabel } from './models/document-labels.util';
import type { DocumentCounterView } from './models/document-counter.model';
import { DocumentCountersService } from './services/document-counters.service';
import {
  DocumentSettingsService,
  type DocumentTypeSettingPatch,
} from './services/document-settings.service';

interface SettingFormControls {
  readonly enabled: FormControl<boolean>;
  readonly printTitle: FormControl<string>;
  readonly numberPrefix: FormControl<string>;
  readonly pricesIncludeVat: FormControl<boolean>;
  readonly defaultNotes: FormControl<string>;
}

interface SettingRow {
  readonly type: DocumentType;
  readonly label: string;
  readonly form: FormGroup<SettingFormControls>;
}

type PageState = 'loading' | 'ready' | 'error';

/**
 * Impostazioni per tipo documento (§2.2): abilitazione, titolo di stampa, serie,
 * prefisso, prezzi IVA inclusa e note. Un form per tipo, salvataggio
 * indipendente per riga.
 */
@Component({
  selector: 'app-document-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
    DocumentCountersComponent,
  ],
  templateUrl: './document-settings.component.html',
  styleUrl: './document-settings.component.scss',
})
export class DocumentSettingsComponent {
  private readonly service = inject(DocumentSettingsService);
  private readonly countersService = inject(DocumentCountersService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly skeletonColumns = 4;

  /** Contatori (serie) raggruppati per tipo, per le card. */
  private readonly _countersByType = signal<ReadonlyMap<DocumentType, DocumentCounterView[]>>(
    new Map(),
  );

  protected countersFor(type: DocumentType): readonly DocumentCounterView[] {
    return this._countersByType().get(type) ?? [];
  }

  /**
   * La sezione serie compare solo dove il tipo possiede il proprio numeratore.
   * La Fattura accompagnatoria condivide quello della Fattura: si configura lì.
   */
  protected seriesConfigurable(type: DocumentType): boolean {
    return type !== DocumentType.InvoiceAccompanying;
  }

  private readonly _state = signal<PageState>('loading');
  protected readonly state = this._state.asReadonly();

  private readonly _error = signal<AppError | null>(null);
  protected readonly error = this._error.asReadonly();

  private readonly _rows = signal<readonly SettingRow[]>([]);
  protected readonly rows = this._rows.asReadonly();

  private readonly _savingTypes = signal<ReadonlySet<DocumentType>>(new Set());

  protected readonly loading = computed(() => this._state() === 'loading');

  // takeUntilDestroyed() gestisce l'unsubscribe; i campi evitano subscription "ignorate".
  private loadSubscription: Subscription | null = null;
  private saveSubscription: Subscription | null = null;

  constructor() {
    this.load();
  }

  protected isSaving(type: DocumentType): boolean {
    return this._savingTypes().has(type);
  }

  protected goToList(): void {
    void this.router.navigateByUrl('/app/documents');
  }

  protected load(): void {
    this._state.set('loading');
    this._error.set(null);
    this.reloadCounters();
    this.loadSubscription = this.service
      .getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this._rows.set(settings.map((setting) => this.toRow(setting)));
          this._state.set('ready');
        },
        error: (err: unknown) => {
          this._error.set(this.toAppError(err));
          this._state.set('error');
        },
      });
  }

  /** Ricarica i contatori (dopo una mutazione in una card) e li raggruppa. */
  protected reloadCounters(): void {
    this.countersService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (counters) => {
          const grouped = new Map<DocumentType, DocumentCounterView[]>();
          for (const counter of counters) {
            const list = grouped.get(counter.type) ?? [];
            list.push(counter);
            grouped.set(counter.type, list);
          }
          this._countersByType.set(grouped);
        },
        // I contatori non sono critici per le card: in errore restano vuoti.
        error: () => undefined,
      });
  }

  protected save(row: SettingRow): void {
    if (this.isSaving(row.type) || row.form.invalid) {
      return;
    }
    const value = row.form.getRawValue();
    const patch: DocumentTypeSettingPatch = {
      enabled: value.enabled,
      printTitle: value.printTitle.trim(),
      numberPrefix: value.numberPrefix.trim(),
      pricesIncludeVat: value.pricesIncludeVat,
      defaultNotes: value.defaultNotes.trim(),
    };

    this.setSaving(row.type, true);
    this.saveSubscription = this.service
      .updateSetting(row.type, patch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.setSaving(row.type, false);
          row.form.reset(this.toFormValue(updated));
          row.form.markAsPristine();
          this.toast.showInfo(`Impostazioni "${row.label}" salvate.`);
        },
        error: (err: unknown) => {
          this.setSaving(row.type, false);
          this.toast.showError(this.toAppError(err).message);
        },
      });
  }

  private toRow(setting: DocumentTypeSetting): SettingRow {
    return {
      type: setting.type,
      label: documentTypeLabel(setting.type),
      form: this.fb.group<SettingFormControls>({
        enabled: this.fb.control(setting.enabled),
        printTitle: this.fb.control(setting.printTitle),
        numberPrefix: this.fb.control(setting.numberPrefix),
        pricesIncludeVat: this.fb.control(setting.pricesIncludeVat),
        defaultNotes: this.fb.control(setting.defaultNotes ?? ''),
      }),
    };
  }

  private toFormValue(setting: DocumentTypeSetting): {
    enabled: boolean;
    printTitle: string;
    numberPrefix: string;
    pricesIncludeVat: boolean;
    defaultNotes: string;
  } {
    return {
      enabled: setting.enabled,
      printTitle: setting.printTitle,
      numberPrefix: setting.numberPrefix,
      pricesIncludeVat: setting.pricesIncludeVat,
      defaultNotes: setting.defaultNotes ?? '',
    };
  }

  private setSaving(type: DocumentType, saving: boolean): void {
    this._savingTypes.update((current) => {
      const next = new Set(current);
      if (saving) {
        next.add(type);
      } else {
        next.delete(type);
      }
      return next;
    });
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
