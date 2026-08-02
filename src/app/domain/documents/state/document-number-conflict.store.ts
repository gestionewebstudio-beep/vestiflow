import { computed, signal } from '@angular/core';

import {
  documentNumberConflictMessage,
  type DocumentNumberConflict,
} from '@core/models/document-number-conflict.util';

/**
 * Stato del dialog «numero già assegnato», condiviso da tutti i form
 * documento. Era duplicato in ogni form: stessi due signal, stessi due
 * computed, stesse transizioni.
 *
 * Non è un service iniettabile: non ha dipendenze e ogni form ne vuole
 * un'istanza propria, quindi si costruisce come campo del componente
 * (`private readonly conflict = new DocumentNumberConflictStore()`).
 *
 * Il form resta padrone di ciò che è suo: quale controllo riceve il numero
 * e quale salvataggio riparte dopo la conferma.
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

  /** «Usa 7» quando il primo libero è noto, altrimenti etichetta generica. */
  readonly confirmLabel = computed(() => {
    const conflict = this._conflict();
    return conflict ? `Usa ${conflict.nextAvailable}` : 'Usa il primo libero';
  });

  /** Il server ha rifiutato il numero: apre il dialog con la proposta. */
  open(conflict: DocumentNumberConflict): void {
    this._conflict.set(conflict);
    this.isOpen.set(true);
  }

  /**
   * Conferma: chiude, azzera e restituisce il numero da usare — sta al form
   * scriverlo nel proprio controllo e far ripartire il salvataggio.
   * `null` se non c'era alcun conflitto aperto.
   */
  confirm(): number | null {
    const conflict = this._conflict();
    this.reset();
    return conflict?.nextAvailable ?? null;
  }

  /** Annulla: l'operatore correggerà il numero a mano. */
  dismiss(): void {
    this.reset();
  }

  private reset(): void {
    this._conflict.set(null);
    this.isOpen.set(false);
  }
}
