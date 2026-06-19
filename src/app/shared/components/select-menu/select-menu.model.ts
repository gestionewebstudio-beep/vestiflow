/** Opzione del menu a tendina (value vuoto = opzione "tutti" / placeholder). */
export interface SelectMenuOption {
  readonly value: string;
  readonly label: string;
  /** Valore CSS (`#hex`, `transparent`, `conic-gradient(...)`) per swatch colore opzionale. */
  readonly swatchCssColor?: string;
}
