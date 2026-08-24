/**
 * La cella «Articolo» di una riga stampata: cosa ci finisce, e in quale ordine.
 *
 * ⚠️ **Sta in una funzione sua per poter essere provata.** Dentro
 * `document-pdf.service` era una composizione di tre righe in mezzo alla
 * costruzione della tabella, e l'unica cosa che i test del PDF possono
 * verificare è che il buffer cominci per `%PDF`: pdfkit comprime i flussi,
 * quindi il testo nel buffer **non è cercabile**.
 *
 * Il risultato era che la cella non aveva copertura, e il giorno in cui la
 * variante è uscita dalla descrizione nessun test sarebbe diventato rosso — la
 * stampa avrebbe semplicemente smesso di dire la taglia.
 */
export interface RigaStampata {
  readonly description: string;
  /** L'etichetta della variante: «M / Rosso». Vuota se l'articolo non ne ha. */
  readonly variantLabel?: string | null;
  readonly sku?: string | null;
  readonly serialNumbers?: readonly string[];
}

/**
 * Le righe di testo della cella articolo, dall'alto in basso.
 *
 * L'ordine non è casuale: **nome, variante, SKU, seriali** va dal più generale
 * al più specifico, ed è lo stesso ordine della card mobile e del Dettaglio.
 * Chi riceve la merce legge dall'alto e si ferma quando ha riconosciuto il
 * pezzo.
 */
export function printArticleCellLines(line: RigaStampata): readonly string[] {
  const parti = [line.description];

  // ⛔ La variante NON si ricava dalla descrizione: ci stava impastata, e ora
  // non più. Se manca qui, sulla stampa non c'è.
  if (line.variantLabel) {
    parti.push(line.variantLabel);
  }

  if (line.sku) {
    parti.push(`SKU: ${line.sku}`);
  }

  const seriali = line.serialNumbers ?? [];
  if (seriali.length > 0) {
    parti.push(`Seriali: ${seriali.join(', ')}`);
  }

  return parti;
}
