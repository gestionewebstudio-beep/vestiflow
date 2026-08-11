/**
 * Le righe vuote in coda, quelle che al salvataggio si scartano.
 *
 * **Perché esistono.** Le crea la navigazione stessa: Tab o ↓ dall'ultimo campo
 * dell'ultima riga fanno nascere la riga sotto, ed è giusto che sia così — si
 * sta continuando a scrivere. Ma basta arrivarci per sbaglio, o cambiare idea,
 * e in fondo al documento resta una riga che nessuno ha compilato.
 *
 * **Perché non è un errore.** Fino all'11/08/2026 il salvataggio la trattava
 * come una riga da completare: «Riga 4: manca l'articolo», e il documento non
 * partiva finché non la si cancellava a mano. L'operatore doveva rimediare a
 * qualcosa che non aveva fatto — l'aveva fatto la maschera. Una riga vuota non
 * è un dato sbagliato: è l'assenza di un dato, e si scarta in silenzio.
 *
 * **Solo in CODA, e solo VUOTE.** Una riga vuota in mezzo ad altre compilate è
 * un'altra cosa — qualcuno l'ha lasciata lì, magari per riempirla — e va
 * segnalata, non fatta sparire. Per questo la ricerca si ferma alla prima riga
 * con qualcosa dentro.
 *
 * **Almeno una resta.** Se sono vuote tutte, non si svuota il documento: si
 * lascia l'ultima e sarà la validazione a dire che il documento non ha righe.
 * Scartarle tutte produrrebbe un salvataggio riuscito di un documento senza
 * niente dentro, che è peggio del messaggio.
 *
 * @param lineCount quante righe ci sono adesso
 * @param isEmpty   «questa riga è vuota?» — lo sa solo la maschera: in Ordine
 *                  fornitore vuol dire nessun articolo scelto, altrove anche
 *                  nessun codice digitato
 * @returns gli indici da togliere, **dal più alto al più basso**, così chi li
 *          rimuove in ordine non invalida quelli che restano
 */
export function trailingEmptyLineIndices(
  lineCount: number,
  isEmpty: (index: number) => boolean,
  keepAtLeast = 1,
): readonly number[] {
  const indices: number[] = [];
  for (let index = lineCount - 1; index >= 0; index -= 1) {
    if (lineCount - indices.length <= keepAtLeast) {
      break;
    }
    if (!isEmpty(index)) {
      break;
    }
    indices.push(index);
  }
  return indices;
}
