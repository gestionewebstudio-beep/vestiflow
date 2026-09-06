import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';

/**
 * ⭐ **L'eliminazione a DUE conferme, in un posto solo.**
 *
 * Deciso dal proprietario il 30/08/2026: «doppio avviso sempre per elimina».
 *
 * ⛔ **Prima era replicato a mano**: due schermate lo avevano — Documenti e
 * Ordini cliente, con la sequenza scritta due volte e l'etichetta del secondo
 * pulsante già divergente («Elimina definitivamente» contro «Elimina») — e altre
 * dieci si fermavano a una conferma sola. Con la sequenza qui dentro, «sempre
 * doppio» diventa vero **per costruzione** invece che per disciplina.
 *
 * ## I due passaggi non dicono la stessa cosa, ed è tutto il punto
 *
 * | | |
 * | --- | --- |
 * | **1° — l'avviso** | dice **cosa succede**: «le giacenze caricate verranno ripristinate». È l'informazione, e la porta il chiamante |
 * | **2° — la conferma** | dice **che non si torna indietro**. È sempre uguale, quindi sta qui |
 *
 * ⛔ **Non si rende generico anche il primo.** Diventerebbe due volte «sei
 * sicuro?» — rumore invece che informazione, e a quel punto una conferma sola
 * farebbe lo stesso lavoro. La conseguenza dipende dal tipo: un preventivo non
 * tocca il magazzino, un arrivo merce sì, una vendita manuale non ripristina
 * niente per la sua deroga.
 *
 * ## Uso
 *
 * ```html
 * <app-delete-confirm
 *   [(open)]="eliminaAperto"
 *   [title]="titoloEliminazione()"
 *   [consequence]="conseguenzaEliminazione()"
 *   [busy]="eliminazioneInCorso()"
 *   (confirmed)="elimina()"
 * />
 * ```
 *
 * ⚠️ **Nessun `.scss`**: non disegna niente di proprio, compone due dialoghi che
 * hanno già il loro vestito. Un foglio vuoto sarebbe peggio della sua assenza.
 */
@Component({
  selector: 'app-delete-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmDialogComponent],
  templateUrl: './delete-confirm.component.html',
})
export class DeleteConfirmComponent {
  /**
   * Che cosa si sta eliminando, al primo passaggio: «Elimina arrivo merce»,
   * «Elimina 3 ordini cliente».
   */
  readonly title = input.required<string>();

  /**
   * **Cosa succede eliminando.** È l'unica cosa che il chiamante deve pensare, e
   * la ragione per cui i passaggi sono due.
   *
   * ⚠️ Il default non è una scorciatoia per non scriverla: è la frase onesta per
   * ciò che davvero non ha conseguenze oltre la sparizione.
   */
  readonly consequence = input<string>('Non sarà più recuperabile.');

  /** L'eliminazione è in corso: il secondo dialogo si blocca. */
  readonly busy = input(false);

  /** Apre la sequenza. Chiuderlo dall'esterno la annulla. */
  readonly open = model(false);

  /** Il secondo passaggio è stato confermato: si può eliminare davvero. */
  readonly confirmed = output<void>();

  /** Annullata a uno qualunque dei due passaggi. */
  readonly dismissed = output<void>();

  /** Il secondo dialogo, che esiste solo dopo il primo. */
  protected readonly confermaAperta = model(false);

  /**
   * ⚠️ Il primo dialogo è aperto solo finché il secondo non lo è: senza questa
   * esclusione i due si sovrapporrebbero, perché `open` resta vero per tutta la
   * sequenza — è il segnale che dice «l'eliminazione è in corso», non «il primo
   * dialogo è visibile».
   */
  protected readonly avvisoAperto = computed(() => this.open() && !this.confermaAperta());

  protected onAvvisoConfermato(): void {
    this.confermaAperta.set(true);
  }

  protected onConfermato(): void {
    this.chiudi();
    this.confirmed.emit();
  }

  protected onAnnullato(): void {
    this.chiudi();
    this.dismissed.emit();
  }

  /**
   * ⛔ **Chiude ENTRAMBI**, sempre. Annullare al secondo passaggio senza
   * chiudere il primo lo farebbe ricomparire — la sequenza tornerebbe indietro
   * invece di finire, ed è il difetto che una sequenza scritta a mano fa più
   * facilmente.
   */
  private chiudi(): void {
    this.confermaAperta.set(false);
    this.open.set(false);
  }
}
