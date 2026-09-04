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
  private static nextInstanceId = 0;

  /**
   * ⛔ **L'id del titolo è PER ISTANZA, e non è pignoleria.**
   *
   * Era la costante `confirm-dialog-title`, e una pagina ne monta più di uno:
   * misurato in un browser vero il 01/09/2026 su Prodotti — **tre elementi con
   * lo stesso id**, che è quello che il browser segnala come «Duplicate form
   * field id in the same form».
   *
   * ⚠️ **Il danno è sull'`aria-labelledby`**: con id ripetuti il lettore di
   * schermo risolve sempre il PRIMO, quindi due dialoghi su tre si annunciano
   * col titolo di un altro — e il dialogo giusto è invisibile a chi non vede.
   */
  protected readonly titleId = `confirm-dialog-title-${++ConfirmDialogComponent.nextInstanceId}`;

  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input<string>('Conferma');
  readonly cancelLabel = input<string>('Annulla');
  /** Azione distruttiva: bottone di conferma in variante danger. */
  readonly danger = input<boolean>(false);
  /** Disabilita i bottoni mentre l'azione confermata e' in corso. */
  readonly busy = input<boolean>(false);
  /**
   * Avviso informativo invece di una scelta: un solo bottone, nessun Annulla.
   * L'operatore non decide fra due opzioni, prende atto di un fatto già
   * avvenuto — quindi anche ESC deve valere come presa d'atto, e il
   * chiamante collega `dismissed` allo stesso gestore di `confirmed`.
   */
  readonly acknowledge = input<boolean>(false);

  /**
   * Quale dei due bottoni porta l'enfasi visiva. Di norma la conferma, che è
   * l'azione che l'operatore è venuto a fare.
   *
   * `'cancel'` la sposta sull'annulla, e serve agli **allarmi**: quando il
   * dialogo dice «quello che stai per fare è probabilmente sbagliato», l'opzione
   * che non scrive deve costare meno di quella che scrive. Il fuoco iniziale è
   * già sull'annulla — il `<dialog>` nativo prende il primo elemento
   * raggiungibile — ma il colore diceva il contrario.
   */
  readonly emphasis = input<'confirm' | 'cancel'>('confirm');

  /**
   * Etichetta della **terza azione**, facoltativa. Assente = due pulsanti.
   *
   * ⛔ **NON fa parte del contratto «modifiche non salvate»** (proprietario,
   * 24/08/2026). Quel dialogo ha DUE azioni — Annulla · Esci senza salvare —
   * e il salvataggio resta un’azione separata, il pulsante Salva. «Salva e
   * chiudi» dentro il dialogo di uscita non deve comparire.
   *
   * ⭐ Serve ai dialoghi con **tre esiti davvero distinti**, cioe’ tre
   * gestori diversi. Se due pulsanti chiamano lo stesso gestore, non sono tre
   * esiti: sono due esiti e un pulsante di troppo — ed e’ il difetto che
   * «Dati incompleti» aveva («Annulla» e «No» sullo stesso gestore).
   */
  readonly extraLabel = input<string>('');

  readonly open = model<boolean>(false);

  readonly confirmed = output<void>();
  readonly dismissed = output<void>();
  /** La terza azione e’ stata scelta. Emesso solo se `extraLabel` c’e’. */
  readonly extra = output<void>();

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

  /**
   * La terza azione. Chiude il dialogo da se’, come l’annulla: chi la usa
   * riceve `extra` e decide che cosa fare.
   */
  protected onExtra(): void {
    this.open.set(false);
    this.extra.emit();
  }

  protected onCancel(): void {
    this.open.set(false);
    this.dismissed.emit();
  }

  /** ESC nativo del <dialog>: riallinea lo stato. */
  protected onNativeClose(): void {
    if (this.open()) {
      this.open.set(false);
      this.dismissed.emit();
    }
  }
}
