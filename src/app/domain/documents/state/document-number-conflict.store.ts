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
 * quale sia il prossimo. Il documento NON viene salvato: il salvataggio resta
 * una pressione esplicita di Salva, coerente con la regola VestiFlow che nessun
 * documento nasce senza una decisione dell'operatore.
 *
 * **La testata SI aggiorna** (specifica numerazione §3, decisione dell'8 agosto
 * 2026 ripristinata il 12): la presa d'atto restituisce il numero da scrivere e
 * la maschera lo mette in testata.
 *
 * L'11 agosto il ramo aveva rovesciato questo comportamento — «il numero non è
 * stato modificato, correggilo» — con la motivazione che sostituire il numero
 * d'ufficio butta via l'intento di chi voleva quel buco preciso. La motivazione
 * è comprensibile ma **il costo è più alto del beneficio**: quell'intento è
 * comunque irrealizzabile — il buco l'ha appena preso un altro — e lavorando in
 * più persone l'operatore **non può sapere quale sia il prossimo numero libero**
 * se non glielo si scrive. Lasciargli il campo com'era lo costringe a ridigitare
 * a mano una cosa che il sistema già sa, con l'errore di battitura e il secondo
 * conflitto che ne seguono.
 *
 * Chi voleva davvero un altro buco può sempre scriverlo: il campo resta suo.
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
   * Presa d'atto: chiude, azzera e **restituisce il numero da scrivere in
   * testata** — `null` se non c'era nessun conflitto aperto.
   *
   * Restituirlo invece di applicarlo è deliberato: lo store non conosce il
   * form. Ogni maschera scrive nel proprio controllo, e nel farlo lo segna come
   * scelto — il numero nuovo deve viaggiare al salvataggio successivo, non
   * essere scambiato per una proposta e omesso.
   *
   * Vale anche per la chiusura con Esc: entrambe le uscite fanno la stessa
   * cosa, quindi il form può collegarle allo stesso gestore.
   */
  acknowledge(): number | null {
    const nextAvailable = this._conflict()?.nextAvailable ?? null;
    this._conflict.set(null);
    this.isOpen.set(false);
    return nextAvailable;
  }
}
