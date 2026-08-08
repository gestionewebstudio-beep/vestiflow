/**
 * Voce dello schema di setup di un canale: fatta o da fare, con l'etichetta e
 * il dettaglio da mostrare. La condividono la pagina Impostazioni (che calcola
 * lo stato delle location) e il pannello Shopify (che lo mostra accanto ai
 * propri).
 */
export interface SetupStatusItem {
  readonly active: boolean;
  readonly partial?: boolean;
  /**
   * Qualcosa e' rotto, e lo sappiamo per averlo constatato — non per averlo dedotto.
   * Distinto da `partial`: quello e' un avviso, questo e' un fatto verificato.
   */
  readonly problem?: boolean;
  readonly label: string;
  readonly detail: string;
}
