import { normalizeSku } from '@domain/products/models/product-form.validators';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

/** I quattro campi codice di una riga documento. */
export type DocumentLineCodeField = 'articleCode' | 'sku' | 'barcode' | 'supplierCode';

/**
 * Corrispondenze **esatte** di un codice digitato, sul campo da cui è stato
 * digitato. Nient'altro: il campo codice non è un campo di ricerca — chi digita
 * un codice sa già cosa cerca, e un codice che non esiste resta scritto perché
 * è quello che l'operatore voleva.
 *
 * Vive qui, e non nelle maschere, perché la regola è la stessa su tutte: Ordine
 * cliente, Arrivo merce, Ordine fornitore. Tre copie di questo filtro sarebbero
 * il difetto che il lavoro sulle righe documento sta rimuovendo.
 *
 * **Quante ne può restituire, e cosa significa:**
 * - `sku` e `barcode` sono unici per variante (vincolo di database): al più una;
 * - `articleCode` è unico per PRODOTTO: più risultati sono varianti dello
 *   stesso articolo, e la scelta è «quale taglia»;
 * - `supplierCode` non è unico affatto: fornitori diversi possono usare lo
 *   stesso codice per articoli diversi, e la scelta è «quale articolo».
 *
 * Chi chiama distingue **tre** esiti — nessuna, una, più d'una — e non due:
 * appiattire «più d'una» su «nessuna» fa sì che un codice giusto si comporti
 * come un codice inesistente, che è la peggiore delle tre risposte.
 */
export function filterExactCodeMatches(
  rows: readonly VariantSummary[],
  value: string,
  field: DocumentLineCodeField,
): readonly VariantSummary[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (field === 'sku') {
    return rows.filter((row) => normalizeSku(row.sku) === normalizeSku(trimmed));
  }

  if (field === 'articleCode') {
    const normalized = trimmed.toUpperCase();
    return rows.filter((row) => row.articleCode.trim().toUpperCase() === normalized);
  }

  if (field === 'supplierCode') {
    // Il guardiano sul valore non è pleonastico: senza, ogni variante priva di
    // collegamento fornitore risponderebbe a un confronto fra stringhe vuote.
    return rows.filter(
      (row) => !!row.supplierSku && normalizeSku(row.supplierSku) === normalizeSku(trimmed),
    );
  }

  return rows.filter((row) => row.barcode?.trim() === trimmed);
}

/**
 * Quante corrispondenze chiedere al catalogo quando si conferma un codice.
 *
 * NON è la dimensione di un elenco da sfogliare: si vogliono tutte le varianti
 * che condividono il codice. Un articolo di abbigliamento con sei taglie per
 * cinque colori ne ha trenta, e la pagina da venti che c'era prima le troncava
 * **senza dirlo** — la scelta ne mostrava alcune e taceva sulle altre.
 *
 * ⚠️ **Resta una soglia, non un «tutte».** Cento è il massimo che l'API accetta
 * (`PaginationQueryDto`), quindi un articolo con più di cento varianti verrebbe
 * troncato lo stesso, e di nuovo in silenzio. Oggi non è un caso pratico, ma
 * chi legge questa costante non deve credere che il troncamento sia impossibile:
 * è solo diventato improbabile. Se un giorno servisse la garanzia, la strada non
 * è alzare il numero — è chiedere al server le varianti di quel prodotto invece
 * di una pagina di ricerca.
 */
export const DOCUMENT_CODE_MATCH_PAGE_SIZE = 100;

/** Le fonti da cui può venire il codice fornitore di una riga, in ordine. */
export interface DocumentLineSupplierCodeSources {
  /**
   * Il codice che l'operatore ha digitato e con cui l'articolo si è agganciato.
   * Vince su tutto: è quello che ha davanti agli occhi, sul listino da cui sta
   * ordinando.
   */
  readonly linkedWith?: string | null;
  /**
   * Il codice del collegamento con il fornitore **della testata**. Secondo, non
   * primo: vale quando l'aggancio è avvenuto per altra via (nome, SKU, EAN,
   * scansione), dove un «codice con cui hai agganciato» non esiste.
   */
  readonly ofDocumentSupplier?: string | null;
}

/**
 * Quale codice fornitore scrivere nella riga quando si aggancia un articolo.
 *
 * ⚠️ **Ciò che NON è una fonte: `VariantSummary.supplierSku`.** Da quando la
 * ricerca di conferma non filtra più per fornitore, quel campo è il **primo
 * collegamento in ordine deterministico** — un codice che può appartenere a un
 * fornitore diverso da quello del documento. Scriverlo nella riga significa
 * mostrare all'operatore un codice che non ha mai digitato e che al suo
 * fornitore non dice niente. L'API lo dichiara già nel proprio commento: senza
 * ricerca e senza fornitore, il codice restituito è arbitrario.
 *
 * La regola è la stessa applicata alla lettura — «il codice restituito è quello
 * che ha fatto scattare la ricerca» — portata alla scrittura, dove era rimasta
 * indietro. Vale su **Arrivo merce e Ordine fornitore**, gli unici due documenti
 * con la colonna Cod. fornitore.
 *
 * Nessuna fonte disponibile ⇒ stringa vuota, e chi chiama **non deve
 * sovrascrivere**: meglio un campo vuoto che l'operatore riempie, di un campo
 * pieno con il codice di qualcun altro.
 */
export function supplierCodeForDocumentLine(sources: DocumentLineSupplierCodeSources): string {
  return sources.linkedWith?.trim() || sources.ofDocumentSupplier?.trim() || '';
}
