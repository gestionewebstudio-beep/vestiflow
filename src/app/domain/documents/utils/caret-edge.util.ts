/**
 * Le frecce ←/→ dentro una riga documento funzionano **a due tempi**: prima
 * muovono il cursore dentro il campo, e solo quando il cursore è già al bordo
 * portano al campo accanto. È la regola che chiunque conosce dai fogli di
 * calcolo, e l'alternativa — uscire subito — renderebbe impossibile correggere
 * una lettera in mezzo a un nome.
 *
 * Qui sta il solo pezzo che serve a decidere: il cursore è già al bordo?
 */

type CaretEdge = 'start' | 'end';

/**
 * `true` se il cursore è al bordo indicato e non c'è testo selezionato —
 * cioè se la freccia non ha più nulla da fare dentro il campo.
 *
 * Due casi non hanno un cursore da leggere, e vanno entrambi trattati come
 * «sono già al bordo», così la freccia porta subito al campo accanto:
 *
 * - i controlli **senza testo** (tendina, spunta): non c'è nulla da percorrere;
 * - i campi **numerici**, dove il browser non espone la posizione del cursore
 *   (`selectionStart` è `null` su Chrome, solleva un errore altrove). Sono
 *   campi corti — quantità, sconto, aliquota — e l'attesa di chi li compila è
 *   quella del foglio di calcolo: la freccia passa alla colonna successiva.
 */
export function caretAtEdge(target: EventTarget | null, edge: CaretEdge): boolean {
  const field = target as Partial<HTMLInputElement> | null;
  if (!field) {
    return true;
  }
  let start: number | null;
  let end: number | null;
  try {
    start = field.selectionStart ?? null;
    end = field.selectionEnd ?? null;
  } catch {
    // Tipo di campo che non ammette la lettura del cursore.
    return true;
  }
  if (start === null || end === null) {
    return true;
  }
  if (start !== end) {
    // C'è una selezione: la freccia la collassa, non lascia il campo.
    return false;
  }
  const value = typeof field.value === 'string' ? field.value : '';
  return edge === 'end' ? start === value.length : start === 0;
}
