// Suggerimento SKU (generazione, non validazione): pattern PRODOTTO-TAGLIA-COLORE.
// Puro e deterministico, framework-agnostico. Lo SKU prodotto qui e' solo una
// proposta non bloccante: l'utente puo' modificarlo nello step 8.6 e l'unicita'
// autoritativa resta lato backend.

// Lunghezza massima del codice prodotto nello SKU: oltre questa soglia un nome
// lungo viene compresso (acronimo dalle iniziali, poi troncamento).
const MAX_PRODUCT_CODE = 12;

/** Slug di un singolo segmento: maiuscolo, senza accenti, solo [A-Z0-9]. */
export function slugifySkuSegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

/**
 * Codice prodotto compatto derivato dal nome. Nomi corti diventano lo slug
 * pieno; nomi lunghi un acronimo dalle iniziali delle parole (fallback troncato).
 */
export function productCodeFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const full = words.map(slugifySkuSegment).join('');
  if (full.length <= MAX_PRODUCT_CODE) {
    return full;
  }
  const acronym = words.map((word) => slugifySkuSegment(word).charAt(0)).join('');
  const base = acronym.length >= 2 ? acronym : full;
  return base.slice(0, MAX_PRODUCT_CODE);
}

/**
 * SKU suggerito per una variante (1–3 assi): codice prodotto + valori opzione
 * slugificati, uniti con "-" saltando i segmenti vuoti (nessun trattino
 * penzolante). Conforme a SKU_PATTERN.
 */
export function suggestVariantSku(productName: string, values: readonly string[]): string {
  return [productCodeFromName(productName), ...values.map(slugifySkuSegment)]
    .filter((segment) => segment.length > 0)
    .join('-');
}
