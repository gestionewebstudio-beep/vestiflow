import type { Prisma } from '@prisma/client';

import type { VatCodeWithNature } from '../vat/vat-codes.service';
import { buildVatCodeSnapshot } from '../vat/vat-snapshot.util';

/**
 * Moltiplicatore dello sconto a cascata (§SCONTO PER RIGA Ordine cliente):
 * "10%" → 0.9; "4+10%" → 0.96 × 0.90 (sequenza sul residuo, NON 14%);
 * "2+5+8%" → 0.98 × 0.95 × 0.92. Percentuali fuori range (…<0 o >100) o non
 * numeriche vengono ignorate, coerente con `parseEffectiveDiscountPercent`
 * del frontend — ma QUI il moltiplicatore resta ESATTO, mai arrotondato a
 * percentuale intera (la formula del prompt è prezzo × Π(1 − sᵢ/100)).
 */
export function cascadeDiscountMultiplier(input: string | null | undefined): number {
  const trimmed = input?.trim();
  if (!trimmed) {
    return 1;
  }

  let multiplier = 1;
  for (const part of trimmed.replace(/%/g, '').split('+')) {
    const value = Number.parseFloat(part.trim().replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      continue;
    }
    multiplier *= (100 - value) / 100;
  }
  return Math.min(1, Math.max(0, multiplier));
}

/** Prezzo unitario scontato in unità minori (arrotondamento al centesimo). */
export function discountedUnitPriceMinor(
  unitPriceMinor: number,
  discount: string | null | undefined,
): number {
  if (unitPriceMinor <= 0) {
    return 0;
  }
  return Math.round(unitPriceMinor * cascadeDiscountMultiplier(discount));
}

export interface ManualOrderLineInput {
  readonly id?: string;
  readonly variantId?: string | null;
  readonly sku?: string | null;
  readonly barcode?: string | null;
  readonly title: string;
  readonly quantity: number;
  readonly unitPriceMinor?: number;
  readonly discount?: string | null;
  readonly vatCodeId?: string | null;
  readonly commitsStock?: boolean;
  readonly unitOfMeasure?: string | null;
}

export interface ComputedManualOrderLine {
  readonly id: string | null;
  readonly lineNumber: number;
  readonly variantId: string | null;
  readonly sku: string;
  readonly barcode: string | null;
  readonly title: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly discount: string | null;
  /** Totale riga = quantità × prezzo unitario scontato (senza IVA). */
  readonly totalMinor: number;
  readonly vatCodeId: string | null;
  readonly vatSnapshot: Prisma.InputJsonObject | null;
  readonly lineVatTotalMinor: number;
  /** Aliquota effettiva (solo modalità standard, 0 altrimenti) per la
   *  ripartizione dell'IVA con sconto extra documento. */
  readonly vatRatePercent: number;
  readonly commitsStock: boolean;
  readonly unitOfMeasure: string | null;
}

export interface ManualOrderTotals {
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly discountMinor: number;
}

/**
 * Calcola le righe dell'Ordine cliente manuale: sconto a cascata ESATTO,
 * totale riga senza IVA, IVA riga da snapshot Codice IVA (contribuisce al
 * totale solo in modalità `standard`, come per le righe documento vendita).
 * Righe senza prodotto o con quantità 0 NON sono salvabili: il chiamante le
 * filtra prima (regola già stabilita per Arrivo merce, coerente qui).
 */
export function computeManualOrderLines(
  lines: readonly ManualOrderLineInput[],
  vatCodesById: ReadonlyMap<string, VatCodeWithNature>,
): ComputedManualOrderLine[] {
  return lines.map((line, index) => {
    const quantity = Math.max(0, Math.trunc(line.quantity));
    const unitPriceMinor = Math.max(0, Math.trunc(line.unitPriceMinor ?? 0));
    const discount = line.discount?.trim() || null;
    const unitDiscounted = discountedUnitPriceMinor(unitPriceMinor, discount);
    const totalMinor = quantity * unitDiscounted;

    const vatCode = line.vatCodeId ? (vatCodesById.get(line.vatCodeId) ?? null) : null;
    const vatSnapshot = vatCode ? buildVatCodeSnapshot(vatCode) : null;
    const rate = vatCode?.calculationMode === 'standard' ? Number(vatCode.ratePercent) : 0;
    const lineVatTotalMinor = rate > 0 ? Math.round((totalMinor * rate) / 100) : 0;

    return {
      id: line.id ?? null,
      lineNumber: index + 1,
      variantId: line.variantId ?? null,
      sku: line.sku?.trim() ?? '',
      barcode: line.barcode?.trim() || null,
      title: line.title.trim(),
      quantity,
      unitPriceMinor,
      discount,
      totalMinor,
      vatCodeId: vatCode?.id ?? null,
      vatSnapshot,
      lineVatTotalMinor,
      vatRatePercent: rate,
      commitsStock: line.commitsStock ?? true,
      unitOfMeasure: line.unitOfMeasure?.trim() || null,
    };
  });
}

/**
 * Totali documento: imponibile, IVA, totale e sconto complessivo applicato.
 * Lo sconto extra documento si applica DOPO gli sconti riga sull'imponibile
 * complessivo; l'IVA viene ricalcolata sulla ripartizione proporzionale
 * (stessa logica di computeGoodsReceiptTotals dell'Arrivo merce).
 */
export function computeManualOrderTotals(
  lines: readonly ComputedManualOrderLine[],
  documentDiscountPercent = 0,
): ManualOrderTotals {
  let lineSumMinor = 0;
  let grossMinor = 0;
  for (const line of lines) {
    lineSumMinor += line.totalMinor;
    grossMinor += line.quantity * line.unitPriceMinor;
  }

  const docDiscount = Math.min(100, Math.max(0, Math.trunc(documentDiscountPercent)));
  const docDiscountAmount = Math.round((lineSumMinor * docDiscount) / 100);
  const subtotalMinor = lineSumMinor - docDiscountAmount;

  let taxMinor: number;
  if (docDiscount === 0 || lineSumMinor === 0) {
    taxMinor = lines.reduce((sum, line) => sum + line.lineVatTotalMinor, 0);
  } else {
    taxMinor = lines.reduce((sum, line) => {
      if (line.vatRatePercent <= 0) {
        return sum;
      }
      const share = line.totalMinor / lineSumMinor;
      const discountedNet = Math.round(subtotalMinor * share);
      return sum + Math.round((discountedNet * line.vatRatePercent) / 100);
    }, 0);
  }

  return {
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
    discountMinor: Math.max(0, grossMinor - subtotalMinor),
  };
}

/**
 * Riga valida ai fini del salvataggio: prodotto identificato (variante o
 * almeno un titolo) e quantità > 0. Regola secca §STATI: un ordine esiste
 * solo se completo — cliente + almeno una riga valida.
 */
export function isPersistableManualOrderLine(line: ManualOrderLineInput): boolean {
  const hasProduct = Boolean(line.variantId) || Boolean(line.title?.trim());
  return hasProduct && Math.trunc(line.quantity) > 0;
}
