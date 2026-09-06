import type { ChronologyConflict } from './document-chronology.model';

/** `AAAA-MM-GG` o istante ISO: all'operatore si mostra il giorno. */
export function chronologyDay(value: string): string {
  const data = new Date(value);
  return Number.isNaN(data.getTime()) ? value : data.toLocaleDateString('it-IT');
}

/** Come si nomina un documento: il riferimento se c'è, il numero altrimenti. */
export function chronologyLabel(conflict: ChronologyConflict): string {
  return conflict.reference ?? `il n. ${conflict.number}`;
}

/** Il verso della violazione, detto all'operatore. */
export function chronologyDirectionLabel(conflict: ChronologyConflict): string {
  return conflict.direction === 'precede'
    ? 'un numero più basso con una data successiva'
    : 'un numero più alto con una data anteriore';
}

/**
 * **Il testo dell'avviso cronologico** (specifica numerazione §4).
 *
 * Dice tre cose, e le tre insieme sono il punto: il numero e la data che stai
 * assegnando, il documento che le smentisce con la sua data, e la regola
 * violata a parole.
 *
 * Prima diceva «un documento di questa serie porta un numero più alto di uno
 * con data successiva»: vero, astratto, e riferito a un documento che
 * l'operatore non stava toccando. La forma è quella di Danea, che su questo ha
 * ragione — «È incorretto assegnare il nr. 2 e la data 13/8/26 al documento
 * perché esiste già "Prev. 1 del 15/8/26" e quindi numeri e date non sono in
 * corretta progressione».
 *
 * Funzione pura e non metodo del dialogo, per la stessa ragione di
 * `documentNumberConflictMessage`: una frase che l'operatore legge in un momento
 * difficile si prova senza montare un componente.
 */
export function chronologyWarningMessage(
  conflicts: readonly ChronologyConflict[],
  assigningNumber: number | null,
  assigningDate: string,
): string {
  const testa =
    assigningNumber != null
      ? `Stai assegnando il numero ${assigningNumber} con data ${chronologyDay(assigningDate)}`
      : `Stai salvando con data ${chronologyDay(assigningDate)}`;
  const primo = conflicts[0];
  if (!primo) {
    return `${testa}.`;
  }
  const altri = conflicts.length > 1 ? ', e non è l’unico' : '';
  return (
    `${testa}, ma esiste già ${chronologyLabel(primo)} del ${chronologyDay(primo.documentDate)}: ` +
    `${chronologyDirectionLabel(primo)}${altri}, quindi numeri e date non sarebbero in ordine.`
  );
}
