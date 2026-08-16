import { describe, expect, it } from 'vitest';

import type { VatCodeWithNature } from '../vat/vat-codes.service';
import {
  cascadeDiscountMultiplier,
  computeManualOrderLines,
  computeManualOrderTotals,
  discountedUnitPriceMinor,
  isPersistableManualOrderLine,
} from './manual-sales-order.util';

function vatCode(overrides: Partial<VatCodeWithNature> = {}): VatCodeWithNature {
  return {
    id: 'vat-22',
    tenantId: 'tenant-1',
    code: '22',
    natureId: 'nat-1',
    ratePercent: 22,
    nonDeductiblePercent: 0,
    description: 'IVA 22%',
    notes: null,
    usageScope: 'both',
    calculationMode: 'standard',
    vatAffectsSupplierTotal: true,
    isDefault: true,
    isActive: true,
    isSystem: false,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    nature: {
      id: 'nat-1',
      key: 'TAXABLE',
      officialCode: null,
      label: 'Imponibile',
      description: null,
      defaultUsageScope: 'both',
      defaultCalculationMode: 'standard',
      sortOrder: 0,
      isSystem: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    ...overrides,
  } as VatCodeWithNature;
}

describe('cascadeDiscountMultiplier', () => {
  it('sconto singolo: "10%" → 0.9', () => {
    expect(cascadeDiscountMultiplier('10%')).toBeCloseTo(0.9, 10);
  });

  it('cascata "4+10%": sequenza sul residuo, NON 14% totale', () => {
    // 0.96 × 0.90 = 0.864 → sconto effettivo 13,6%, mai arrotondato a 14%.
    expect(cascadeDiscountMultiplier('4+10%')).toBeCloseTo(0.864, 10);
  });

  it('cascata a tre livelli "2+5+8%"', () => {
    expect(cascadeDiscountMultiplier('2+5+8%')).toBeCloseTo(0.98 * 0.95 * 0.92, 10);
  });

  it('accetta decimali con virgola e ignora valori fuori range', () => {
    expect(cascadeDiscountMultiplier('2,5%')).toBeCloseTo(0.975, 10);
    expect(cascadeDiscountMultiplier('150%')).toBe(1);
    expect(cascadeDiscountMultiplier('abc')).toBe(1);
  });

  it('vuoto o null: nessuno sconto', () => {
    expect(cascadeDiscountMultiplier('')).toBe(1);
    expect(cascadeDiscountMultiplier(null)).toBe(1);
    expect(cascadeDiscountMultiplier(undefined)).toBe(1);
  });
});

describe('discountedUnitPriceMinor', () => {
  it('applica la cascata esatta e arrotonda al centesimo', () => {
    // 100,00 € con 4+10% → 86,40 €
    expect(discountedUnitPriceMinor(10000, '4+10%')).toBe(8640);
  });

  it('prezzo zero resta zero', () => {
    expect(discountedUnitPriceMinor(0, '10%')).toBe(0);
  });
});

describe('computeManualOrderLines / computeManualOrderTotals', () => {
  it('totale riga = quantità × prezzo scontato (senza IVA), IVA da snapshot', () => {
    const vatCodesById = new Map([['vat-22', vatCode()]]);
    const lines = computeManualOrderLines(
      [
        {
          variantId: 'var-1',
          sku: 'SKU-1',
          title: 'T-shirt',
          quantity: 3,
          unitPriceMinor: 10000,
          discount: '4+10%',
          vatCodeId: 'vat-22',
          commitsStock: true,
        },
      ],
      vatCodesById,
    );

    expect(lines[0]!.totalMinor).toBe(3 * 8640);
    expect(lines[0]!.lineVatTotalMinor).toBe(Math.round((3 * 8640 * 22) / 100));
    expect(lines[0]!.vatSnapshot).toMatchObject({ code: '22', ratePercent: 22 });

    const totals = computeManualOrderTotals(lines);
    expect(totals.subtotalMinor).toBe(25920);
    expect(totals.taxMinor).toBe(5702);
    expect(totals.totalMinor).toBe(25920 + 5702);
    // Sconto complessivo = lordo (30000) − imponibile scontato (25920).
    expect(totals.discountMinor).toBe(4080);
  });

  it('IVA non standard (reverse charge / informational) non concorre al totale', () => {
    const vatCodesById = new Map([
      ['vat-rc', vatCode({ id: 'vat-rc', calculationMode: 'reverse_charge' })],
    ]);
    const lines = computeManualOrderLines(
      [
        {
          title: 'Servizio sartoria',
          quantity: 1,
          unitPriceMinor: 5000,
          vatCodeId: 'vat-rc',
          commitsStock: false,
        },
      ],
      vatCodesById,
    );
    expect(lines[0]!.lineVatTotalMinor).toBe(0);
  });

  it('riga senza sconto: prezzo pieno', () => {
    const lines = computeManualOrderLines(
      [{ title: 'Cintura', quantity: 2, unitPriceMinor: 1500 }],
      new Map(),
    );
    expect(lines[0]!.totalMinor).toBe(3000);
    expect(lines[0]!.discount).toBeNull();
  });

  it('sconto extra documento: imponibile ridotto e IVA ricalcolata (come Arrivo merce)', () => {
    const vatCodesById = new Map([['vat-22', vatCode()]]);
    const lines = computeManualOrderLines(
      [
        {
          variantId: 'var-1',
          sku: 'SKU-1',
          title: 'T-shirt',
          quantity: 2,
          unitPriceMinor: 10000,
          vatCodeId: 'vat-22',
        },
      ],
      vatCodesById,
    );

    // Imponibile righe 200,00 € − 10% documento = 180,00 €; IVA 22% su 180.
    const totals = computeManualOrderTotals(lines, 10);
    expect(totals.subtotalMinor).toBe(18000);
    expect(totals.taxMinor).toBe(Math.round((18000 * 22) / 100));
    expect(totals.totalMinor).toBe(18000 + 3960);
    expect(totals.discountMinor).toBe(2000);
  });

  it('senza righe: totali a zero anche con sconto documento', () => {
    const totals = computeManualOrderTotals([], 15);
    expect(totals).toEqual({ subtotalMinor: 0, taxMinor: 0, totalMinor: 0, discountMinor: 0 });
  });
});

/**
 * Sei decimali sul prezzo unitario — dal 16/08/2026.
 *
 * La colonna era `integer`, quindi il netto di un prezzo digitato ivato veniva
 * troncato e non tornava più: 25,00 al 22% valgono 2049,180328 centesimi netti,
 * e 2049 tondi rimostrati ivati fanno 24,99. Succede a un prezzo ivato su
 * cinque, non è il caso raro da manuale.
 */
describe('coda decimale del prezzo unitario', () => {
  it('lo sconto NON arrotonda il prezzo unitario: arrotonda il totale di riga', () => {
    // 3 pezzi da 33,33 scontati del 7%: il conto esatto è 92,9907 → 92,99.
    // Arrotondando PRIMA il prezzo unitario (30,9969 → 31,00) uscivano 93,00,
    // un centesimo che il cliente non doveva.
    const vatCodesById = new Map([['vat-22', vatCode()]]);
    const lines = computeManualOrderLines(
      [{ title: 'Articolo', quantity: 3, unitPriceMinor: 3333, discount: '7%' }],
      vatCodesById,
    );

    expect(discountedUnitPriceMinor(3333, '7%')).toBe(3099.69);
    expect(lines[0]!.totalMinor).toBe(9299);
    expect(lines[0]!.totalMinor).not.toBe(3 * 3100);
  });

  it('il netto con la coda decimale arriva intatto sulla riga', () => {
    const lines = computeManualOrderLines(
      [{ title: 'Articolo', quantity: 1, unitPriceMinor: 2049.180328 }],
      new Map(),
    );

    // Prima veniva troncato a 2049 da `Math.trunc`.
    expect(lines[0]!.unitPriceMinor).toBe(2049.1803);
  });

  it('la coda oltre le quattro cifre di centesimo si taglia: è rumore del float', () => {
    // La colonna è numeric(16,6) — sei decimali di euro. Oltre lì non c'è
    // precisione: 25 / 1,22 in binario non finisce mai, e il database
    // rifiuterebbe la scala.
    const lines = computeManualOrderLines(
      [{ title: 'Articolo', quantity: 1, unitPriceMinor: 2049.18032786885 }],
      new Map(),
    );

    expect(lines[0]!.unitPriceMinor).toBe(2049.1803);
  });

  it('un prezzo intero resta esattamente com’era: lo storico non si muove', () => {
    const vatCodesById = new Map([['vat-22', vatCode()]]);
    const lines = computeManualOrderLines(
      [{ title: 'Articolo', quantity: 3, unitPriceMinor: 3500, vatCodeId: 'vat-22' }],
      vatCodesById,
    );

    expect(lines[0]!.unitPriceMinor).toBe(3500);
    expect(lines[0]!.totalMinor).toBe(10500);
    expect(lines[0]!.lineVatTotalMinor).toBe(2310);
  });

  it('netto con coda: imponibile e imposta fanno tornare il lordo digitato', () => {
    const vatCodesById = new Map([['vat-22', vatCode()]]);
    const lines = computeManualOrderLines(
      [{ title: 'Articolo', quantity: 1, unitPriceMinor: 2049.180328, vatCodeId: 'vat-22' }],
      vatCodesById,
    );
    const totals = computeManualOrderTotals(lines);

    // 25,00 € digitati ivati devono tornare 25,00 € di totale documento.
    expect(totals.totalMinor).toBe(2500);
    expect(totals.subtotalMinor).toBe(2049);
    expect(totals.taxMinor).toBe(451);
  });
});

describe('isPersistableManualOrderLine', () => {
  it('riga valida: prodotto + quantità > 0', () => {
    expect(
      isPersistableManualOrderLine({ variantId: 'var-1', title: 'X', quantity: 1 }),
    ).toBe(true);
  });

  it('quantità 0 o senza prodotto: non salvabile (regola Arrivo merce)', () => {
    expect(isPersistableManualOrderLine({ variantId: 'var-1', title: 'X', quantity: 0 })).toBe(
      false,
    );
    expect(isPersistableManualOrderLine({ title: '   ', quantity: 5 })).toBe(false);
  });
});
