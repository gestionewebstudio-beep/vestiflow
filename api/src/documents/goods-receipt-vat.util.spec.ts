import { DocumentType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { VatCodeWithNature } from '../vat/vat-codes.service';

import { computeGoodsReceiptLines, computeGoodsReceiptTotals } from './goods-receipt-vat.util';

/**
 * **Il costo unitario canonico dell'Arrivo merce conserva la coda dello
 * scorporo.**
 *
 * ⛔ Difetto corretto il 22/08/2026: si memorizzava `amounts.unitNetMinor`, che
 * `netFromGrossMinor` dichiara «la forma da MOSTRARE» — arrotondata al
 * centesimo. Giusta per ciò che si mostra, sbagliata per ciò che si conserva.
 *
 * ⚠️ Il difetto **non è universale**: colpisce il 18,0% dei prezzi ivati al 22%.
 * Un test sul solo 25,00 € NON lo vedrebbe — quel valore torna anche con
 * l'unitario arrotondato. È la ragione per cui il caso principale qui è 1,03 €.
 */
describe('computeGoodsReceiptLines — precisione del costo unitario', () => {
  const vatCode = (id: string, rate: number): VatCodeWithNature =>
    ({
      id,
      code: String(rate),
      ratePercent: rate,
      calculationMode: 'standard',
      vatAffectsSupplierTotal: true,
      nonDeductiblePercent: 0,
      nature: null,
    }) as unknown as VatCodeWithNature;

  const calcola = (opts: {
    grossMinor?: number;
    netMinor?: number;
    rate: number;
    quantity?: number;
    discountPercent?: number;
  }) => {
    const iva = vatCode('iva', opts.rate);
    const ivato = opts.grossMinor != null;
    return computeGoodsReceiptLines({
      lines: [
        {
          variantId: '11111111-1111-4111-8111-111111111111',
          description: 'Articolo',
          quantity: opts.quantity ?? 1,
          enteredUnitCostMinor: ivato ? opts.grossMinor : opts.netMinor,
          discountPercent: opts.discountPercent ?? 0,
          vatCodeId: 'iva',
        } as never,
      ],
      documentType: DocumentType.goods_receipt,
      costEntryMode: ivato ? 'vat_included' : 'vat_excluded',
      vatCodesById: new Map([['iva', iva]]),
      buildSnapshot: () => ({}) as never,
    });
  };

  /** Il netto canonico memorizzato, in unità minori. */
  const nettoCanonico = (righe: ReturnType<typeof calcola>) =>
    Number(righe[0]!.unitCostNet) * 100;

  describe('⛔ Ivato → Netto → Ivato torna allo stesso centesimo', () => {
    // 1,03 EUR e' il PRIMO caso in cui l'arrotondamento cambia davvero il
    // centesimo: netto esatto 0,844262, arrotondato 0,84, che rimoltiplicato
    // per 1,22 da' 1,02 — non 1,03.
    it('⭐ 1,03 € @22% — il caso che il difetto lo dimostra', () => {
      const netto = nettoCanonico(calcola({ grossMinor: 103, rate: 22 }));

      expect(netto).toBeCloseTo(84.4262, 4);
      expect(Math.round(netto * 1.22)).toBe(103);
      // ⛔ E il valore arrotondato NON tornerebbe: e' il difetto, inchiodato.
      expect(Math.round(Math.round(netto) * 1.22)).toBe(102);
    });

    it('25,00 € @22% — il caso di riferimento, che da solo non basterebbe', () => {
      const netto = nettoCanonico(calcola({ grossMinor: 2500, rate: 22 }));

      expect(netto).toBeCloseTo(2049.1803, 4);
      expect(Math.round(netto * 1.22)).toBe(2500);
    });

    for (const [rate, gross] of [
      [10, 103],
      [5, 103],
      [4, 103],
    ] as const) {
      it(`IVA ${rate}% — il giro torna`, () => {
        const netto = nettoCanonico(calcola({ grossMinor: gross, rate }));

        expect(Math.round(netto * (1 + rate / 100))).toBe(gross);
      });
    }

    it('quantità > 1 non cambia il costo UNITARIO', () => {
      const uno = nettoCanonico(calcola({ grossMinor: 103, rate: 22 }));
      const tre = nettoCanonico(calcola({ grossMinor: 103, rate: 22, quantity: 3 }));

      expect(tre).toBe(uno);
    });

    it('lo sconto di riga non cambia il costo UNITARIO', () => {
      const senza = nettoCanonico(calcola({ grossMinor: 103, rate: 22 }));
      const con = nettoCanonico(calcola({ grossMinor: 103, rate: 22, discountPercent: 7 }));

      // Lo sconto agisce sul totale di riga, non sul costo unitario digitato.
      expect(con).toBe(senza);
    });
  });

  describe('⭐ Netto → Ivato → Netto', () => {
    it('un netto digitato resta identico a se stesso', () => {
      const netto = nettoCanonico(calcola({ netMinor: 2049.1803, rate: 22 }));

      expect(netto).toBeCloseTo(2049.1803, 4);
    });

    it('e un netto intero non acquista code', () => {
      expect(nettoCanonico(calcola({ netMinor: 5000, rate: 22 }))).toBe(5000);
    });
  });

  describe('⛔ i totali NON cambiano: la correzione tocca solo l’unitario', () => {
    it('totale riga: resta quello della formula attuale', () => {
      // 3 pezzi da 25,00 ivati, sconto 7% → lordo riga 69,75 → imponibile 57,17
      const righe = calcola({ grossMinor: 2500, rate: 22, quantity: 3, discountPercent: 7 });

      expect(righe[0]!.lineTotalMinor).toBe(5717);
      expect(righe[0]!.lineVatTotalMinor).toBe(6975 - 5717);
    });

    it('⭐ totale documento = somma esatta dei totali riga', () => {
      const a = calcola({ grossMinor: 103, rate: 22 })[0]!;
      const b = calcola({ grossMinor: 2500, rate: 22, quantity: 3 })[0]!;

      const totali = computeGoodsReceiptTotals([a, b]);

      expect(totali.subtotalMinor).toBe(a.lineTotalMinor + b.lineTotalMinor);
      expect(totali.totalMinor).toBe(totali.subtotalMinor + totali.taxMinor);
    });
  });
});
