import { computed, signal } from '@angular/core';

import {
  documentNumberConflictMessage,
  type DocumentNumberConflict,
} from '@core/models/document-number-conflict.util';

/**
 * Stato dell'avviso «numero già assegnato», condiviso da tutti i form
 * documento con numerazione. Era duplicato in ogni form: stessi signal,
 * stesso derivato, stesse transizioni.
 *
 * È un AVVISO, non una scelta: quando il vincolo unico del database rifiuta il
 * numero, l'operatore viene informato che il numero è stato aggiornato al primo
 * libero — non gli si chiede se vuole usarlo. Il documento NON viene salvato:
 * il salvataggio resta una pressione esplicita di Salva, coerente con la regola
 * VestiFlow che nessun documento nasce senza una decisione dell'operatore.
 *
 * Non è un service iniettabile: non ha dipendenze e ogni form ne vuole
 * un'istanza propria, quindi si costruisce come campo del componente
 * (`private readonly conflict = new DocumentNumberConflictStore()`).
 *
 * Il form resta padrone di ciò che è suo: quale controllo della testata riceve
 * il numero aggiornato.
 */
export class DocumentNumberConflictStore {
  private readonly _conflict = signal<DocumentNumberConflict | null>(null);

  /** Il payload del conflitto è dello store: si cambia solo per transizione. */
  readonly conflict = this._conflict.asReadonly();

  /**
   * Aperto/chiuso è invece CO-POSSEDUTO con il dialog, che si chiude da sé
   * (Esc, backdrop) attraverso il binding bidirezionale `[(open)]`. Per questo
   * resta scrivibile: una chiusura dall'esterno lascia il conflitto in memoria
   * senza danno, perché ogni riapertura passa da `open()`, che riazzera.
   */
  readonly isOpen = signal(false);

  readonly message = computed(() => {
    const conflict = this._conflict();
    return conflict ? documentNumberConflictMessage(conflict) : '';
  });

  /** Il server ha rifiutato il numero: apre l'avviso con il primo libero. */
  open(conflict: DocumentNumberConflict): void {
    this._conflict.set(conflict);
    this.isOpen.set(true);
  }

  /**
   * Presa d'atto: chiude, azzera e restituisce il numero da scrivere nella
   * testata. Sta al form metterlo nel proprio controllo — e fermarsi lì:
   * NON deve far ripartire il salvataggio.
   *
   * Vale anche per la chiusura con Esc: il messaggio dice che il numero è già
   * stato aggiornato, quindi va applicato comunque, altrimenti l'avviso
   * mentirebbe. `null` se non c'era alcun conflitto aperto.
   */
  acknowledge(): number | null {
    const conflict = this._conflict();
    this._conflict.set(null);
    this.isOpen.set(false);
    return conflict?.nextAvailable ?? null;
  }
}
