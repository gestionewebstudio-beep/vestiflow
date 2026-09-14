/**
 * ⭐ La SEDE di un ordine, per RACCORDO — un posto solo per elenco e dettaglio.
 *
 * Un ordine manuale porta la sede in testata. Un ordine di CANALE no: la sede
 * dell'uscita la dicono gli impegni attivi (finché è aperto) e poi la Vendita
 * online (quando è evaso). Fino al 13/09/2026 l'elenco prendeva «la prima
 * trovata» fra gli impegni e il dettaglio non applicava nessun raccordo: la
 * maschera dell'ordine di canale mostrava «Seleziona location…» su un ordine
 * evaso da una sede nota.
 *
 * ⛔ **Mai la prima fra più sedi** (proprietario, 13/09/2026): con impegni su
 * sedi diverse la sede non è determinabile e resta vuota — «—» è un difetto
 * dichiarato, non una scelta fatta per lui.
 */
export interface SedeRiferimento {
  readonly id: string;
  readonly name: string;
}

export interface SedeDellOrdineInput {
  /** La sede di testata (ordini manuali). */
  readonly location: SedeRiferimento | null | undefined;
  /** Gli impegni ATTIVI dell'ordine, con la loro sede. */
  readonly reservations: readonly { readonly location: SedeRiferimento }[];
  /** La Vendita online generata dall'evasione, con la sede dell'uscita. */
  readonly onlineSale: { readonly location: SedeRiferimento | null } | null | undefined;
}

export function sedeDellOrdine(input: SedeDellOrdineInput): SedeRiferimento | null {
  if (input.location) {
    return input.location;
  }
  const impegnate = new Map<string, SedeRiferimento>();
  for (const reservation of input.reservations) {
    impegnate.set(reservation.location.id, reservation.location);
  }
  if (impegnate.size === 1) {
    return [...impegnate.values()][0] ?? null;
  }
  if (impegnate.size > 1) {
    return null;
  }
  return input.onlineSale?.location ?? null;
}
