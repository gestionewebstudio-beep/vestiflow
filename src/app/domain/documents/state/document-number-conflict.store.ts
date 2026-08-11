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
 * numero, l'operatore viene informato di quale numero è stato rifiutato e di
 * quale sia il primo libero. Il documento NON viene salvato: il salvataggio
 * resta una pressione esplicita di Salva, coerente con la regola VestiFlow che
 * nessun documento nasce senza una decisione dell'operatore.
 *
 * **La testata non si tocca.** Fino al 08/2026 la presa d'atto sostituiva il
 * numero col primo libero: era innocuo finché il conflitto nasceva da un numero
 * che nessuno aveva scelto (la maschera rimandava indietro la propria proposta).
 * Da quando la proposta non viaggia più, questo avviso si raggiunge solo con un
 * numero DIGITATO — cioè quando l'operatore sta tappando un buco preciso della
 * serie. Sostituirglielo con un numero in coda butterebbe via l'intento senza
 * chiederglielo, e per giunta trasformerebbe un numero che il server assegnava
 * da solo sotto lock in un'imposizione che può collidere di nuovo.
 *
 * Non è un service iniettabile: non ha dipendenze e ogni form ne vuole
 * un'istanza propria, quindi si costruisce come campo del componente
 * (`private readonly conflict = new DocumentNumberConflictStore()`).
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

  /** Il server ha rifiutato il numero: apre l'avviso col primo libero. */
  open(conflict: DocumentNumberConflict): void {
    this._conflict.set(conflict);
    this.isOpen.set(true);
  }

  /**
   * Presa d'atto: chiude e azzera. Non restituisce nulla, perché non c'è nulla
   * da applicare — il messaggio dice che la testata è rimasta com'era, e la
   * correzione del numero è dell'operatore.
   *
   * Vale anche per la chiusura con Esc: entrambe le uscite fanno la stessa
   * cosa, quindi il form può collegarle allo stesso gestore.
   */
  acknowledge(): void {
    this._conflict.set(null);
    this.isOpen.set(false);
  }
}
