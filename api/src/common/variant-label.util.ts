/**
 * **L'etichetta della variante: i soli valori delle opzioni, uniti da « / ».**
 *
 * `M / Rosso`, non `Taglia: M · Colore: Rosso`. È la forma di Shopify — dove la
 * variante ha un `title` che è esattamente questo — ed è già quella che tutte e
 * quattro le implementazioni sparse per il progetto producevano: a divergere non
 * era il formato, erano i casi che sapevano reggere.
 *
 * ── Perché sta in `common/` ────────────────────────────────────────────────
 *
 * Il mattone buono viveva in `inventory/import/inventory-csv.util.ts`: una util
 * di import CSV che quattro moduli non importano per non dipendere dall'import
 * CSV, e che quindi si sono riscritti. Qui non ha un dominio proprietario, come
 * `money.util`.
 *
 * ⚠️ **Ha una gemella lato client** (`domain/products/models/product-variant.util`),
 * ed è la forma dichiarata anche per `document-vat.util` ↔ `vat-line-calculation.util`:
 * due alberi, due `package.json`, nessun pacchetto condiviso. Le due devono dare
 * lo **stesso risultato sugli stessi ingressi**, e i test lo inchiodano da
 * entrambe le parti.
 */

/** Il nome che Shopify dà all'unica opzione di un prodotto SENZA varianti. */
const SHOPIFY_DEFAULT_OPTION_NAME = 'Title';
/** Il valore che Shopify dà a quell'unica opzione. */
const SHOPIFY_DEFAULT_OPTION_VALUE = 'Default Title';

/** Una coppia opzione→valore, comunque fosse scritta a database. */
interface OptionPair {
  readonly name: string;
  readonly value: string;
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Le coppie opzione→valore, da **entrambe** le forme che circolano a database.
 *
 * ⚠️ La forma a mappa non è un formato: sono dati vecchi. Tre implementazioni su
 * quattro qui restituivano stringa vuota, e la Dashboard mostrava il solo nome
 * prodotto per quelle varianti.
 */
function optionPairs(optionValues: unknown): OptionPair[] {
  if (Array.isArray(optionValues)) {
    return optionValues
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return { name: '', value: '' };
        }
        const candidate = entry as { name?: unknown; value?: unknown };
        return { name: trimmed(candidate.name), value: trimmed(candidate.value) };
      })
      .filter((pair) => pair.value.length > 0);
  }

  if (optionValues && typeof optionValues === 'object') {
    return Object.entries(optionValues as Record<string, unknown>)
      .map(([name, value]) => ({ name: trimmed(name), value: trimmed(value) }))
      .filter((pair) => pair.value.length > 0);
  }

  return [];
}

/**
 * ⛔ Il **sentinella di Shopify**: un prodotto senza opzioni là ha comunque una
 * variante, con opzione `Title` e valore `Default Title`.
 *
 * Non è una variante che si chiama così: è **l'assenza di varianti**, e l'admin
 * di Shopify non la mostra. Senza questo filtro ogni articolo importato senza
 * opzioni stamperebbe «Default Title» in colonna Variante su ogni riga
 * documento — e sarebbe l'unico punto in cui ci comporteremmo diversamente dal
 * canale con cui ci sincronizziamo.
 */
function isShopifyDefaultOption(pairs: readonly OptionPair[]): boolean {
  return (
    pairs.length === 1 &&
    pairs[0]!.name === SHOPIFY_DEFAULT_OPTION_NAME &&
    pairs[0]!.value === SHOPIFY_DEFAULT_OPTION_VALUE
  );
}

/**
 * L'etichetta della variante, o **stringa vuota** se l'articolo non ne ha.
 *
 * ⛔ Vuoto non è un ripiego: è l'informazione «questo articolo non ha varianti»,
 * ed è ciò che rende leggibile una colonna Variante — una cella vuota lo dice a
 * colpo d'occhio, mentre un titolo impastato no.
 */
export function variantLabel(optionValues: unknown): string {
  const pairs = optionPairs(optionValues);
  if (isShopifyDefaultOption(pairs)) {
    return '';
  }
  return pairs.map((pair) => pair.value).join(' / ');
}

/**
 * L'etichetta come la manda un **canale**, già composta da lui.
 *
 * Shopify la manda nel line item (`variant_title`) ed è esattamente la forma
 * che vogliamo — «M / Rosso» — quindi non si ricompone: si prende e si filtra.
 * Ricomporla dalle nostre `optionValues` sarebbe peggio, perché la variante
 * potrebbe non essere più a catalogo mentre l'ordine resta.
 *
 * ⛔ Il filtro serve lo stesso: per un prodotto senza opzioni Shopify manda
 * letteralmente `Default Title`, e sarebbe l'unica etichetta inventata di
 * tutto il gestionale.
 */
export function variantLabelFromChannel(value: unknown): string {
  const testo = typeof value === 'string' ? value.trim() : '';
  return testo === SHOPIFY_DEFAULT_OPTION_VALUE ? '' : testo;
}

/**
 * Nome dell'articolo **più** la variante, per i posti che hanno un campo solo.
 *
 * ⚠️ Serve dove una colonna separata non esiste e non può esistere: la
 * `<Descrizione>` della fattura elettronica, che nel tracciato è una sola per
 * riga. Nelle righe documento **non si usa**: lì titolo e variante sono due
 * colonne, ed è tutto il punto.
 */
export function variantTitle(productName: string, optionValues: unknown): string {
  const label = variantLabel(optionValues);
  const name = productName.trim();
  if (!label) {
    return name;
  }
  return name ? `${name} — ${label}` : label;
}
