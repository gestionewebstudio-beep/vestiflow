import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  effect,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

import { AVATAR_PREVIEW_PX } from '@shared/constants/avatar-preview.constants';

@Component({
  selector: 'app-avatar-preview-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avatar-preview-dialog.component.html',
  styleUrl: './avatar-preview-dialog.component.scss',
})
export class AvatarPreviewDialogComponent {
  readonly imageSrc = input<string | null>(null);
  readonly altLabel = input.required<string>();

  readonly open = model(false);

  readonly dismissed = output<void>();

  protected readonly previewPx = AVATAR_PREVIEW_PX;

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  protected onClose(): void {
    this.open.set(false);
    this.dismissed.emit();
  }

  protected onNativeClose(): void {
    if (this.open()) {
      this.open.set(false);
      this.dismissed.emit();
    }
  }
}
