import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import { DocumentType } from '@core/models/document.model';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { ToastService } from '@core/services/toast.service';
import { documentTypeLabel } from '@features/documents/models/document-labels.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import {
  COUNTER_CONFIGURABLE_TYPES,
  type DocumentCounterView,
  type SaveDocumentCounterBody,
} from '../../models/document-counter.model';
import { DocumentCountersService } from '../../services/document-counters.service';

type PageState = 'loading' | 'ready' | 'error';

/** Azione in attesa di conferma (spostamento numerazione o eliminazione). */
type PendingConfirm =
  | { readonly kind: 'move'; readonly id: EntityId; readonly body: SaveDocumentCounterBody }
  | { readonly kind: 'delete'; readonly counter: DocumentCounterView };

/** Valore "tutte le sedi" nella tendina location (contatore globale). */
const ALL_LOCATIONS = '';

/**
 * Numeratori configurabili (Impostazioni → documenti). Elenco dei contatori
 * (serie · tipo · location · prossimo numero) con creazione, modifica ed
 * eliminazione. Il prossimo numero è in sola lettura: lo calcola il backend
 * come max+1 sui documenti reali.
 */
@Component({
  selector: 'app-document-counters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SelectMenuComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './document-counters.component.html',
  styleUrl: './document-counters.component.scss',
})
export class DocumentCountersComponent {
  private readonly service = inject(DocumentCountersService);
  private readonly locationsService = inject(OperationalLocationsService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly documentTypeLabel = documentTypeLabel;
  protected readonly skeletonColumns = 6;

  private readonly _state = signal<PageState>('loading');
  protected readonly state = this._state.asReadonly();
  protected readonly loading = computed(() => this._state() === 'loading');

  private readonly _error = signal<AppError | null>(null);
  protected readonly error = this._error.asReadonly();

  private readonly _counters = signal<readonly DocumentCounterView[]>([]);
  protected readonly counters = this._counters.asReadonly();

  /** Id della riga in modifica (null se non stiamo modificando una esistente). */
  private readonly _editingId = signal<EntityId | null>(null);
  protected readonly editingId = this._editingId.asReadonly();
  private readonly _creating = signal(false);
  protected readonly isCreating = this._creating.asReadonly();
  /** Editor aperto in creazione o in modifica. */
  protected readonly editorOpen = computed(() => this._creating() || this._editingId() !== null);

  private readonly _saving = signal(false);
  protected readonly saving = this._saving.asReadonly();

  // ── Conferma (spostamento / eliminazione) ──────────────────────────────────
  private readonly _pending = signal<PendingConfirm | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly confirmTitle = computed(() =>
    this._pending()?.kind === 'delete' ? 'Elimina contatore' : 'Sposta numerazione',
  );
  protected readonly confirmMessage = computed(() => {
    const pending = this._pending();
    if (!pending) {
      return '';
    }
    if (pending.kind === 'delete') {
      const used = pending.counter.documentCount;
      return used > 0
        ? `Questo contatore è usato da ${used} ${used === 1 ? 'documento' : 'documenti'}. ` +
            'Eliminarlo non tocca i documenti già numerati, ma rimuove la configurazione. Procedere?'
        : 'Eliminare questo contatore? I documenti già numerati non vengono toccati.';
    }
    return 'Stai spostando una numerazione già in uso. I documenti esistenti mantengono il loro numero; cambia solo da dove riparte il progressivo. Procedere?';
  });
  protected readonly confirmLabel = computed(() =>
    this._pending()?.kind === 'delete' ? 'Elimina' : 'Sposta',
  );
  protected readonly confirmDanger = computed(() => this._pending()?.kind === 'delete');

  protected readonly typeOptions: readonly SelectMenuOption[] = COUNTER_CONFIGURABLE_TYPES.map(
    (type) => ({ value: type, label: documentTypeLabel(type) }),
  );

  /** Opzioni sede + "Tutte le sedi" in testa (contatore globale). */
  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() => [
    { value: ALL_LOCATIONS, label: 'Tutte le sedi' },
    ...this.locationsService.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  ]);

  protected readonly form = this.fb.group({
    type: this.fb.control<DocumentType>(DocumentType.Quote),
    series: this.fb.control(''),
    locationId: this.fb.control(ALL_LOCATIONS),
    isDefault: this.fb.control(false),
  });

  /** Serie proposta alla creazione: l'anno corrente (reset annuale se la si tiene). */
  private currentYearSeries(): string {
    return String(new Date().getFullYear());
  }

  constructor() {
    this.load();
  }

  protected load(): void {
    this._state.set('loading');
    this._error.set(null);
    this.service
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (counters) => {
          this._counters.set(counters);
          this._state.set('ready');
        },
        error: (err: unknown) => {
          this._error.set(this.toAppError(err));
          this._state.set('error');
        },
      });
  }

  protected startCreate(): void {
    this.form.reset({
      type: this.typeOptions[0]?.value as DocumentType,
      series: this.currentYearSeries(),
      locationId: ALL_LOCATIONS,
      isDefault: false,
    });
    this._editingId.set(null);
    this._creating.set(true);
  }

  protected startEdit(counter: DocumentCounterView): void {
    this.form.reset({
      type: counter.type,
      series: counter.series ?? '',
      locationId: counter.locationId ?? ALL_LOCATIONS,
      isDefault: counter.isDefault,
    });
    this._creating.set(false);
    this._editingId.set(counter.id);
  }

  /** Rende predefinito un contatore direttamente dall'elenco. */
  protected setDefault(counter: DocumentCounterView): void {
    this.service
      .update(counter.id, {
        type: counter.type,
        series: counter.series,
        locationId: counter.locationId,
        isDefault: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.showInfo('Contatore predefinito aggiornato.');
          this.reload();
        },
        error: (err: unknown) => this.toast.showError(this.toAppError(err).message),
      });
  }

  protected cancelEdit(): void {
    this._creating.set(false);
    this._editingId.set(null);
  }

  protected onTypeSelect(value: string | null): void {
    if (value) {
      this.form.controls.type.setValue(value as DocumentType);
    }
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? ALL_LOCATIONS);
  }

  protected save(): void {
    if (this._saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    // Serie vuota = «senza serie» (riferimento senza il token serie).
    const body: SaveDocumentCounterBody = {
      type: raw.type,
      series: raw.series.trim() || null,
      locationId: raw.locationId || null,
      isDefault: raw.isDefault,
    };

    const editingId = this._editingId();
    if (editingId) {
      const current = this._counters().find((counter) => counter.id === editingId);
      // Spostare una numerazione in uso è un'azione da confermare.
      if (current && current.documentCount > 0 && this.identityChanged(current, body)) {
        this._pending.set({ kind: 'move', id: editingId, body });
        this.confirmOpen.set(true);
        return;
      }
      this.persistUpdate(editingId, body);
      return;
    }
    this.persistCreate(body);
  }

  protected requestDelete(counter: DocumentCounterView): void {
    this._pending.set({ kind: 'delete', counter });
    this.confirmOpen.set(true);
  }

  protected onConfirm(): void {
    const pending = this._pending();
    this.confirmOpen.set(false);
    this._pending.set(null);
    if (!pending) {
      return;
    }
    if (pending.kind === 'delete') {
      this.persistDelete(pending.counter);
    } else {
      this.persistUpdate(pending.id, pending.body);
    }
  }

  protected onDismissConfirm(): void {
    this.confirmOpen.set(false);
    this._pending.set(null);
  }

  private persistCreate(body: SaveDocumentCounterBody): void {
    this._saving.set(true);
    this.service
      .create(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onSaved('Contatore creato.'),
        error: (err: unknown) => this.onSaveError(err),
      });
  }

  private persistUpdate(id: EntityId, body: SaveDocumentCounterBody): void {
    this._saving.set(true);
    this.service
      .update(id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onSaved('Contatore aggiornato.'),
        error: (err: unknown) => this.onSaveError(err),
      });
  }

  private persistDelete(counter: DocumentCounterView): void {
    this.service
      .delete(counter.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.showInfo('Contatore eliminato.');
          this.reload();
        },
        error: (err: unknown) => this.toast.showError(this.toAppError(err).message),
      });
  }

  private onSaved(message: string): void {
    this._saving.set(false);
    this._creating.set(false);
    this._editingId.set(null);
    this.toast.showInfo(message);
    this.reload();
  }

  private onSaveError(err: unknown): void {
    this._saving.set(false);
    this.toast.showError(this.toAppError(err).message);
  }

  /** Ricarica l'elenco preservando lo stato (i prossimi numeri possono cambiare). */
  private reload(): void {
    this.service
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (counters) => this._counters.set(counters),
        error: (err: unknown) => this.toast.showError(this.toAppError(err).message),
      });
  }

  private identityChanged(current: DocumentCounterView, body: SaveDocumentCounterBody): boolean {
    return (
      current.type !== body.type ||
      current.series !== body.series ||
      (current.locationId ?? null) !== (body.locationId ?? null)
    );
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
