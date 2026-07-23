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

import type { DocumentAttachment } from '@core/models/document.model';
import type { EntityId } from '@core/models/common.model';
import { attachmentIconClass, formatAttachmentSize } from '@core/models/attachment-rules.util';
import { isAppError } from '@core/models/app-error.model';
import { formatDate } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { AttachmentsDialogComponent } from '@shared/components/attachments-dialog/attachments-dialog.component';
import type { AttachmentRenameEvent } from '@shared/components/attachments-dialog/attachments-dialog.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

import { DocumentService } from '../../services/document.service';

type AttachmentsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly DocumentAttachment[] }
  | { readonly status: 'error' };

/**
 * Allegati del documento: riepilogo in pagina e gestione completa nella
 * modale dedicata (trascinamento, rinomina, download, eliminazione, spazio
 * residuo). Formati e limiti sono quelli condivisi con il server.
 */
@Component({
  selector: 'app-document-attachments-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    AttachmentsDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    TableSkeletonComponent,
  ],
  templateUrl: './document-attachments-panel.component.html',
  styleUrl: './document-attachments-panel.component.scss',
})
export class DocumentAttachmentsPanelComponent {
  private readonly service = inject(DocumentService);
  private readonly destroyRef = inject(DestroyRef);

  readonly documentId = input.required<EntityId>();
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
    id: this.documentId(),
    tick: this.refreshTick(),
  }));

  private readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        this.service.listAttachments(id).pipe(
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
        concatMap((file) => this.service.uploadAttachment(this.documentId(), file)),
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
      .renameAttachment(this.documentId(), event.attachmentId, event.fileName)
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

  protected onDownload(attachment: DocumentAttachment): void {
    if (this.busyId()) {
      return;
    }
    this.actionError.set(null);
    this.busyId.set(attachment.id);
    this.service
      .downloadAttachment(this.documentId(), attachment.id)
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

  protected onDelete(attachment: DocumentAttachment): void {
    if (!this.canManage() || this.busyId()) {
      return;
    }
    this.actionError.set(null);
    this.busyId.set(attachment.id);
    this.service
      .deleteAttachment(this.documentId(), attachment.id)
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
