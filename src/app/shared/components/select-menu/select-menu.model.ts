/** Opzione del menu a tendina (value vuoto = opzione "tutti" / placeholder). */
export interface SelectMenuOption {
  readonly value: string;
  readonly label: string;
  /**
   * Testo breve mostrato nel trigger a selezione avvenuta (es. "22%" per
   * l'IVA); la label completa resta nel pannello. Assente = usa `label`.
   */
  readonly triggerLabel?: string;
  /** Testo secondario (es. SKU) mostrato sotto il label nel pannello. */
  readonly detail?: string;
  /** Valore CSS (`#hex`, `transparent`, `conic-gradient(...)`) per swatch colore opzionale. */
  readonly swatchCssColor?: string;
}
