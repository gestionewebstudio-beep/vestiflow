/**
 * Helper sul denaro condivisi lato server (§sei decimali).
 *
 * L'ammontare in unità minori NON è più necessariamente intero: uno scorporo
 * IVA lascia una coda decimale (fino a 4 cifre di centesimo, 6 decimali di
 * euro) ed è quella coda a far tornare il prezzo digitato quando lo si rimostra
 * ivato. Da qui discendono due regole:
 *
 * - si arrotonda **solo all'uscita** (stampa, CSV, payload di canale);
 * - «è cambiato?» si chiede **al centesimo**: una coda decimale diversa non è
 *   una modifica per chi guarda, e non deve far scattare storici prezzi,
 *   conflitti di catalogo o propagazioni verso i canali.
 */

/** Arrotonda al centesimo. Il gesto dell'uscita, mai dei passaggi intermedi. */
export function roundToMinor(amountMinor: number): number {
  return Math.round(amountMinor);
}

/** Stesso importo *per l'operatore*: confronto al centesimo. */
export function sameAmountAtCent(a: number, b: number): boolean {
  return Math.round(a) === Math.round(b);
}

/**
 * Come sopra, ma per importi che possono mancare: due assenze sono lo stesso
 * importo, un'assenza e un valore no.
 */
export function sameNullableAmountAtCent(a: number | null, b: number | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return sameAmountAtCent(a, b);
}
