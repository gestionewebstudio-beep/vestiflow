/**
 * ⭐ **«QUESTA CELLA NON HA UN VALORE»** — una definizione sola, 01/09/2026.
 *
 * Una cella vuota non si rende vuota: si rende con un trattino. Il testo che ne
 * esce (`—`) attraversa poi tutto ciò che legge le celle — le card, l'ordinamento,
 * l'elenco dei valori di un filtro — e ognuno di quei posti deve saperlo
 * riconoscere, perché **non è un valore: è l'assenza di uno**.
 *
 * ⛔ **Erano tre definizioni diverse, e divergevano.** Misurato il 01/09/2026:
 *
 * ```text
 * list-card-fields.util   Set('—', '–', '-', 'N/D', 'n/d')   completo
 * column-sort.util        testo !== '—'                       solo il lungo
 * column-filter.model     (nessuna)                           il segnaposto era un valore
 * ```
 *
 * La terza riga è quella che si vedeva: un solo `—` in una colonna data e
 * l'elenco dei valori del filtro **tornava all'ordine alfabetico**, cioè la
 * scelta «le date in ordine decrescente» smetteva di valere su ogni colonna con
 * una riga vuota — che per una data facoltativa sono quasi tutte.
 *
 * ⚠️ **Il trattino è quello LUNGO** (`—`, U+2014), non il meno da tastiera: sono
 * due caratteri diversi, e cercare quello sbagliato non fallisce — semplicemente
 * non trova mai niente. Per questo l'insieme li porta entrambi, più il mezzano.
 */
const SEGNAPOSTO: ReadonlySet<string> = new Set(['—', '–', '-', 'N/D', 'n/d']);

/**
 * Il testo di una cella non porta un valore? (vuoto, o uno dei segnaposto)
 *
 * ⚠️ **Si dà il testo GIÀ RESO**, non il dato: chi chiama legge le celle, non il
 * modello. È la stessa ragione per cui la forma di un filtro si deduce dal testo.
 */
export function senzaValore(testo: string): boolean {
  const pulito = testo.trim();
  return pulito === '' || SEGNAPOSTO.has(pulito);
}
