import { describe, expect, it } from 'vitest';

import {
  buildVatSummary,
  computeVatLineAmounts,
  entryIncludesVat,
  grossFromNetMinor,
  netFromGrossMinor,
  vatInputFromLegacyRate,
  type VatComputationInput,
} from './goods-receipt-vat.util';

const standard22: VatComputationInput = {
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
};

const standard10: VatComputationInput = { ...standard22, ratePercent: 10 };

const reverseCharge22: VatComputationInput = {
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'reverse_charge',
  vatAffectsSupplierTotal: false,
};

const exempt: VatComputationInput = {
  ratePercent: 0,
  nonDeductiblePercent: 0,
  calculationMode: 'zero_rate',
  vatAffectsSupplierTotal: false,
};

describe('netFromGrossMinor / grossFromNetMinor', () => {
  it('scorpora il 22% da 122,00', () => {
    expect(netFromGrossMinor(12200, 22)).toBe(10000);
  });

  it('aggiunge il 22% a 100,00', () => {
    expect(grossFromNetMinor(10000, 22)).toBe(12200);
  });

  it('con aliquota 0 il valore resta invariato', () => {
    expect(netFromGrossMinor(12200, 0)).toBe(12200);
    expect(grossFromNetMinor(10000, 0)).toBe(10000);
  });
});

describe('entryIncludesVat', () => {
  it('vale solo con costi ivati, IVA esposta e aliquota > 0', () => {
    expect(entryIncludesVat('vat_included', standard22)).toBe(true);
    expect(entryIncludesVat('vat_excluded', standard22)).toBe(false);
    expect(entryIncludesVat('vat_included', reverseCharge22)).toBe(false);
    expect(entryIncludesVat('vat_included', exempt)).toBe(false);
  });
});

describe('computeVatLineAmounts — costi netti (§11.2, §15.1)', () => {
  it('100,00 × 1 al 22%: imponibile 100, IVA 22, totale 122', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_excluded',
      quantity: 1,
      discountPercent: 0,
      vat: standard22,
    });
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.lineGrossMinor).toBe(12200);
    expect(amounts.supplierPayableMinor).toBe(12200);
  });

  it("applica lo sconto riga prima dell'IVA", () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_excluded',
      quantity: 2,
      discountPercent: 10,
      vat: standard22,
    });
    expect(amounts.lineNetMinor).toBe(18000);
    expect(amounts.lineVatMinor).toBe(3960);
  });
});

describe('computeVatLineAmounts — costi ivati (§11.3, §13.2)', () => {
  it('122,00 × 1 al 22%: imponibile 100, IVA 22, lordo invariato', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 12200,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: standard22,
    });
    expect(amounts.unitNetMinor).toBe(10000);
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.lineGrossMinor).toBe(12200);
  });

  it('cambio IVA da 10% a 22% su costo ivato 110,00 (§13.2)', () => {
    const before = computeVatLineAmounts({
      enteredUnitCostMinor: 11000,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: standard10,
    });
    expect(before.lineNetMinor).toBe(10000);
    expect(before.lineVatMinor).toBe(1000);

    const after = computeVatLineAmounts({
      enteredUnitCostMinor: 11000,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: standard22,
    });
    expect(after.lineGrossMinor).toBe(11000);
    expect(after.lineNetMinor).toBe(9016);
    expect(after.lineVatMinor).toBe(1984);
  });

  it('reverse charge in costi ivati: il valore digitato è già netto', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_included',
      quantity: 1,
      discountPercent: 0,
      vat: reverseCharge22,
    });
    expect(amounts.lineNetMinor).toBe(10000);
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.lineGrossMinor).toBe(10000);
    expect(amounts.supplierPayableMinor).toBe(10000);
    expect(amounts.reverseChargeVatMinor).toBe(2200);
  });
});

describe('computeVatLineAmounts — indetraibile (§3.3)', () => {
  it('calcola la quota IVA indetraibile senza cambiare il totale fornitore', () => {
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: 10000,
      costEntryMode: 'vat_excluded',
      quantity: 1,
      discountPercent: 0,
      vat: { ...standard22, nonDeductiblePercent: 50 },
    });
    expect(amounts.lineVatMinor).toBe(2200);
    expect(amounts.nonDeductibleVatMinor).toBe(1100);
    expect(amounts.supplierPayableMinor).toBe(12200);
  });
});

describe('vatInputFromLegacyRate', () => {
  it('aliquota legacy > 0: standard che concorre al totale', () => {
    const vat = vatInputFromLegacyRate(22);
    expect(vat.calculationMode).toBe('standard');
    expect(vat.vatAffectsSupplierTotal).toBe(true);
  });

  it('aliquota legacy 0 o assente: non concorre al totale', () => {
    expect(vatInputFromLegacyRate(0).vatAffectsSupplierTotal).toBe(false);
    expect(vatInputFromLegacyRate(null).vatAffectsSupplierTotal).toBe(false);
  });
});

describe('buildVatSummary', () => {
  it('raggruppa per Codice IVA e ordina per aliquota', () => {
    const summary = buildVatSummary([
      {
        vatCodeId: 'id-22',
        code: '22',
        ratePercent: 22,
        description: 'Imponibile 22%',
        lineNetMinor: 10000,
        lineVatMinor: 2200,
        lineGrossMinor: 12200,
        reverseChargeVatMinor: 0,
        nonDeductibleVatMinor: 0,
      },
      {
        vatCodeId: 'id-10',
        code: '10',
        ratePercent: 10,
        description: 'Imponibile 10%',
        lineNetMinor: 5000,
        lineVatMinor: 500,
        lineGrossMinor: 5500,
        reverseChargeVatMinor: 0,
        nonDeductibleVatMinor: 0,
      },
      {
        vatCodeId: 'id-22',
        code: '22',
        ratePercent: 22,
        description: 'Imponibile 22%',
        lineNetMinor: 2000,
        lineVatMinor: 440,
        lineGrossMinor: 2440,
        reverseChargeVatMinor: 0,
        nonDeductibleVatMinor: 0,
      },
    ]);
    expect(summary).toHaveLength(2);
    expect(summary[0]?.code).toBe('10');
    expect(summary[1]?.netMinor).toBe(12000);
    expect(summary[1]?.vatMinor).toBe(2640);
  });
});
