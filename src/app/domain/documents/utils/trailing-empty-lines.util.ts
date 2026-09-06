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
 * **Se sono vuote tutte, si scartano tutte.** ⛔ Qui c'era il contrario —
 * «almeno una resta […] scartarle tutte produrrebbe un salvataggio riuscito di
 * un documento senza niente dentro, che è peggio del messaggio». Quella frase
 * descriveva una decisione che il proprietario ha ROVESCIATO il 25/08/2026:
 *
 * > «Se non ho fatto nulla nel documento e lo salvo, devo avere la possibilità
 * >  di crearlo vuoto e avrò un documento vuoto con numero, eventuale serie e
 * >  data. Ovunque deve essere così.»
 *
 * ⚠️ **Era il vero muro, e non si vedeva.** Le maschere avevano ognuna il
 * proprio «aggiungi almeno una riga», ma anche togliendoli il documento non
 * sarebbe partito lo stesso: la riga seminata all'apertura restava qui, e con
 * lei l'array delle righe non era mai valido. Il divieto stava in questo
 * default, non nelle frasi che lo annunciavano.
 *
 * `keepAtLeast` resta un parametro perché la scelta è del chiamante: chi ha
 * bisogno di non svuotare l'elenco lo dichiara, invece di ereditarlo.
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
  keepAtLeast = 0,
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
