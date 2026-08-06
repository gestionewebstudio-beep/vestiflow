import { describe, expect, it } from 'vitest';

import type { TenderRow } from './store-sale-tender.util';
import {
  canConcludeTender,
  tenderChangeMinor,
  tenderHasCashShortfall,
  tenderPaidMinor,
  tenderRemainingMinor,
  tenderToPaymentsPayload,
} from './store-sale-tender.util';

function cash(amountMinor: number, tenderedMinor: number | null = null): TenderRow {
  return { method: 'cash', methodNote: '', amountMinor, tenderedMinor };
}

function card(amountMinor: number): TenderRow {
  return { method: 'card', methodNote: '', amountMinor, tenderedMinor: null };
}

function other(amountMinor: number, methodNote = ''): TenderRow {
  return { method: 'other', methodNote, amountMinor, tenderedMinor: null };
}

describe('store-sale-tender.util', () => {
  it('somma quote, residuo e quadratura', () => {
    const rows = [cash(1000), card(990)];
    expect(tenderPaidMinor(rows)).toBe(1990);
    expect(tenderRemainingMinor(1990, rows)).toBe(0);
    expect(tenderRemainingMinor(2500, rows)).toBe(510);
    // Quote oltre il totale: residuo negativo, non quadra.
    expect(tenderRemainingMinor(1500, rows)).toBe(-490);
  });

  it('resto: solo contanti consegnati oltre la quota', () => {
    expect(tenderChangeMinor([cash(1990, 2000)])).toBe(10);
    // Non digitato ⇒ nessun resto da mostrare.
    expect(tenderChangeMinor([cash(1990, null)])).toBe(0);
    // La carta non dà resto, qualunque cosa contenga la riga.
    expect(tenderChangeMinor([card(1990)])).toBe(0);
    expect(tenderChangeMinor([cash(1000, 1500), cash(500, 500)])).toBe(500);
  });

  it('contanti sotto quota: segnalati, e la vendita non è concludibile', () => {
    expect(tenderHasCashShortfall([cash(1990, 1000)])).toBe(true);
    expect(tenderHasCashShortfall([cash(1990, 1990)])).toBe(false);
    expect(tenderHasCashShortfall([cash(1990, null)])).toBe(false);
    expect(canConcludeTender(1990, [cash(1990, 1000)])).toBe(false);
  });

  it('concludibile solo con quote positive che coprono esattamente il totale', () => {
    expect(canConcludeTender(1990, [cash(1000), card(990)])).toBe(true);
    expect(canConcludeTender(1990, [cash(1000)])).toBe(false);
    expect(canConcludeTender(1990, [cash(2000)])).toBe(false);
    expect(canConcludeTender(1990, [])).toBe(false);
    expect(canConcludeTender(1990, [cash(0), card(1990)])).toBe(false);
  });

  it('totale zero (omaggio pieno): sempre concludibile, payload legacy senza quote', () => {
    expect(canConcludeTender(0, [])).toBe(true);
    expect(tenderToPaymentsPayload(0, [cash(0)])).toEqual({
      paymentMethod: 'cash',
      paymentMethodNote: undefined,
    });
    expect(tenderToPaymentsPayload(0, [other(0, ' Omaggio ')])).toEqual({
      paymentMethod: 'other',
      paymentMethodNote: 'Omaggio',
    });
    expect(tenderToPaymentsPayload(0, [])).toEqual({
      paymentMethod: 'cash',
      paymentMethodNote: undefined,
    });
  });

  it('payload: nota solo su «Altro», ricevuti solo sui contanti e mai sotto quota', () => {
    expect(tenderToPaymentsPayload(1990, [cash(1000, 2000), other(990, ' Assegno ')])).toEqual({
      payments: [
        { method: 'cash', methodNote: undefined, amountMinor: 1000, tenderedMinor: 2000 },
        { method: 'other', methodNote: 'Assegno', amountMinor: 990, tenderedMinor: undefined },
      ],
    });
    // Ricevuti sotto quota: non viaggiano (il server li rifiuterebbe).
    expect(tenderToPaymentsPayload(1990, [cash(1990, 1000)])).toEqual({
      payments: [
        { method: 'cash', methodNote: undefined, amountMinor: 1990, tenderedMinor: undefined },
      ],
    });
  });
});
