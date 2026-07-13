import type {
  PurchaseCostEntryMode,
  VatCalculationMode,
  VatCode,
  VatSnapshot,
} from '@core/models/vat-code.model';

/**
 * Calcolo IVA riga lato client (§11–§15), specchio di
 * `api/src/vat/vat-line-calculation.util.ts`: stesse formule e stessi
 * arrotondamenti, così i totali mostrati coincidono con quelli persistiti.
 */

/** Dati IVA necessari al calcolo (da VatCode, snapshot o aliquota legacy). */
export interface VatComputationInput {
  readonly ratePercent: number;
  readonly nonDeductiblePercent: number;
  readonly calculationMode: VatCalculationMode;
  readonly vatAffectsSupplierTotal: boolean;
}

export interface VatLineAmounts {
  readonly unitNetMinor: number;
  readonly unitGrossMinor: number;
  readonly unitVatMinor: number;
  readonly lineNetMinor: number;
  readonly lineVatMinor: number;
  readonly lineGrossMinor: number;
  readonly supplierPayableMinor: number;
  readonly reverseChargeVatMinor: number;
  readonly nonDeductibleVatMinor: number;
}

function vatIsExposed(mode: VatCalculationMode): boolean {
  return mode === 'standard' || mode === 'split_payment';
}

/**
 * In modalità costi ivati lo scorporo si applica solo se l'IVA è davvero
 * contenuta nel valore digitato (IVA esposta dal fornitore).
 */
export function entryIncludesVat(
  costEntryMode: PurchaseCostEntryMode,
  vat: VatComputationInput,
): boolean {
  return (
    costEntryMode === 'vat_included' && vatIsExposed(vat.calculationMode) && vat.ratePercent > 0
  );
}

/** Scorpora l'IVA da un importo lordo in unità minori. */
export function netFromGrossMinor(grossMinor: number, ratePercent: number): number {
  if (ratePercent <= 0) {
    return grossMinor;
  }
  return Math.round((grossMinor * 100) / (100 + ratePercent));
}

/** Aggiunge l'IVA a un importo netto in unità minori. */
export function grossFromNetMinor(netMinor: number, ratePercent: number): number {
  if (ratePercent <= 0) {
    return netMinor;
  }
  return netMinor + Math.round((netMinor * ratePercent) / 100);
}

export function vatInputFromVatCode(vatCode: VatCode): VatComputationInput {
  return {
    ratePercent: vatCode.ratePercent,
    nonDeductiblePercent: vatCode.nonDeductiblePercent,
    calculationMode: vatCode.calculationMode,
    vatAffectsSupplierTotal: vatCode.vatAffectsSupplierTotal,
  };
}

export function vatInputFromSnapshot(snapshot: VatSnapshot): VatComputationInput {
  return {
    ratePercent: snapshot.ratePercent,
    nonDeductiblePercent: snapshot.nonDeductiblePercent,
    calculationMode: snapshot.calculationMode,
    vatAffectsSupplierTotal: snapshot.vatAffectsSupplierTotal,
  };
}

/** Fallback legacy per righe senza Codice IVA (solo aliquota numerica). */
export function vatInputFromLegacyRate(ratePercent: number | null): VatComputationInput {
  return {
    ratePercent: ratePercent ?? 0,
    nonDeductiblePercent: 0,
    calculationMode: 'standard',
    vatAffectsSupplierTotal: (ratePercent ?? 0) > 0,
  };
}

export interface ComputeVatLineParams {
  readonly enteredUnitCostMinor: number;
  readonly costEntryMode: PurchaseCostEntryMode;
  readonly quantity: number;
  readonly discountPercent: number;
  readonly vat: VatComputationInput;
}

/**
 * Ordine dei calcoli §15: costo digitato → sconto riga → netto/lordo →
 * IVA → quantità → arrotondamento riga.
 */
export function computeVatLineAmounts(params: ComputeVatLineParams): VatLineAmounts {
  const { enteredUnitCostMinor, costEntryMode, quantity, vat } = params;
  const discount = Math.min(100, Math.max(0, params.discountPercent));
  const rate = Math.max(0, vat.ratePercent);
  const exposed = vatIsExposed(vat.calculationMode);
  const includesVat = entryIncludesVat(costEntryMode, vat);

  let unitNetMinor: number;
  let lineNetMinor: number;
  let lineVatMinor: number;

  if (includesVat) {
    unitNetMinor = netFromGrossMinor(enteredUnitCostMinor, rate);
    const lineGrossBeforeVat = Math.round(
      (quantity * enteredUnitCostMinor * (100 - discount)) / 100,
    );
    lineNetMinor = netFromGrossMinor(lineGrossBeforeVat, rate);
    lineVatMinor = lineGrossBeforeVat - lineNetMinor;
  } else {
    unitNetMinor = enteredUnitCostMinor;
    lineNetMinor = Math.round((quantity * enteredUnitCostMinor * (100 - discount)) / 100);
    lineVatMinor = rate > 0 ? Math.round((lineNetMinor * rate) / 100) : 0;
  }

  const unitVatMinor = rate > 0 ? grossFromNetMinor(unitNetMinor, rate) - unitNetMinor : 0;
  const unitGrossMinor = unitNetMinor + unitVatMinor;

  const isReverseCharge = vat.calculationMode === 'reverse_charge';
  const lineGrossMinor = exposed ? lineNetMinor + lineVatMinor : lineNetMinor;
  const supplierPayableMinor = lineNetMinor + (vat.vatAffectsSupplierTotal ? lineVatMinor : 0);
  const reverseChargeVatMinor = isReverseCharge ? lineVatMinor : 0;
  const nonDeductible = Math.min(100, Math.max(0, vat.nonDeductiblePercent));
  const nonDeductibleVatMinor =
    nonDeductible > 0 ? Math.round((lineVatMinor * nonDeductible) / 100) : 0;

  return {
    unitNetMinor,
    unitGrossMinor,
    unitVatMinor,
    lineNetMinor,
    lineVatMinor,
    lineGrossMinor,
    supplierPayableMinor,
    reverseChargeVatMinor,
    nonDeductibleVatMinor,
  };
}

/** Riga del riepilogo IVA raggruppato per Codice (§10.2). */
export interface VatSummaryRow {
  readonly vatCodeId: string | null;
  readonly code: string;
  readonly ratePercent: number;
  readonly description: string;
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly grossMinor: number;
  readonly reverseChargeVatMinor: number;
  readonly nonDeductibleVatMinor: number;
}

export interface VatSummaryLineInput {
  readonly vatCodeId: string | null;
  readonly code: string;
  readonly ratePercent: number;
  readonly description: string;
  readonly lineNetMinor: number;
  readonly lineVatMinor: number;
  readonly lineGrossMinor: number;
  readonly reverseChargeVatMinor: number;
  readonly nonDeductibleVatMinor: number;
}

/** Aggrega le righe per Codice IVA (ordina per aliquota poi codice). */
export function buildVatSummary(lines: readonly VatSummaryLineInput[]): VatSummaryRow[] {
  const groups = new Map<string, VatSummaryRow>();
  for (const line of lines) {
    const key = line.vatCodeId ?? `legacy:${line.code}:${line.ratePercent}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        vatCodeId: line.vatCodeId,
        code: line.code,
        ratePercent: line.ratePercent,
        description: line.description,
        netMinor: line.lineNetMinor,
        vatMinor: line.lineVatMinor,
        grossMinor: line.lineGrossMinor,
        reverseChargeVatMinor: line.reverseChargeVatMinor,
        nonDeductibleVatMinor: line.nonDeductibleVatMinor,
      });
      continue;
    }
    groups.set(key, {
      ...current,
      netMinor: current.netMinor + line.lineNetMinor,
      vatMinor: current.vatMinor + line.lineVatMinor,
      grossMinor: current.grossMinor + line.lineGrossMinor,
      reverseChargeVatMinor: current.reverseChargeVatMinor + line.reverseChargeVatMinor,
      nonDeductibleVatMinor: current.nonDeductibleVatMinor + line.nonDeductibleVatMinor,
    });
  }
  return [...groups.values()].sort(
    (a, b) => a.ratePercent - b.ratePercent || a.code.localeCompare(b.code),
  );
}
