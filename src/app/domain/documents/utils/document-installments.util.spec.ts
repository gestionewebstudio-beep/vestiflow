import { describe, expect, it } from 'vitest';
import { NonNullableFormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';

import {
  buildInstallmentGroup,
  installmentAmountText,
  installmentsCoveredMinor,
  installmentsSettledMinor,
  rehydrateInstallments,
  serializeInstallments,
} from './document-installments.util';

function fb(): NonNullableFormBuilder {
  return TestBed.inject(NonNullableFormBuilder);
}

describe('document-installments.util', () => {
  describe('installmentAmountText', () => {
    it('usa la virgola e mantiene lo zero esplicito', () => {
      expect(installmentAmountText({ amountMinor: 12200, currencyCode: 'EUR' })).toBe('122,00');
      // Una rata a zero salvata deve rientrare «0,00»: vuota diventerebbe una
      // riga incompleta che blocca il salvataggio successivo.
      expect(installmentAmountText({ amountMinor: 0, currencyCode: 'EUR' })).toBe('0,00');
    });
  });

  describe('installmentsCoveredMinor / installmentsSettledMinor', () => {
    const values = [
      { dueDate: '2026-08-31', amountText: '61,00', settled: true, settledAt: '2026-08-31' },
      { dueDate: '2026-09-30', amountText: '61,00', settled: false, settledAt: '' },
      { dueDate: '', amountText: 'non-un-numero', settled: false, settledAt: '' },
    ];

    it('somma gli importi digitati ignorando il testo non numerico', () => {
      expect(installmentsCoveredMinor(values, 'EUR')).toBe(12200);
    });

    it('somma le sole rate saldate', () => {
      expect(installmentsSettledMinor(values, 'EUR')).toBe(6100);
    });
  });

  describe('serializeInstallments', () => {
    it('salta le righe vuote e serializza date ISO e unità minori', () => {
      const result = serializeInstallments(
        [
          { dueDate: '2026-08-31', amountText: '61,00', settled: true, settledAt: '2026-08-31' },
          { dueDate: '', amountText: '', settled: false, settledAt: '' },
        ],
        'EUR',
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.installments).toHaveLength(1);
        expect(result.installments[0]).toMatchObject({ amountMinor: 6100, settled: true });
        expect(result.installments[0]?.dueDate).toContain('2026-08-31');
      }
    });

    it('blocca la riga incompleta con un messaggio puntuale', () => {
      const senzaImporto = serializeInstallments(
        [{ dueDate: '2026-08-31', amountText: '', settled: false, settledAt: '' }],
        'EUR',
      );
      const senzaData = serializeInstallments(
        [{ dueDate: '', amountText: '61,00', settled: false, settledAt: '' }],
        'EUR',
      );

      expect(senzaImporto.ok).toBe(false);
      expect(senzaData.ok).toBe(false);
      if (!senzaImporto.ok) {
        expect(senzaImporto.message).toContain('Scadenza 1');
      }
    });
  });

  describe('buildInstallmentGroup / rehydrateInstallments', () => {
    it('ricostruisce il FormArray dalle rate del documento', () => {
      const builder = fb();
      const array = builder.array([buildInstallmentGroup(builder)]);

      rehydrateInstallments(builder, array, [
        {
          id: 'r1',
          position: 1,
          dueDate: '2026-08-31T00:00:00.000Z',
          amount: { amountMinor: 6100, currencyCode: 'EUR' },
          settled: true,
          settledAt: '2026-09-01T00:00:00.000Z',
        },
      ]);

      expect(array.length).toBe(1);
      expect(array.at(0)?.getRawValue()).toEqual({
        dueDate: '2026-08-31',
        amountText: '61,00',
        settled: true,
        settledAt: '2026-09-01',
      });
    });
  });
});
