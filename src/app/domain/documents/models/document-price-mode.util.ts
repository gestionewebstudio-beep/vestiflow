/**
 * Modalità prezzo del documento (netto/ivato): riguarda SOLO come i prezzi si
 * vedono e si digitano. `pricesIncludeVat = true` significa che i campi mostrano
 * il prezzo IVA inclusa; `false` che lo mostrano netto.
 *
 * Il valore memorizzato sulla riga è sempre il NETTO, in ogni documento e in
 * ogni modalità, e i totali si calcolano da lì: la modalità non entra nel
 * calcolo e non cambia quanto vale il documento.
 */

/** Etichetta del campo prezzo di riga secondo la modalità corrente. */
export function priceModeRowLabel(pricesIncludeVat: boolean): string {
  return pricesIncludeVat ? 'Prezzo ivato' : 'Prezzo netto';
}

/** Etichetta breve della modalità (chip/selettore in testata). */
export function priceModeLabel(pricesIncludeVat: boolean): string {
  return pricesIncludeVat ? 'Ivato' : 'Netto';
}
