import { describe, expect, it } from 'vitest';

import { mapCustomerApiRow } from './customer-api.mapper';

describe('mapCustomerApiRow', () => {
  it('mappa anagrafica con indirizzo', () => {
    const customer = mapCustomerApiRow({
      id: 'cust-1',
      tenantId: 'tenant-1',
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'mario@example.com',
      phone: '+39 333 1234567',
      notes: 'Cliente VIP',
      addressLine1: 'Via Roma 1',
      city: 'Milano',
      postalCode: '20100',
      countryCode: 'IT',
      shopifyCustomerId: 'gid://shopify/Customer/1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(customer.firstName).toBe('Mario');
    expect(customer.address).toEqual({
      line1: 'Via Roma 1',
      line2: undefined,
      city: 'Milano',
      province: undefined,
      postalCode: '20100',
      country: 'IT',
    });
    expect(customer.shopifyCustomerId).toBe('gid://shopify/Customer/1');
    expect(customer.source).toBe('shopify');
  });

  it('imposta origine gestionale senza shopifyCustomerId', () => {
    const customer = mapCustomerApiRow({
      id: 'cust-2',
      tenantId: 'tenant-1',
      firstName: 'Luigi',
      lastName: 'Verdi',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(customer.source).toBe('manual');
  });

  it('omette indirizzo se dati insufficienti', () => {
    const customer = mapCustomerApiRow({
      id: 'cust-3',
      tenantId: 'tenant-1',
      firstName: 'Luigi',
      lastName: 'Verdi',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(customer.address).toBeUndefined();
    expect(customer.email).toBeUndefined();
  });
});
