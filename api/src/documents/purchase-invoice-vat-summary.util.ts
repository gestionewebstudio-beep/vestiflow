/**
 * **Le quote IVA di un Arrivo merce**, per la Registrazione fattura fornitore.
 *
 * L'arrivo espone i propri imponibili raggruppati per **Codice IVA**; includerlo
 * in una registrazione materializza una riga economica per quota.
 *
 * ⛔ Qui viveva anche il riepilogo che il server ricalcolava a ogni
 * salvataggio. Non c'e' piu': le righe sono una lista sola, tutte modificabili,
 * e il server le scrive come arrivano (§41 della specifica testate).
 */

export interface PurchaseInvoiceReceiptLineInput {
  readonly lineTotalMinor: number;
  readonly lineVatTotalMinor: number;
  /** Snapshot Codice IVA (Json Prisma): l'aliquota è `ratePercent` se presente. */
  readonly vatSnapshot: unknown;
  /**
   * Il Codice IVA della riga arrivo. `null` sulle righe storiche.
   *
   * ⭐ È la CHIAVE del raggruppamento, non l'aliquota: due righe al 22% possono
   * essere una ordinaria e una in inversione contabile, e sono due fatti
   * fiscali diversi.
   */
  readonly vatCodeId?: string | null;
}

export interface PurchaseInvoiceReceiptInput {
  readonly id: string;
  readonly number: number | null;
  readonly reference: string | null;
  readonly documentDate: Date;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly lines: readonly PurchaseInvoiceReceiptLineInput[];
}

/** Quota IVA di un arrivo o di un gruppo di righe (unità minori intere). */
export interface VatBreakdownEntry {
  /** Il Codice IVA del gruppo. `null` per le righe storiche che non ne hanno. */
  readonly vatCodeId: string | null;
  readonly ratePercent: number;
  readonly netMinor: number;
  readonly vatMinor: number;
}

/** Riga registrazione generata da un gruppo aliquota. */
export interface PurchaseInvoiceVatSummaryLine extends VatBreakdownEntry {
  readonly description: string;
}

/** Aliquota della riga: dallo snapshot IVA, altrimenti derivata dagli importi. */
export function receiptLineVatRate(line: PurchaseInvoiceReceiptLineInput): number {
  const snapshot = line.vatSnapshot;
  if (snapshot && typeof snapshot === 'object') {
    const rate = (snapshot as { ratePercent?: unknown }).ratePercent;
    if (typeof rate === 'number' && Number.isFinite(rate)) {
      return rate;
    }
  }
  if (line.lineTotalMinor > 0 && line.lineVatTotalMinor > 0) {
    return Math.round((line.lineVatTotalMinor / line.lineTotalMinor) * 100);
  }
  return 0;
}

/** Quote IVA di un singolo arrivo (per l'anteprima nel form). */
export function receiptVatBreakdown(
  receipt: Pick<PurchaseInvoiceReceiptInput, 'subtotalMinor' | 'taxMinor' | 'lines'>,
): readonly VatBreakdownEntry[] {
  // ⛔ La chiave era la sola `ratePercent`, e due righe al 22% finivano nella
  // stessa quota anche quando una era ordinaria e l'altra in INVERSIONE
  // CONTABILE. La riga materializzata sulla fattura perdeva la Natura N6 e il
  // fatto che quell'IVA non e' dovuta al fornitore.
  //
  // ⭐ Ora la chiave e' il Codice IVA. Le righe storiche — che ne hanno NULL —
  // continuano a raggrupparsi per aliquota: separarle una per una farebbe
  // diventare dieci righe di fattura un arrivo vecchio con dieci righe al 22%.
  const byKey = new Map<
    string,
    { vatCodeId: string | null; ratePercent: number; netMinor: number; vatMinor: number }
  >();
  for (const line of receipt.lines) {
    if (line.lineTotalMinor === 0 && line.lineVatTotalMinor === 0) {
      continue;
    }
    const ratePercent = receiptLineVatRate(line);
    const vatCodeId = line.vatCodeId ?? null;
    const key = vatCodeId ?? `aliquota:${ratePercent}`;
    const entry = byKey.get(key) ?? { vatCodeId, ratePercent, netMinor: 0, vatMinor: 0 };
    entry.netMinor += line.lineTotalMinor;
    entry.vatMinor += line.lineVatTotalMinor;
    byKey.set(key, entry);
  }
  if (byKey.size === 0 && (receipt.subtotalMinor !== 0 || receipt.taxMinor !== 0)) {
    // Arrivo storico senza righe dettagliate: unica quota derivata dai totali.
    const rate =
      receipt.subtotalMinor > 0 && receipt.taxMinor > 0
        ? Math.round((receipt.taxMinor / receipt.subtotalMinor) * 100)
        : 0;
    return [
      {
        vatCodeId: null,
        ratePercent: rate,
        netMinor: receipt.subtotalMinor,
        vatMinor: receipt.taxMinor,
      },
    ];
  }
  // Ordine: per aliquota, e a parita' di aliquota per codice — cosi' il 22
  // ordinario e il 22 in inversione contabile hanno un ordine stabile invece
  // che quello di inserimento.
  return [...byKey.values()].sort(
    (a, b) => a.ratePercent - b.ratePercent || (a.vatCodeId ?? '').localeCompare(b.vatCodeId ?? ''),
  );
}

// ⛔ Qui c'erano `receiptRefLabel`, `formatItalianDate` e soprattutto
// `buildPurchaseInvoiceVatSummary`: il riepilogo per aliquota che il SERVER
// ricalcolava a ogni salvataggio, in sola lettura per l'operatore.
//
// ⚠️ Tolte il 25/08/2026 col meccanismo che servivano. Le righe economiche
// sono ora UNA lista e tutte modificabili: il server le scrive come arrivano
// invece di rigenerarle, e includere un arrivo le MATERIALIZZA una volta.
// Il riferimento «Rif. Arrivo merce N del …» lo compone il client, che e' chi
// materializza.
