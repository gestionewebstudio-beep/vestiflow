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
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import type { Attachment, AttachmentEntityType } from '@core/models/attachment.model';
import type { EntityId } from '@core/models/common.model';
import { AttachmentsApiService } from '@core/services/attachments-api.service';
import { formatDate } from '@core/utils/date.util';
import { ButtonComponent } from '@shared/components/button/button.component';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '@shared/components/error-state/error-state.component';
import { TableSkeletonComponent } from '@shared/components/table-skeleton/table-skeleton.component';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['application/pdf', 'application/xml', 'text/xml']);

type AttachmentsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly items: readonly Attachment[] }
  | { readonly status: 'error' };

/**
 * Pannello Allegati generico e riusabile (sottosistema polimorfico): carica,
 * elenca ed elimina gli allegati di una qualunque entità via entityType +
 * entityId. Stessa UX del pannello documenti; usa AttachmentsApiService.
 */
@Component({
  selector: 'app-attachments-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, EmptyStateComponent, ErrorStateComponent, TableSkeletonComponent],
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
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly deletingId = signal<EntityId | null>(null);

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

  protected formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected onFileSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file || !this.canManage() || this.uploading()) {
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      this.uploadError.set('File troppo grande (max 10 MB).');
      return;
    }
    if (!ALLOWED_MIME.has(file.type)) {
      this.uploadError.set('Formato non supportato. Usa PDF o XML.');
      return;
    }

    this.uploadError.set(null);
    this.uploading.set(true);
    this.service
      .upload(this.entityType(), this.entityId(), file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.uploading.set(false);
          this.reload();
        },
        error: () => {
          this.uploading.set(false);
          this.uploadError.set('Caricamento non riuscito. Riprova.');
        },
      });
  }

  protected deleteAttachment(attachmentId: EntityId): void {
    if (!this.canManage() || this.deletingId()) {
      return;
    }
    this.deletingId.set(attachmentId);
    this.service
      .delete(this.entityType(), this.entityId(), attachmentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deletingId.set(null);
          this.reload();
        },
        error: () => {
          this.deletingId.set(null);
          this.uploadError.set('Eliminazione non riuscita. Riprova.');
        },
      });
  }

  protected reload(): void {
    this.refreshTick.update((tick) => tick + 1);
  }
}
