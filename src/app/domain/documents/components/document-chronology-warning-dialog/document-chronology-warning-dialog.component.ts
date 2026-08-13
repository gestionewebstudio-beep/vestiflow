import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';

import type { ChronologyConflict } from '../../models/document-chronology.model';
import {
  chronologyDay,
  chronologyLabel,
  chronologyWarningMessage,
} from '../../models/document-chronology.util';

/**
 * **Avviso cronologico** (specifica numerazione §4): il numero e la data che
 * stai per assegnare non stanno in ordine con un documento già registrato.
 *
 * Avviso, non blocco — «Sì, salva comunque» / «No, torna al documento» — ma il
 * predefinito è il **No**: su un allarme, l'opzione che non scrive è quella che
 * deve costare meno.
 *
 * **Il messaggio nomina tre cose**: il numero e la data che stai assegnando, il
 * documento che le smentisce con la sua data, e la regola violata a parole.
 * Prima diceva «un documento di questa serie porta un numero più alto di uno
 * con data successiva» — vero, astratto, e su un documento che l'operatore non
 * stava toccando. La forma è quella di Danea, che su questo ha ragione:
 * «È incorretto assegnare il nr. 2 e la data 13/8/26 al documento perché esiste
 * già "Prev. 1 del 15/8/26" e quindi numeri e date non sono in corretta
 * progressione».
 *
 * Non è un dialogo nuovo: è `app-confirm-dialog` con dentro l'elenco e la
 * casella. Il comportamento modale — fuoco intrappolato, ESC, sfondo inerte — è
 * quello del `<dialog>` nativo, e non si riscrive per la seconda volta.
 */
@Component({
  selector: 'app-document-chronology-warning-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent],
  templateUrl: './document-chronology-warning-dialog.component.html',
  styleUrl: './document-chronology-warning-dialog.component.scss',
})
export class DocumentChronologyWarningDialogComponent {
  readonly open = input.required<boolean>();
  readonly conflicts = input.required<readonly ChronologyConflict[]>();
  /** Numero che si sta assegnando: la prima metà della frase. */
  readonly assigningNumber = input.required<number | null>();
  /** Data in testata, `AAAA-MM-GG`: la seconda metà. */
  readonly assigningDate = input.required<string>();
  readonly dontShowAgain = input<boolean>(false);
  /** Salvataggio in corso dopo la conferma: i bottoni si spengono. */
  readonly busy = input<boolean>(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  readonly dontShowAgainChange = output<boolean>();

  protected readonly message = computed(() =>
    chronologyWarningMessage(this.conflicts(), this.assigningNumber(), this.assigningDate()),
  );

  protected giorno(value: string): string {
    return chronologyDay(value);
  }

  protected etichetta(conflict: ChronologyConflict): string {
    return chronologyLabel(conflict);
  }

  /** «precede» / «segue» detti all'operatore, per l'elenco quando sono due. */
  protected verso(conflict: ChronologyConflict): string {
    return conflict.direction === 'precede'
      ? 'numero più basso, data successiva'
      : 'numero più alto, data anteriore';
  }
}
