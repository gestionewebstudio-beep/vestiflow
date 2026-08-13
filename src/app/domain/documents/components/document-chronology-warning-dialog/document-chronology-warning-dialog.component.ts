import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';

import type { ChronologyAnomaly } from '../../models/document-chronology.model';

/**
 * **Avviso cronologico** (specifica numerazione §4): dentro questo contatore un
 * numero più alto porta una data anteriore a uno più basso.
 *
 * Avviso, non blocco — «Sì, salva comunque» / «No» — e l'elenco mostra **tutti**
 * i documenti fuori posto, non solo quello che si sta salvando: l'avviso deve
 * dire *cosa* c'è da sistemare, e un elenco di uno non lo direbbe.
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
  readonly anomalies = input.required<readonly ChronologyAnomaly[]>();
  readonly dontShowAgain = input<boolean>(false);
  /** Salvataggio in corso dopo la conferma: i bottoni si spengono. */
  readonly busy = input<boolean>(false);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  readonly dontShowAgainChange = output<boolean>();

  /**
   * Al singolare e al plurale non si dice la stessa cosa, e il numero è
   * l'informazione che fa capire se è una svista o una serie da rivedere.
   */
  protected readonly message = computed(() => {
    const quanti = this.anomalies().length;
    return quanti === 1
      ? 'Un documento di questa serie porta un numero più alto di uno con data successiva.'
      : `${quanti} documenti di questa serie portano un numero più alto di uno con data successiva.`;
  });

  /** `AAAA-MM-GG` o istante ISO: all'operatore si mostra il giorno. */
  protected giorno(value: string): string {
    const data = new Date(value);
    return Number.isNaN(data.getTime()) ? value : data.toLocaleDateString('it-IT');
  }

  protected etichetta(anomaly: ChronologyAnomaly): string {
    return anomaly.reference ?? `n. ${anomaly.number}`;
  }
}
