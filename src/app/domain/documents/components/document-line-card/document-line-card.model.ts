/**
 * Una voce della riga meta della card: codice, SKU, disponibilità.
 *
 * È **dato, non markup**: la card la disegna sempre allo stesso modo (separatore
 * a punto medio, ellissi sul troppo lungo), la maschera dice cosa scriverci.
 * Sono le tre informazioni che devono restare leggibili a card chiusa, e quali
 * siano dipende dal documento.
 */
export interface DocumentLineCardMeta {
  readonly text: string;
  /**
   * In coda, staccata dalle altre sul lato opposto: è il posto della
   * disponibilità, che si legge in colpo d'occhio senza cercarla in mezzo.
   */
  readonly trailing?: boolean;
  /** `warning` per il valore che chiede attenzione — la scorta che non basta. */
  readonly tone?: 'default' | 'warning';
}
