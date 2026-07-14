import { UnprocessableEntityException } from '@nestjs/common';
import type { DocumentType, Prisma, PurchaseCostEntryMode } from '@prisma/client';

import {
  computeVatLineAmounts,
  type VatComputationInput,
} from '../vat/vat-line-calculation.util';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import { documentTypeDefaultLoadsStock } from './document-type.util';
import { normalizeSerialNumbers, type DocumentTotals } from './document-totals.util';
import type {
  SaveGoodsReceiptLineDto,
  SaveGoodsReceiptNewProductDto,
} from './dto/save-goods-receipt.dto';

/** Riga Arrivo merce calcolata con Codice IVA e modalità costo (§9–§15). */
export interface ComputedGoodsReceiptLine {
  lineNumber: number;
  variantId: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  /** Netto canonico unitario in unità minori (riferimento prezzi fornitore). */
  unitPriceMinor: number;
  discountPercent: number;
  /** Legacy informativo: aliquota arrotondata a intero. */
  vatRatePercent: number | null;
  lineTotalMinor: number;
  vatCodeId: string | null;
  vatSnapshot: Prisma.InputJsonObject | null;
  enteredUnitCost: string | null;
  costEntryModeSnapshot: PurchaseCostEntryMode;
  unitCostNet: string | null;
  unitCostGross: string | null;
  unitVatAmount: string | null;
  lineVatTotalMinor: number;
  lineGrossTotalMinor: number;
  supplierPayableLineMinor: number;
  reverseChargeVatMinor: number;
  nonDeductibleVatMinor: number;
  vatAffectsSupplierTotal: boolean;
  effectiveRatePercent: number;
  loadsStock: boolean;
  supplierOrderLineId: string | null;
  lotCode: string | null;
  lotExpiryDate: Date | null;
  serialNumbers: string[];
  /** Passthrough della creazione atomica articolo (punto A): risolto in transazione. */
  newProduct: SaveGoodsReceiptNewProductDto | null;
}

/** Conversione unità minori → stringa decimale a 6 cifre per NUMERIC. */
function minorToDecimalString(minor: number): string {
  return (minor / 100).toFixed(6);
}

function vatInputFromCode(vatCode: VatCodeWithNature): VatComputationInput {
  return {
    ratePercent: Number(vatCode.ratePercent),
    nonDeductiblePercent: Number(vatCode.nonDeductiblePercent),
    calculationMode: vatCode.calculationMode,
    vatAffectsSupplierTotal: vatCode.vatAffectsSupplierTotal,
  };
}

/** Fallback legacy per righe senza Codice IVA (solo aliquota numerica). */
function vatInputFromLegacyRate(ratePercent: number | null): VatComputationInput {
  return {
    ratePercent: ratePercent ?? 0,
    nonDeductiblePercent: 0,
    calculationMode: 'standard',
    vatAffectsSupplierTotal: (ratePercent ?? 0) > 0,
  };
}

export interface ComputeGoodsReceiptLinesParams {
  readonly lines: readonly SaveGoodsReceiptLineDto[];
  readonly documentType: DocumentType;
  readonly costEntryMode: PurchaseCostEntryMode;
  /** Codici IVA risolti per id (con Natura, validati per tenant). */
  readonly vatCodesById: ReadonlyMap<string, VatCodeWithNature>;
  readonly buildSnapshot: (vatCode: VatCodeWithNature) => Prisma.InputJsonObject;
}

/**
 * Calcola le righe dell'Arrivo merce con Codice IVA e modalità costo:
 * netto canonico, IVA, lordo, importo fornitore, reverse charge e
 * indetraibile per riga (§9, §11, §15).
 */
export function computeGoodsReceiptLines(
  params: ComputeGoodsReceiptLinesParams,
): ComputedGoodsReceiptLine[] {
  const defaultLoadsStock = documentTypeDefaultLoadsStock(params.documentType);

  return params.lines.map((line, index) => {
    const vatCode = line.vatCodeId ? params.vatCodesById.get(line.vatCodeId) : undefined;
    if (line.vatCodeId && !vatCode) {
      throw new UnprocessableEntityException(
        `Il Codice IVA della riga ${index + 1} non esiste o non è più disponibile.`,
      );
    }
    const vat = vatCode ? vatInputFromCode(vatCode) : vatInputFromLegacyRate(line.vatRatePercent ?? null);

    const enteredUnitCostMinor = line.enteredUnitCostMinor ?? line.unitPriceMinor ?? 0;
    const discountPercent = line.discountPercent ?? 0;
    const quantity = line.quantity;

    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor,
      costEntryMode: params.costEntryMode,
      quantity,
      discountPercent,
      vat,
    });

    return {
      lineNumber: index + 1,
      variantId: line.variantId ?? null,
      sku: line.sku ?? null,
      description: line.description.trim(),
      quantity,
      unitPriceMinor: amounts.unitNetMinor,
      discountPercent,
      vatRatePercent: vatCode
        ? Math.round(Number(vatCode.ratePercent))
        : (line.vatRatePercent ?? null),
      lineTotalMinor: amounts.lineNetMinor,
      vatCodeId: vatCode?.id ?? null,
      vatSnapshot: vatCode ? params.buildSnapshot(vatCode) : null,
      enteredUnitCost: minorToDecimalString(enteredUnitCostMinor),
      costEntryModeSnapshot: params.costEntryMode,
      unitCostNet: minorToDecimalString(amounts.unitNetMinor),
      unitCostGross: minorToDecimalString(amounts.unitGrossMinor),
      unitVatAmount: minorToDecimalString(amounts.unitVatMinor),
      lineVatTotalMinor: amounts.lineVatMinor,
      lineGrossTotalMinor: amounts.lineGrossMinor,
      supplierPayableLineMinor: amounts.supplierPayableMinor,
      reverseChargeVatMinor: amounts.reverseChargeVatMinor,
      nonDeductibleVatMinor: amounts.nonDeductibleVatMinor,
      vatAffectsSupplierTotal: vat.vatAffectsSupplierTotal,
      effectiveRatePercent: vat.ratePercent,
      loadsStock: line.loadsStock ?? defaultLoadsStock,
      supplierOrderLineId: line.supplierOrderLineId ?? null,
      lotCode: line.lotCode?.trim() || null,
      lotExpiryDate: line.lotExpiryDate ? new Date(line.lotExpiryDate) : null,
      serialNumbers: normalizeSerialNumbers(line.serialNumbers),
      newProduct: line.variantId ? null : (line.newProduct ?? null),
    };
  });
}

/**
 * Totali documento con Codici IVA (§10.2): l'IVA concorre al totale SOLO per
 * i codici con vatAffectsSupplierTotal (reverse charge e 0% restano fuori).
 * Lo sconto documento è ripartito proporzionalmente come nel flusso legacy.
 */
export function computeGoodsReceiptTotals(
  lines: readonly Pick<
    ComputedGoodsReceiptLine,
    'lineTotalMinor' | 'lineVatTotalMinor' | 'vatAffectsSupplierTotal' | 'effectiveRatePercent'
  >[],
  documentDiscountPercent = 0,
): DocumentTotals {
  const lineSum = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
  const docDiscount = Math.min(100, Math.max(0, documentDiscountPercent));
  const docDiscountAmount = Math.round((lineSum * docDiscount) / 100);
  const discountedLineSum = lineSum - docDiscountAmount;

  let taxMinor: number;
  if (docDiscount === 0 || lineSum === 0) {
    taxMinor = lines.reduce(
      (sum, line) => sum + (line.vatAffectsSupplierTotal ? line.lineVatTotalMinor : 0),
      0,
    );
  } else {
    taxMinor = lines.reduce((sum, line) => {
      if (!line.vatAffectsSupplierTotal || line.effectiveRatePercent <= 0) {
        return sum;
      }
      const share = line.lineTotalMinor / lineSum;
      const discountedNet = Math.round(discountedLineSum * share);
      return sum + Math.round((discountedNet * line.effectiveRatePercent) / 100);
    }, 0);
  }

  return {
    subtotalMinor: discountedLineSum,
    taxMinor,
    totalMinor: discountedLineSum + taxMinor,
  };
}
