import { describe, expect, it } from 'vitest';

import { sdiPaymentMethodCode } from './sdi-payment.util';

describe('sdiPaymentMethodCode', () => {
  it('estrae il codice MP dal nome della PaymentOption di sistema', () => {
    expect(sdiPaymentMethodCode('Contanti (MP01)')).toBe('MP01');
    expect(sdiPaymentMethodCode('Bonifico (MP05)')).toBe('MP05');
    expect(sdiPaymentMethodCode('PagoPA (MP23)')).toBe('MP23');
  });

  it('tollera spazi in coda', () => {
    expect(sdiPaymentMethodCode('  Carta di pagamento (MP08)  ')).toBe('MP08');
  });

  it('restituisce null per voci senza codice o con codice fuori gamma', () => {
    expect(sdiPaymentMethodCode('Bonifico 30 gg')).toBeNull();
    expect(sdiPaymentMethodCode('cash')).toBeNull();
    expect(sdiPaymentMethodCode('Strana (MP24)')).toBeNull();
    expect(sdiPaymentMethodCode('Strana (MP00)')).toBeNull();
    expect(sdiPaymentMethodCode(null)).toBeNull();
    expect(sdiPaymentMethodCode(undefined)).toBeNull();
  });

  it('non estrae un codice che non sia in coda al nome', () => {
    expect(sdiPaymentMethodCode('(MP05) Bonifico')).toBeNull();
  });
});
