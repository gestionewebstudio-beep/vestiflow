import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';

import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId } from '@core/models/common.model';
import type { DocumentType } from '@core/models/document.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { ToastService } from '@core/services/toast.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';
import type { SelectMenuOption } from '@shared/components/select-menu/select-menu.model';

import type {
  DocumentCounterView,
  SaveDocumentCounterBody,
} from '../../models/document-counter.model';
import { DocumentCountersService } from '../../services/document-counters.service';

/** Azione in attesa di conferma (spostamento numerazione o eliminazione). */
type PendingConfirm =
  | { readonly kind: 'move'; readonly id: EntityId; readonly body: SaveDocumentCounterBody }
  | { readonly kind: 'delete'; readonly counter: DocumentCounterView };

/** Valore "tutte le sedi" nella tendina sede. */
const ALL_LOCATIONS = '';

/**
 * Elenco serie di UN tipo documento, dentro la sua card in Impostazioni. Prima
 * voce sempre «Senza serie» (serie null, non eliminabile, base del tipo), poi
 * le serie aggiunte dall'operatore (nome libero, sede opzionale). Il prossimo
 * numero è in sola lettura (max+1). Una voce è predefinita. Le mutazioni
 * passano dal servizio; il refresh dei dati lo fa il padre via `changed`.
 */
@Component({
  selector: 'app-document-counters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, ConfirmDialogComponent, SelectMenuComponent],
  templateUrl: './document-counters.component.html',
  styleUrl: './document-counters.component.scss',
})
export class DocumentCountersComponent {
  private readonly service = inject(DocumentCountersService);
  private readonly locationsService = inject(OperationalLocationsService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Tipo documento a cui appartengono le serie di questa card. */
  readonly type = input.required<DocumentType>();
  /** Serie del tipo (incluse «Senza serie»), già caricate dal padre. */
  readonly counters = input.required<readonly DocumentCounterView[]>();
  /** Emesso dopo una mutazione: il padre ricarica i contatori. */
  readonly changed = output<void>();

  /** «Senza serie» (serie null) prima, poi le serie in ordine alfabetico. */
  protected readonly orderedSeries = computed(() =>
    [...this.counters()].sort((a, b) => {
      if (a.series === null) {
        return -1;
      }
      if (b.series === null) {
        return 1;
      }
      return a.series.localeCompare(b.series);
    }),
  );

  private readonly _editingId = signal<EntityId | null>(null);
  protected readonly editingId = this._editingId.asReadonly();
  private readonly _creating = signal(false);
  protected readonly isCreating = this._creating.asReadonly();
  protected readonly editorOpen = computed(() => this._creating() || this._editingId() !== null);

  private readonly _saving = signal(false);
  protected readonly saving = this._saving.asReadonly();

  // ── Conferma (spostamento / eliminazione) ──────────────────────────────────
  private readonly _pending = signal<PendingConfirm | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly confirmTitle = computed(() =>
    this._pending()?.kind === 'delete' ? 'Elimina serie' : 'Sposta numerazione',
  );
  protected readonly confirmMessage = computed(() => {
    const pending = this._pending();
    if (!pending) {
      return '';
    }
    if (pending.kind === 'delete') {
      const used = pending.counter.documentCount;
      return used > 0
        ? `Questa serie è usata da ${used} ${used === 1 ? 'documento' : 'documenti'}. ` +
            'Eliminarla non tocca i documenti già numerati, ma rimuove la serie. Procedere?'
        : 'Eliminare questa serie? I documenti già numerati non vengono toccati.';
    }
    return 'Stai spostando una numerazione già in uso. I documenti esistenti mantengono il loro numero; cambia solo da dove riparte il progressivo. Procedere?';
  });
  protected readonly confirmLabel = computed(() =>
    this._pending()?.kind === 'delete' ? 'Elimina' : 'Sposta',
  );
  protected readonly confirmDanger = computed(() => this._pending()?.kind === 'delete');

  /** Opzioni sede + "Tutte le sedi" in testa. */
  protected readonly locationOptions = computed<readonly SelectMenuOption[]>(() => [
    { value: ALL_LOCATIONS, label: 'Tutte le sedi' },
    ...this.locationsService.locations().map((location) => ({
      value: location.id,
      label: location.name,
    })),
  ]);

  protected readonly form = this.fb.group({
    series: this.fb.control(''),
    locationId: this.fb.control(ALL_LOCATIONS),
    isDefault: this.fb.control(false),
  });

  protected startCreate(): void {
    this.form.reset({ series: '', locationId: ALL_LOCATIONS, isDefault: false });
    this._editingId.set(null);
    this._creating.set(true);
  }

  protected startEdit(counter: DocumentCounterView): void {
    this.form.reset({
      series: counter.series ?? '',
      locationId: counter.locationId ?? ALL_LOCATIONS,
      isDefault: counter.isDefault,
    });
    this._creating.set(false);
    this._editingId.set(counter.id);
  }

  protected cancelEdit(): void {
    this._creating.set(false);
    this._editingId.set(null);
  }

  protected onLocationSelect(value: string | null): void {
    this.form.controls.locationId.setValue(value ?? ALL_LOCATIONS);
  }

  /** Rende predefinita una voce direttamente dall'elenco. */
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
          this.toast.showInfo('Serie predefinita aggiornata.');
          this.changed.emit();
        },
        error: (err: unknown) => this.toast.showError(this.toAppError(err).message),
      });
  }

  protected save(): void {
    if (this._saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    const series = raw.series.trim() || null;
    // «Senza serie» esiste già come base del tipo: una nuova voce ha un nome.
    if (series === null) {
      this.toast.showError('Il nome della serie è obbligatorio.');
      return;
    }
    const body: SaveDocumentCounterBody = {
      type: this.type(),
      series,
      locationId: raw.locationId || null,
      isDefault: raw.isDefault,
    };

    const editingId = this._editingId();
    if (editingId) {
      const current = this.counters().find((counter) => counter.id === editingId);
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
        next: () => this.onSaved('Serie creata.'),
        error: (err: unknown) => this.onSaveError(err),
      });
  }

  private persistUpdate(id: EntityId, body: SaveDocumentCounterBody): void {
    this._saving.set(true);
    this.service
      .update(id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onSaved('Serie aggiornata.'),
        error: (err: unknown) => this.onSaveError(err),
      });
  }

  private persistDelete(counter: DocumentCounterView): void {
    this.service
      .delete(counter.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.showInfo('Serie eliminata.');
          this.changed.emit();
        },
        error: (err: unknown) => this.toast.showError(this.toAppError(err).message),
      });
  }

  private onSaved(message: string): void {
    this._saving.set(false);
    this._creating.set(false);
    this._editingId.set(null);
    this.toast.showInfo(message);
    this.changed.emit();
  }

  private onSaveError(err: unknown): void {
    this._saving.set(false);
    this.toast.showError(this.toAppError(err).message);
  }

  private identityChanged(current: DocumentCounterView, body: SaveDocumentCounterBody): boolean {
    return (
      current.series !== body.series || (current.locationId ?? null) !== (body.locationId ?? null)
    );
  }

  private toAppError(err: unknown): AppError {
    if (isAppError(err)) {
      return err;
    }
    return { kind: AppErrorKind.Unknown, message: 'Errore imprevisto. Riprova.' };
  }
}
