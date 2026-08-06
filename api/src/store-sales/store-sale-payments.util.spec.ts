import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { resolveStoreSalePayments } from './store-sale-payments.util';

describe('resolveStoreSalePayments', () => {
  it('legacy a metodo unico: una riga che copre l’intero totale', () => {
    const resolved = resolveStoreSalePayments({ paymentMethod: 'cash' }, 1990);
    expect(resolved.rows).toEqual([
      { position: 1, method: 'cash', methodNote: null, amountMinor: 1990, tenderedMinor: null },
    ]);
    expect(resolved.documentMethod).toBe('cash');
    expect(resolved.documentMethodNote).toBeNull();
  });

  it('legacy «Altro»: la nota viaggia sul documento, ripulita', () => {
    const resolved = resolveStoreSalePayments(
      { paymentMethod: 'other', paymentMethodNote: '  Assegno  ' },
      500,
    );
    expect(resolved.rows[0]?.methodNote).toBe('Assegno');
    expect(resolved.documentMethod).toBe('other');
    expect(resolved.documentMethodNote).toBe('Assegno');
  });

  it('multi-tender: somma esatta, riepilogo `mixed` con sintesi leggibile', () => {
    const resolved = resolveStoreSalePayments(
      {
        payments: [
          { method: 'cash', amountMinor: 1000, tenderedMinor: 2000 },
          { method: 'card', amountMinor: 990 },
        ],
      },
      1990,
    );
    expect(resolved.rows).toEqual([
      { position: 1, method: 'cash', methodNote: null, amountMinor: 1000, tenderedMinor: 2000 },
      { position: 2, method: 'card', methodNote: null, amountMinor: 990, tenderedMinor: null },
    ]);
    expect(resolved.documentMethod).toBe('mixed');
    expect(resolved.documentMethodNote).toBe('Contanti 10,00 € + Carta 9,90 €');
  });

  it('la sintesi del misto include la descrizione di «Altro»', () => {
    const resolved = resolveStoreSalePayments(
      {
        payments: [
          { method: 'card', amountMinor: 1490 },
          { method: 'other', methodNote: 'Buono regalo', amountMinor: 500 },
        ],
      },
      1990,
    );
    expect(resolved.documentMethodNote).toBe('Carta 14,90 € + Altro (Buono regalo) 5,00 €');
  });

  it('somma diversa dal totale: rifiutata prima di scrivere qualsiasi cosa', () => {
    expect(() =>
      resolveStoreSalePayments(
        { payments: [{ method: 'cash', amountMinor: 1000 }] },
        1990,
      ),
    ).toThrowError(BadRequestException);
    expect(() =>
      resolveStoreSalePayments(
        { payments: [{ method: 'cash', amountMinor: 1000 }] },
        1990,
      ),
    ).toThrowError('La somma dei pagamenti (10,00 €) non corrisponde al totale della vendita (19,90 €).');
  });

  it('contanti ricevuti sotto la quota da incassare: rifiutati (il resto non può essere negativo)', () => {
    expect(() =>
      resolveStoreSalePayments(
        { payments: [{ method: 'cash', amountMinor: 1990, tenderedMinor: 1000 }] },
        1990,
      ),
    ).toThrowError('Contanti ricevuti (10,00 €) inferiori alla quota da incassare (19,90 €).');
  });

  it('«ricevuti» ha senso solo sui contanti: sulla carta viene ignorato', () => {
    const resolved = resolveStoreSalePayments(
      { payments: [{ method: 'card', amountMinor: 1990, tenderedMinor: 5000 }] },
      1990,
    );
    expect(resolved.rows[0]?.tenderedMinor).toBeNull();
  });

  it('la nota è solo di «Altro»: su contanti e carta viene scartata', () => {
    const resolved = resolveStoreSalePayments(
      { payments: [{ method: 'cash', methodNote: 'appunto', amountMinor: 1990 }] },
      1990,
    );
    expect(resolved.rows[0]?.methodNote).toBeNull();
  });

  it('nessuna informazione di pagamento: errore esplicito', () => {
    expect(() => resolveStoreSalePayments({}, 1990)).toThrowError(
      'Indicare il pagamento della vendita.',
    );
  });

  it('totale zero (omaggio pieno): nessuna riga, resta il metodo di riepilogo', () => {
    const resolved = resolveStoreSalePayments({ paymentMethod: 'cash' }, 0);
    expect(resolved.rows).toEqual([]);
    expect(resolved.documentMethod).toBe('cash');
    expect(resolved.documentMethodNote).toBeNull();
  });
});
