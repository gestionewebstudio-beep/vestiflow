/**
 * Con cosa si apre il pannello di ricerca quando lo si chiama da una riga.
 *
 * **Riga libera**: col testo che si sta scrivendo. È quello che si stava
 * cercando, e ritrovarselo nel campo evita di riscriverlo.
 *
 * **Riga già agganciata a un articolo**: col suo **codice**, non col testo.
 *
 * La ragione è un difetto trovato dal proprietario il giorno stesso in cui il
 * nome è diventato modificabile (11/08/2026): il pannello si apriva col nome
 * della riga, quindi bastava correggere la descrizione — «Rosso scuro, seconda
 * scelta» — perché l'articolo non si trovasse più, e con lui sparisse l'unica
 * via rimasta per aprirne l'anagrafica. La via si rompeva **proprio per la
 * funzione appena aggiunta**.
 *
 * Il codice non ha quel problema: non cambia quando si riscrive la descrizione,
 * ed è esatto, quindi il risultato è uno solo — l'articolo di quella riga. Chi
 * invece vuole SOSTITUIRE l'articolo scrive sopra: il campo del pannello nasce
 * col fuoco e il testo selezionato.
 */
export interface DocumentSearchLaunchSource {
  /** La riga ha un articolo di catalogo dietro. */
  readonly linked: boolean;
  /** Il nome scritto sulla riga (che da oggi può non essere quello a catalogo). */
  readonly name: string;
  readonly sku?: string;
  readonly articleCode?: string;
  readonly barcode?: string;
}

export function documentSearchLaunchTerm(source: DocumentSearchLaunchSource): string {
  const name = source.name.trim();
  if (!source.linked) {
    return name;
  }
  // In quest'ordine perché è l'ordine in cui identificano: lo SKU è la variante,
  // il codice articolo il prodotto, l'EAN può mancare o essere condiviso.
  const code = source.sku?.trim() || source.articleCode?.trim() || source.barcode?.trim() || '';
  return code || name;
}
