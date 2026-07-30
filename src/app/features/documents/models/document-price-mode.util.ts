/**
 * Modalità prezzo del documento (netto/ivato). `pricesIncludeVat = true`
 * significa che i prezzi riga si inseriscono e mostrano IVA inclusa (l'IVA si
 * scorpora); `false` significa netti (l'IVA si aggiunge). L'importo effettivo
 * delle righe non cambia con la modalità: cambia come viene interpretato.
 */

/** Etichetta del campo prezzo di riga secondo la modalità corrente. */
export function priceModeRowLabel(pricesIncludeVat: boolean): string {
  return pricesIncludeVat ? 'Prezzo ivato' : 'Prezzo netto';
}

/** Etichetta breve della modalità (chip/selettore in testata). */
export function priceModeLabel(pricesIncludeVat: boolean): string {
  return pricesIncludeVat ? 'Ivato' : 'Netto';
}
