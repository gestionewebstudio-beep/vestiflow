import { computed, signal } from '@angular/core';

import type { ChronologyAnomaly } from '../models/document-chronology.model';

/**
 * Stato dell'**avviso cronologico** (specifica numerazione §4), condiviso da
 * tutte le maschere documento.
 *
 * Il fatto segnalato: dentro lo stesso contatore, un numero più alto porta una
 * data **anteriore** a uno più basso. Non è un errore di salvataggio — è uno
 * stato della serie — quindi l'avviso non blocca: si salva comunque.
 *
 * **Perché è un avviso e non un blocco.** L'anomalia nasce da un gesto
 * dell'operatore — numero forzato, data cambiata su un documento salvato, o il
 * caso terminale in cui la proposta scavalca un documento datato avanti — e in
 * tutti e tre i casi può essere una scelta consapevole. Bloccare vorrebbe dire
 * decidere al posto suo su un dato che la legge non vieta.
 *
 * **È persistente**, e anche questo è voluto: continua a comparire finché
 * l'anomalia resta nei dati, anche sui documenti successivi che sono in ordine.
 * Un avviso che sparisce da solo lascia dimenticare un buco non giustificato.
 *
 * Chi non lo vuole più lo spegne — ma **solo per il tipo documento in cui è
 * comparso**: chi sistema le fatture non resta cieco sui DDT. Una volta spento
 * resta spento: nessuna riaccensione, nessun pannello nelle Impostazioni.
 *
 * Classe, non servizio iniettabile: ogni maschera ne vuole una propria, non una
 * condivisa con le altre schede aperte. Stesso stampo di
 * `DocumentNumberConflictStore`.
 */
export class DocumentChronologyWarningStore {
  private readonly _anomalies = signal<readonly ChronologyAnomaly[]>([]);
  private readonly _open = signal(false);
  /** L'operatore ha spuntato «non mostrare più» in questa sessione o prima. */
  private readonly _dismissed = signal(false);
  /** La casella dentro il dialogo, finché non si conferma. */
  private readonly _dontShowAgain = signal(false);

  readonly isOpen = this._open.asReadonly();
  readonly anomalies = this._anomalies.asReadonly();
  readonly dontShowAgain = this._dontShowAgain.asReadonly();

  /**
   * Quanti documenti sono fuori posto. Serve al testo dell'avviso, che al
   * singolare e al plurale non dice la stessa cosa.
   */
  readonly count = computed(() => this._anomalies().length);

  /**
   * Esito del controllo. L'avviso si apre solo se c'è qualcosa da dire **e**
   * l'operatore non l'ha spento: `dismissed` arriva dal server, perché la
   * preferenza è dell'operatore e non della scheda del browser.
   *
   * Restituisce `true` se l'avviso si è aperto — chi chiama deve sospendere il
   * salvataggio e aspettare la risposta.
   */
  present(anomalies: readonly ChronologyAnomaly[], dismissed: boolean): boolean {
    this._dismissed.set(dismissed);
    this._anomalies.set(anomalies);
    if (dismissed || anomalies.length === 0) {
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
