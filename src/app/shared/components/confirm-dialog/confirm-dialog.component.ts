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

import { ButtonComponent } from '../button/button.component';

/**
 * Dialog di conferma per azioni sensibili. Usa <dialog> nativo via
 * showModal(): focus trap, ESC e inerzia dello sfondo sono gestiti dal
 * browser. Apertura controllata dal model `open`; l'esito arriva via output.
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input<string>('Conferma');
  readonly cancelLabel = input<string>('Annulla');
  /** Azione distruttiva: bottone di conferma in variante danger. */
  readonly danger = input<boolean>(false);
  /** Disabilita i bottoni mentre l'azione confermata e' in corso. */
  readonly busy = input<boolean>(false);

  readonly open = model<boolean>(false);

  readonly confirmed = output<void>();

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Sincronizza lo stato `open` con il <dialog> nativo.
    effect(() => {
      const dialog = this.dialogRef().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }

  protected onConfirm(): void {
    this.confirmed.emit();
  }

  protected onCancel(): void {
    this.open.set(false);
  }

  /** ESC nativo del <dialog>: riallinea lo stato. */
  protected onNativeClose(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }
}
