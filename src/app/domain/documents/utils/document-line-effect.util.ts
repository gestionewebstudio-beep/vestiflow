/**
 * ⭐ **Un documento senza righe si salva. Righe che non fanno niente, no.**
 *
 * Decisione del proprietario, 25/08/2026, chiesta per TUTTI i tipi documento:
 *
 * > «Se non ho fatto nulla nel documento e lo salvo, devo avere la possibilità
 * >  di crearlo vuoto e avrò un documento vuoto con numero, eventuale serie e
 * >  data. Ovviamente dopo aver selezionato i campi obbligatori previsti per
 * >  quel documento. Ovunque deve essere così.»
 *
 * ⛔ **Prima ogni maschera lo diceva con parole sue**, e cinque su sette
 * rifiutavano il documento vuoto — «Aggiungi almeno una riga valida per salvare
 * il preventivo», «aggiungi almeno una riga con descrizione e quantità (minimo
 * 1)», «aggiungi almeno una riga con una variante e quantità maggiore di zero».
 * Tre frasi per un rifiuto solo, che in realtà veniva dal backend.
 *
 * ## ⚠️ La distinzione che questa funzione esiste per tenere
 *
 * Sono DUE casi, e confonderli è ciò che ha prodotto il divieto sbagliato:
 *
 * ```text
 * nessuna riga            → il documento e' VUOTO.        Si salva.
 * righe che non producono → l'operatore ha scritto        NON si salva.
 * l'effetto promesso        qualcosa e si aspetta un
 *                           effetto: il silenzio sarebbe
 *                           peggio del rifiuto
 * ```
 *
 * Il secondo caso non e' teorico: un trasferimento con tre righe descrittive
 * caricate da un documento esistente e nessuna variante e' un documento che
 * sembra pieno e non sposta un pezzo.
 *
 * ⚠️ **Va chiamata DOPO aver tolto le righe vuote in coda**
 * (`dropTrailingEmptyLines`), o la riga seminata all'apertura conterebbe come
 * «riga presente» e un documento mai toccato risulterebbe senza effetto.
 *
 * @param lineCount quante righe ha il documento in questo momento
 * @param hasEffectiveLine se almeno una di quelle righe produce l'effetto che
 *   il tipo documento promette — muovere giacenza, portare un importo, quello
 *   che è: la definizione appartiene alla maschera, non a questa funzione
 */
export function documentHasLinesWithoutEffect(
  lineCount: number,
  hasEffectiveLine: boolean,
): boolean {
  return lineCount > 0 && !hasEffectiveLine;
}
