/**
 * Voce dello schema di setup di un canale: fatta o da fare, con l'etichetta e
 * il dettaglio da mostrare. La condividono la pagina Impostazioni (che calcola
 * lo stato delle location) e il pannello Shopify (che lo mostra accanto ai
 * propri).
 */
export interface SetupStatusItem {
  readonly active: boolean;
  readonly partial?: boolean;
  readonly label: string;
  readonly detail: string;
}
