import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, concatMap, from, map, of, startWith, switchMap, take, toArray } from 'rxjs';

import { isAppError } from '@core/models/app-error.model';
import type { Attachment, AttachmentEntityType } from '@core/models/attachment.model';
import { attachmentIconClass, formatAttachmentSize } from '@core/models/attachment-rules.util';
import type { EntityId } from '@core/models/common.model';
import { AttachmentsApiService } from '@core/services/attachments-api.service';
import { formatDate } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { AttachmentsDialogComponent } from '@shared/components/attachments-dialog/attachments-dialog.component';
import type { AttachmentRenameEvent } from '@shared/components/attachments-dialog/attachments-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

type AttachmentsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly Attachment[] }
  | { readonly status: 'error' };

/**
 * Pannello Allegati generico e riusabile (sottosistema polimorfico): elenca
 * gli allegati di una qualunque entità via entityType + entityId e apre la
 * modale dedicata per caricare, rinominare, scaricare ed eliminare.
 */
@Component({
  selector: 'app-attachments-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    AttachmentsDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './attachments-panel.component.html',
  styleUrl: './attachments-panel.component.scss',
})
export class AttachmentsPanelComponent {
  private readonly service = inject(AttachmentsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly entityType = input.required<AttachmentEntityType>();
  readonly entityId = input.required<EntityId>();
  readonly canManage = input(false);

  protected readonly formatDate = formatDate;
  protected readonly formatSize = formatAttachmentSize;
  protected readonly iconClass = attachmentIconClass;

  protected readonly dialogOpen = signal(false);
  protected readonly uploading = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly busyId = signal<EntityId | null>(null);

  private readonly refreshTick = signal(0);
  private readonly request = computed(() => ({
    entityType: this.entityType(),
    entityId: this.entityId(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ entityType, entityId }) =>
        this.service.list(entityType, entityId).pipe(
          map((items): AttachmentsState => ({ status: 'success', items })),
          startWith<AttachmentsState>({ status: 'loading' }),
          catchError(() => of({ status: 'error' } satisfies AttachmentsState)),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies AttachmentsState },
  );

  protected readonly loading = computed(() => this.state().status === 'loading');
  protected readonly error = computed(() => this.state().status === 'error');
  protected readonly attachments = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.items : [];
  });

  protected openDialog(): void {
    this.actionError.set(null);
    this.dialogOpen.set(true);
  }

  /** Upload in sequenza: l'ordine di arrivo resta quello scelto dall'utente. */
  protected onFilesSelected(files: readonly File[]): void {
    if (files.length === 0 || this.uploading()) {
      return;
    }
    this.actionError.set(null);
    this.uploading.set(true);
    from(files)
      .pipe(
        concatMap((file) => this.service.upload(this.entityType(), this.entityId(), file)),
        toArray(),
        take(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.uploading.set(false);
          this.reload();
        },
        error: (err: unknown) => {
          this.uploading.set(false);
          this.actionError.set(this.errorMessage(err, 'Caricamento non riuscito. Riprova.'));
          this.reload();
        },
      });
  }

  protected onRename(event: AttachmentRenameEvent): void {
    if (this.busyId()) {
      return;
    }
    this.actionError.set(null);
    this.busyId.set(event.attachmentId);
    this.service
      .rename(this.entityType(), this.entityId(), event.attachmentId, event.fileName)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.reload();
        },
        error: (err: unknown) => {
          this.busyId.set(null);
          this.actionError.set(this.errorMessage(err, 'Rinomina non riuscita. Riprova.'));
        },
      });
  }

  protected onDownload(attachment: Attachment): void {
    if (this.busyId()) {
      return;
    }
    this.actionError.set(null);
    this.busyId.set(attachment.id);
    this.service
      .download(this.entityType(), this.entityId(), attachment.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.busyId.set(null);
          this.saveBlob(blob, attachment.fileName);
        },
        error: (err: unknown) => {
          this.busyId.set(null);
          this.actionError.set(this.errorMessage(err, 'Download non riuscito. Riprova.'));
        },
      });
  }

  protected onDelete(attachment: Attachment): void {
    if (!this.canManage() || this.busyId()) {
      return;
    }
    this.actionError.set(null);
    this.busyId.set(attachment.id);
    this.service
      .delete(this.entityType(), this.entityId(), attachment.id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busyId.set(null);
          this.reload();
        },
        error: (err: unknown) => {
          this.busyId.set(null);
          this.actionError.set(this.errorMessage(err, 'Eliminazione non riuscita. Riprova.'));
        },
      });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  /** Messaggio del server (quota, formato, dimensione) o fallback generico. */
  private errorMessage(err: unknown, fallback: string): string {
    return isAppError(err) && err.message ? err.message : fallback;
  }
}
