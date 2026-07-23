import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';

import type { Attachment } from '@core/models/attachment.model';
import type { EntityId } from '@core/models/common.model';
import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  MAX_ATTACHMENT_TOTAL_BYTES,
  attachmentIconClass,
  formatAttachmentSize,
  formatMegabytes,
  validateAttachmentFile,
} from '@core/models/attachment-rules.util';
import { formatDate } from '@core/utils/date.util';

import { ButtonComponent } from '../button/button.component';

/** Rinomina richiesta dalla modale (il salvataggio lo fa il contenitore). */
export interface AttachmentRenameEvent {
  readonly attachmentId: EntityId;
  readonly fileName: string;
}

/**
 * Modale allegati: trascinamento file, selezione da disco, elenco con icona
 * per formato, azioni per allegato (rinomina, scarica, elimina) e indicatore
 * dello spazio residuo. Dumb: valida i file lato client e delega upload,
 * rinomina, download ed eliminazione al componente che la ospita.
 */
@Component({
  selector: 'app-attachments-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './attachments-dialog.component.html',
  styleUrl: './attachments-dialog.component.scss',
})
export class AttachmentsDialogComponent {
  readonly open = model<boolean>(false);

  readonly attachments = input<readonly Attachment[]>([]);
  readonly canManage = input<boolean>(false);
  readonly uploading = input<boolean>(false);
  readonly busyId = input<EntityId | null>(null);
  /** Errore proveniente dal server (l'errore locale nasce dalla validazione). */
  readonly serverError = input<string | null>(null);

  readonly filesSelected = output<readonly File[]>();
  readonly renameRequested = output<AttachmentRenameEvent>();
  readonly downloadRequested = output<Attachment>();
  readonly deleteRequested = output<Attachment>();

  protected readonly acceptAttribute = ATTACHMENT_ACCEPT_ATTRIBUTE;
  protected readonly formatDate = formatDate;
  protected readonly formatSize = formatAttachmentSize;
  protected readonly iconClass = attachmentIconClass;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Errore di validazione client (formato, dimensione, spazio esaurito). */
  protected readonly localError = signal<string | null>(null);
  protected readonly dragOver = signal(false);
  protected readonly renamingId = signal<EntityId | null>(null);
  protected readonly renameDraft = signal('');

  protected readonly usedBytes = computed(() =>
    this.attachments().reduce((sum, item) => sum + item.sizeBytes, 0),
  );

  protected readonly totalLabel = formatMegabytes(MAX_ATTACHMENT_TOTAL_BYTES);
  protected readonly usedLabel = computed(() => formatMegabytes(this.usedBytes()));

  /** "3,2 MB usati di 20 MB". */
  protected readonly spaceLabel = computed(() => `${this.usedLabel()} usati di ${this.totalLabel}`);

  protected readonly usedPercent = computed(() =>
    Math.min(100, Math.round((this.usedBytes() / MAX_ATTACHMENT_TOTAL_BYTES) * 100)),
  );

  /** Quota piena: l'area di caricamento resta visibile ma avvisa. */
  protected readonly quotaFull = computed(() => this.usedBytes() >= MAX_ATTACHMENT_TOTAL_BYTES);

  protected readonly errorMessage = computed(() => this.localError() ?? this.serverError());

  constructor() {
    // Sincronizza lo stato `open` con il <dialog> nativo (focus trap ed ESC
    // gestiti dal browser, stesso pattern di app-confirm-dialog).
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });

    // Chiudendo e riaprendo la modale non si trascinano errori vecchi.
    effect(() => {
      if (this.open()) {
        this.localError.set(null);
        this.renamingId.set(null);
      }
    });
  }

  protected close(): void {
    this.open.set(false);
  }

  /** ESC nativo del <dialog>: riallinea lo stato. */
  protected onNativeClose(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }

  protected onFileInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const files = [...(inputEl.files ?? [])];
    inputEl.value = '';
    this.acceptFiles(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.canManage()) {
      return;
    }
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDragLeave(): void {
    this.dragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    if (!this.canManage()) {
      return;
    }
    event.preventDefault();
    this.dragOver.set(false);
    this.acceptFiles([...(event.dataTransfer?.files ?? [])]);
  }

  /**
   * Valida i file scelti: al primo che non passa mostra il messaggio e non
   * carica nulla, così l'utente vede subito quale regola ha violato.
   * La quota si somma progressivamente per rilevare anche il superamento
   * cumulativo di una selezione multipla.
   */
  private acceptFiles(files: readonly File[]): void {
    if (files.length === 0 || !this.canManage() || this.uploading()) {
      return;
    }
    this.localError.set(null);

    let projectedUsed = this.usedBytes();
    for (const file of files) {
      const error = validateAttachmentFile(file, projectedUsed);
      if (error) {
        this.localError.set(error);
        return;
      }
      projectedUsed += file.size;
    }
    this.filesSelected.emit(files);
  }

  protected startRename(item: Attachment): void {
    this.renamingId.set(item.id);
    this.renameDraft.set(item.fileName);
  }

  protected onRenameInput(event: Event): void {
    this.renameDraft.set((event.target as HTMLInputElement).value);
  }

  protected cancelRename(): void {
    this.renamingId.set(null);
    this.renameDraft.set('');
  }

  protected confirmRename(item: Attachment): void {
    const fileName = this.renameDraft().trim();
    if (!fileName || fileName === item.fileName) {
      this.cancelRename();
      return;
    }
    this.renameRequested.emit({ attachmentId: item.id, fileName });
    this.cancelRename();
  }

  protected download(item: Attachment): void {
    this.downloadRequested.emit(item);
  }

  protected remove(item: Attachment): void {
    this.deleteRequested.emit(item);
  }
}
