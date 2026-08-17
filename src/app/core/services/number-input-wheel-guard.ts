/**
 * La rotella del mouse non deve cambiare un numero.
 *
 * Con `<input type="number">` il browser lega la rotella al valore: se il campo
 * ha il fuoco e ci passi sopra scorrendo la pagina, **il numero cambia**. Senza
 * un clic, senza un avviso, e senza che nessuno se ne accorga — su una scheda
 * prodotto lunga o su un documento con venti righe è esattamente il modo in cui
 * un prezzo o una quantità cambiano da soli.
 *
 * ⚠️ **Il CSS non può niente**, ed è la ragione per cui questo file esiste:
 * `appearance: textfield` toglie le frecce, la rotella resta. Sono due
 * comportamenti diversi dello stesso elemento, e vanno spenti in due modi.
 *
 * ## Perché toglie il fuoco invece di annullare l'evento
 *
 * `preventDefault()` fermerebbe anche lo **scorrimento della pagina**: il
 * cursore sopra un campo numerico e la pagina non si muove più. Sarebbe un
 * secondo difetto al posto del primo.
 *
 * Togliendo il fuoco, il browser smette di considerare il campo destinatario
 * della rotella e la pagina scorre come se il campo non ci fosse. Il valore
 * digitato resta: `blur` non lo tocca, e i Reactive Forms hanno già registrato
 * ogni battuta.
 *
 * ## Perché sta qui e non in una direttiva
 *
 * Una direttiva su `input[type="number"]` andrebbe **importata in ogni
 * componente standalone** che ne ha uno: oggi 20 file, e il ventunesimo se ne
 * dimenticherebbe. Un ascoltatore solo, in cattura sul documento, vale per
 * tutti — compresi i campi che nasceranno domani e quelli dentro overlay che la
 * CDK monta fuori dall'albero del componente.
 */
export function installNumberInputWheelGuard(doc: Document = document): () => void {
  const onWheel = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'number') {
      return;
    }
    // Solo se il campo ha il fuoco: la rotella cambia il valore solo in quel
    // caso, e togliere il fuoco a un campo che non ce l'ha è un effetto
    // collaterale gratuito.
    if (doc.activeElement !== target) {
      return;
    }
    target.blur();
  };

  // In cattura: arriva prima che il browser applichi l'incremento, e prima di
  // eventuali gestori del componente.
  doc.addEventListener('wheel', onWheel, { capture: true, passive: true });
  return () => doc.removeEventListener('wheel', onWheel, { capture: true });
}
