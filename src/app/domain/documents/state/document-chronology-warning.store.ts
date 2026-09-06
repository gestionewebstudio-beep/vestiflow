import { computed, signal } from '@angular/core';

import type { ChronologyConflict } from '../models/document-chronology.model';

/**
 * Stato dell'**avviso cronologico** (specifica numerazione §4), condiviso da
 * tutte le maschere documento.
 *
 * Il fatto segnalato: il documento che si sta salvando, dentro il suo
 * contatore, sta in ordine inverso rispetto a un altro — numero più alto e data
 * anteriore, o viceversa. Non è un errore di salvataggio, è una scelta che può
 * essere voluta: l'avviso non blocca, si salva comunque.
 *
 * **Perché è un avviso e non un blocco.** L'anomalia nasce da un gesto
 * dell'operatore — numero forzato, data cambiata su un documento salvato, o il
 * caso terminale in cui la proposta scavalca un documento datato avanti — e in
 * tutti e tre i casi può essere una scelta consapevole. Bloccare vorrebbe dire
 * decidere al posto suo su un dato che la legge non vieta.
 *
 * **Riguarda il documento che hai in mano, e solo quello** _(13/08/2026)_.
 * Prima l'avviso era «persistente»: compariva a ogni salvataggio finché
 * l'anomalia restava nei dati, anche su documenti in ordine. Non era una scelta
 * — era il sintomo di un controllo che guardava la serie invece del documento,
 * e che quindi arrivava sempre in ritardo di un gesto.
 *
 * Chi non lo vuole più lo spegne — ma **solo per il tipo documento in cui è
 * comparso**: chi sistema le fatture non resta cieco sui DDT. Una volta spento
 * resta spento: nessuna riaccensione, nessun pannello nelle Impostazioni. Da
 * oggi quella casella zittisce un allarme sul documento in corso, non un rumore
 * di fondo: va spenta sapendolo.
 *
 * Classe, non servizio iniettabile: ogni maschera ne vuole una propria, non una
 * condivisa con le altre schede aperte. Stesso stampo di
 * `DocumentNumberConflictStore`.
 */
export class DocumentChronologyWarningStore {
  private readonly _conflicts = signal<readonly ChronologyConflict[]>([]);
  private readonly _open = signal(false);
  /** L'operatore ha spuntato «non mostrare più» in questa sessione o prima. */
  private readonly _dismissed = signal(false);
  /** La casella dentro il dialogo, finché non si conferma. */
  private readonly _dontShowAgain = signal(false);

  readonly isOpen = this._open.asReadonly();
  readonly conflicts = this._conflicts.asReadonly();
  readonly dontShowAgain = this._dontShowAgain.asReadonly();

  /** Quanti documenti smentiscono l'ordine: al massimo due, uno per verso. */
  readonly count = computed(() => this._conflicts().length);

  /**
   * Esito del controllo. L'avviso si apre solo se c'è qualcosa da dire **e**
   * l'operatore non l'ha spento: `dismissed` arriva dal server, perché la
   * preferenza è dell'operatore e non della scheda del browser.
   *
   * Restituisce `true` se l'avviso si è aperto — chi chiama deve sospendere il
   * salvataggio e aspettare la risposta.
   */
  present(conflicts: readonly ChronologyConflict[], dismissed: boolean): boolean {
    this._dismissed.set(dismissed);
    this._conflicts.set(conflicts);
    if (dismissed || conflicts.length === 0) {
      return false;
    }
    this._dontShowAgain.set(false);
    this._open.set(true);
    return true;
  }

  /** La casella dentro il dialogo. Vale solo se poi si conferma. */
  toggleDontShowAgain(value: boolean): void {
    this._dontShowAgain.set(value);
  }

  /**
   * «Sì, salva comunque». Restituisce se la preferenza va spenta lato server:
   * lo store non parla con la rete — sono le maschere ad avere il servizio — e
   * questa è l'unica cosa che devono sapere.
   */
  confirm(): { readonly dismiss: boolean } {
    const dismiss = this._dontShowAgain();
    this._open.set(false);
    if (dismiss) {
      this._dismissed.set(true);
    }
    return { dismiss };
  }

  /** «No»: si torna al documento, e non si salva niente. */
  cancel(): void {
    this._open.set(false);
    this._dontShowAgain.set(false);
  }
}
