import type { Prisma } from '@prisma/client';

import { lineVatFromNetExact } from '../vat/vat-line-calculation.util';

/**
 * I TOTALI DETERMINATI di una riga documento — §5.2 di
 * `docs/24-specifica-ciclo-vita-catalogo-e-sincronizzazione-shopify-v2.md`.
 *
 * ⛔ Qui non c'è un motore economico nuovo: l'imposta la calcola
 * `lineVatFromNetExact`, che è la stessa funzione che i totali di testata
 * usavano già. Cambia DOVE avviene il calcolo, non come — e cioè che il
 * risultato adesso si PERSISTE sulla riga invece di essere sommato e buttato.
 *
 * Il difetto che questo chiude, misurato il 02/09/2026: `computeTotals`
 * calcolava l'imposta di ogni riga, la sommava in `taxMinor` e la perdeva.
 * Le colonne `line_vat_total_minor` e `line_gross_total_minor` restavano
 * quindi al loro `@default(0)` per ogni documento del percorso generico —
 * DDT vendita, fatture, note di credito, preventivi, proforma. Un consumatore
 * vivo già lo pagava: `business-analytics` legge il lordo di riga come ricavo,
 * quindi quelle vendite valevano zero nei report.
 */
export interface DocumentLineEconomicTotals {
  /** Imposta della riga, in unità minori. Zero SOLO se l'aliquota è zero. */
  readonly lineVatTotalMinor: number;
  /** Imponibile arrotondato + imposta. È il valore che un riepilogo somma. */
  readonly lineGrossTotalMinor: number;
}

/**
 * Calcola i totali determinati di una riga.
 *
 * ⚠️ `netExactMinor` è l'imponibile PRIMA dell'arrotondamento: l'imposta nasce
 * da lì, ed è ciò che fa tornare netto + imposta al lordo che l'operatore ha
 * digitato quando il prezzo è stato inserito ivato (§sei decimali di
 * `regole-gestionale`). Passargli l'imponibile già arrotondato perderebbe un
 * centesimo su un prezzo su cinque all'aliquota del 22%.
 *
 * ⚠️ `totalMinor` è invece l'imponibile ARROTONDATO, cioè quello persistito:
 * il lordo si compone su quello, o la colonna non tornerebbe con la propria
 * riga.
 *
 * `ratePercent` nullo significa «nessuna aliquota risolta»: l'imposta è zero
 * perché non c'è imposta, non perché il campo non è stato compilato. È lo zero
 * legittimo che §5.4 distingue dal dato mancante.
 */
export function documentLineEconomicTotals(params: {
  readonly netExactMinor: number;
  readonly totalMinor: number;
  readonly ratePercent: number | null;
}): DocumentLineEconomicTotals {
  const lineVatTotalMinor =
    params.ratePercent == null ? 0 : lineVatFromNetExact(params.netExactMinor, params.ratePercent);
  return {
    lineVatTotalMinor,
    lineGrossTotalMinor: params.totalMinor + lineVatTotalMinor,
  };
}

/**
 * Le colonne economiche che una scrittura di riga documento NON può omettere.
 *
 * ⛔ Il tipo generato da Prisma le dichiara facoltative, perché lo schema dà
 * loro un `@default(0)`: `tsc` non può quindi accorgersi di un mapper che le
 * dimentica — non per sfortuna, ma per costruzione del tipo. È esattamente
 * così che il difetto è sopravvissuto a 112 prove e 3.730 righe di test.
 */
type DocumentLineRequiredEconomicColumns =
  | 'quantity'
  | 'unitPriceMinor'
  | 'discountPercent'
  | 'lineTotalMinor'
  | 'lineVatTotalMinor'
  | 'lineGrossTotalMinor'
  // ── Identità dell'articolo, fotografata (§5.2 di `docs/24`) ──────────────
  //
  // ⚠️ Sono nullable, quindi `null` è un valore legittimo — ma **dichiararlo**
  // non lo è meno: un mapper che li omette lascia la colonna vuota in silenzio,
  // ed è esattamente il difetto che le due colonne economiche avevano prima.
  // Qui il compilatore pretende una decisione esplicita, anche quando è `null`.
  | 'articleCode'
  | 'productName'
  | 'barcode';

/**
 * Il tipo che un mapper di riga documento deve produrre.
 *
 * Riprende `DocumentLineUncheckedCreateWithoutDocumentInput` e ne rende
 * OBBLIGATORIE le colonne economiche: un mapper che ne dimentica una non
 * compila più, e la guardia sta nel compilatore invece che in uno script che
 * cerca un nome nel testo del file.
 *
 * ⚠️ Una guardia testuale qui sarebbe cieca: `documents.service.ts` NOMINA
 * `lineVatTotalMinor` alle righe 261-262 dentro una costante che non viene mai
 * persistita, e verrebbe assolto pur non scrivendolo mai davvero.
 */
export type DocumentLineWriteData = Omit<
  Prisma.DocumentLineUncheckedCreateWithoutDocumentInput,
  DocumentLineRequiredEconomicColumns
> &
  Required<
    Pick<
      Prisma.DocumentLineUncheckedCreateWithoutDocumentInput,
      DocumentLineRequiredEconomicColumns
    >
  >;
