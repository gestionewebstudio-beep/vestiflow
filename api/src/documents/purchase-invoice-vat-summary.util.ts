/**
 * Righe di Registrazione fattura fornitore generate dagli Arrivi merce inclusi:
 * gli imponibili delle righe arrivo vengono raggruppati per aliquota IVA e ogni
 * gruppo produce una riga con Importo netto, IVA %, Importo IVA e Descrizione
 * con il riferimento automatico agli arrivi (es. "Rif. Arrivo merce 6 del
 * 15/07/2026, 8 del 15/07/2026"). Stessa logica usata dal form (anteprima) e
 * dal salvataggio (persistenza): il backend resta autoritativo.
 */

export interface PurchaseInvoiceReceiptLineInput {
  readonly lineTotalMinor: number;
  readonly lineVatTotalMinor: number;
  /** Snapshot Codice IVA (Json Prisma): l'aliquota è `ratePercent` se presente. */
  readonly vatSnapshot: unknown;
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
  const byRate = new Map<number, { netMinor: number; vatMinor: number }>();
  for (const line of receipt.lines) {
    if (line.lineTotalMinor === 0 && line.lineVatTotalMinor === 0) {
      continue;
    }
    const rate = receiptLineVatRate(line);
    const entry = byRate.get(rate) ?? { netMinor: 0, vatMinor: 0 };
    entry.netMinor += line.lineTotalMinor;
    entry.vatMinor += line.lineVatTotalMinor;
    byRate.set(rate, entry);
  }
  if (byRate.size === 0 && (receipt.subtotalMinor !== 0 || receipt.taxMinor !== 0)) {
    // Arrivo storico senza righe dettagliate: unica quota derivata dai totali.
    const rate =
      receipt.subtotalMinor > 0 && receipt.taxMinor > 0
        ? Math.round((receipt.taxMinor / receipt.subtotalMinor) * 100)
        : 0;
    return [{ ratePercent: rate, netMinor: receipt.subtotalMinor, vatMinor: receipt.taxMinor }];
  }
  return [...byRate.entries()]
    .map(([ratePercent, sums]) => ({ ratePercent, ...sums }))
    .sort((a, b) => a.ratePercent - b.ratePercent);
}

/** "6 del 15/07/2026" — etichetta breve dell'arrivo nel riferimento automatico. */
function receiptRefLabel(receipt: PurchaseInvoiceReceiptInput): string {
  const label = receipt.number != null ? String(receipt.number) : (receipt.reference ?? '—');
  return `${label} del ${formatItalianDate(receipt.documentDate)}`;
}

/** dd/MM/yyyy in UTC: documentDate è @db.Date (mezzanotte UTC, mai TZ locali). */
function formatItalianDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/**
 * Righe di registrazione per aliquota dagli arrivi inclusi, ordinate per
 * aliquota crescente; il riferimento elenca gli arrivi che contribuiscono al
 * gruppo in ordine di data documento.
 */
export function buildPurchaseInvoiceVatSummary(
  receipts: readonly PurchaseInvoiceReceiptInput[],
): readonly PurchaseInvoiceVatSummaryLine[] {
  const sorted = [...receipts].sort(
    (a, b) =>
      a.documentDate.getTime() - b.documentDate.getTime() || (a.number ?? 0) - (b.number ?? 0),
  );
  const byRate = new Map<number, { netMinor: number; vatMinor: number; refs: string[] }>();
  for (const receipt of sorted) {
    const ref = receiptRefLabel(receipt);
    for (const quota of receiptVatBreakdown(receipt)) {
      const entry = byRate.get(quota.ratePercent) ?? { netMinor: 0, vatMinor: 0, refs: [] };
      entry.netMinor += quota.netMinor;
      entry.vatMinor += quota.vatMinor;
      if (!entry.refs.includes(ref)) {
        entry.refs.push(ref);
      }
      byRate.set(quota.ratePercent, entry);
    }
  }
  return [...byRate.entries()]
    .map(([ratePercent, entry]) => ({
      ratePercent,
      netMinor: entry.netMinor,
      vatMinor: entry.vatMinor,
      description: `Rif. Arrivo merce ${entry.refs.join(', ')}`,
    }))
    .sort((a, b) => a.ratePercent - b.ratePercent);
}
