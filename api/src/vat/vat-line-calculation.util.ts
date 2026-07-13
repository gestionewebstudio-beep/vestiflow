import type { PurchaseCostEntryMode, VatCalculationMode } from '@prisma/client';

/**
 * Calcolo IVA riga (§11–§15): funzioni pure, denaro in unità minori intere.
 * Il costo unitario "entered" è espresso in unità minori così come digitato
 * (netto o ivato secondo la modalità); il netto canonico è il riferimento
 * per prezzi fornitore, storico costi e valorizzazione.
 */

/** Dati IVA necessari al calcolo (da VatCode o da snapshot). */
export interface VatComputationInput {
  readonly ratePercent: number;
  readonly nonDeductiblePercent: number;
  readonly calculationMode: VatCalculationMode;
  readonly vatAffectsSupplierTotal: boolean;
}

export interface VatLineAmounts {
  /** Costo unitario netto canonico in unità minori (prima dello sconto). */
  readonly unitNetMinor: number;
  /** Costo unitario lordo in unità minori (netto + IVA esposta). */
  readonly unitGrossMinor: number;
  /** IVA unitaria in unità minori. */
  readonly unitVatMinor: number;
  /** Imponibile riga (dopo sconto riga). */
  readonly lineNetMinor: number;
  /** IVA riga calcolata all'aliquota del codice. */
  readonly lineVatMinor: number;
  /** Totale lordo riga: netto + IVA solo se l'IVA è esposta in documento. */
  readonly lineGrossMinor: number;
  /** Importo riga dovuto al fornitore (netto + IVA solo se concorre). */
  readonly supplierPayableMinor: number;
  /** IVA reverse charge calcolata a parte (0 se non applicabile). */
  readonly reverseChargeVatMinor: number;
  /** Quota IVA indetraibile (informativa, non cambia il totale fornitore). */
  readonly nonDeductibleVatMinor: number;
}

/** L'IVA è esposta nel documento (concorre al lordo riga)? */
function vatIsExposed(mode: VatCalculationMode): boolean {
  return mode === 'standard' || mode === 'split_payment';
}

/**
 * In modalità costi ivati lo scorporo si applica solo se l'IVA è davvero
 * contenuta nel valore digitato (IVA esposta dal fornitore). Reverse charge,
 * esenti e fuori campo non espongono IVA: il valore digitato è già netto.
 */
export function entryIncludesVat(
  costEntryMode: PurchaseCostEntryMode,
  vat: VatComputationInput,
): boolean {
  return costEntryMode === 'vat_included' && vatIsExposed(vat.calculationMode) && vat.ratePercent > 0;
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

export interface ComputeVatLineParams {
  /** Costo unitario digitato, in unità minori (netto o ivato secondo mode). */
  readonly enteredUnitCostMinor: number;
  readonly costEntryMode: PurchaseCostEntryMode;
  readonly quantity: number;
  /** Sconto riga effettivo in percentuale (0-100). */
  readonly discountPercent: number;
  readonly vat: VatComputationInput;
}

/**
 * Calcola gli importi IVA di una riga secondo l'ordine §15:
 * costo unitario → sconto riga → netto/lordo → IVA → quantità → arrotondamento.
 *
 * Costi netti (§15.1): il netto digitato resta invariato, IVA e lordo derivati.
 * Costi ivati (§11.3/§13.2): il lordo digitato resta invariato, netto e IVA
 * scorporati dal totale riga lordo.
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
    // Il valore digitato è lordo: lo scorporo avviene sul totale riga per
    // minimizzare gli errori di arrotondamento (lordo riga invariato).
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
  const supplierPayableMinor =
    lineNetMinor + (vat.vatAffectsSupplierTotal ? lineVatMinor : 0);
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

/** Riga per il riepilogo IVA raggruppato per Codice (§10.2/§16). */
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
