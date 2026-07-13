/**
 * Generazione della Causale di carico da un modello con segnaposto (§9).
 *
 * Il modello usa `{numero}` e `{data}`; le parti mancanti vengono omesse senza
 * lasciare segnaposto vuoti o preposizioni orfane:
 * - "DDT {numero} del {data}" + numero 145, data vuota → "DDT 145"
 * - "DDT {numero} del {data}" + numero vuoto, data 08/05/2026 → "DDT del 08/05/2026"
 * - "DDT {numero} del {data}" + tutto vuoto → "DDT"
 */

const NUMBER_TOKEN = /\{numero\}/gi;
const DATE_TOKEN = /\{data\}/gi;

/** Formatta una data ISO `YYYY-MM-DD` in `GG/MM/AAAA`; stringa vuota se invalida. */
export function formatCausalDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  if (!year || !month || !day) {
    return '';
  }
  return `${day}/${month}/${year}`;
}

/**
 * Applica numero e data (ISO) al modello causale, ripulendo le parti mancanti.
 */
export function renderCausalTemplate(
  template: string,
  params: { readonly number?: string; readonly dateIso?: string },
): string {
  const number = params.number?.trim() ?? '';
  const date = params.dateIso ? formatCausalDate(params.dateIso) : '';

  let text = template.replace(NUMBER_TOKEN, number).replace(DATE_TOKEN, date);

  if (!date) {
    // "del" orfano: a fine testo o davanti a un separatore (es. " - C/Lavorazione").
    text = text.replace(/\bdel\s*$/i, '').replace(/\bdel\s+(?=[-–—(])/gi, '');
  }
  return text.replace(/\s{2,}/g, ' ').trim();
}
