import { describe, expect, it } from 'vitest';

import { mapSupplierFormToInput } from './supplier-form.util';

describe('mapSupplierFormToInput', () => {
  it('mappa tutti i campi anagrafici e omette stringhe vuote', () => {
    expect(
      mapSupplierFormToInput({
        code: ' F01 ',
        name: 'Fornitore Test S.r.l.',
        vatNumber: '12345678901',
        taxCode: '',
        email: 'ordini@test.it',
        pec: '',
        phone: '+39 02 1234567',
        contactName: 'Mario Rossi',
        website: 'https://example.it',
        addressLine1: 'Via Roma 1',
        addressLine2: 'Interno 3',
        city: 'Milano',
        province: 'MI',
        postalCode: '20100',
        countryCode: 'IT',
        paymentTerms: '30 gg',
        supplierDiscount: ' 10 ',
        transportResponsible: '',
        freightTerms: ' Franco ',
        documentCreationNote: '',
        notes: 'Note interne',
        alsoCustomer: true,
      }),
    ).toEqual({
      code: 'F01',
      name: 'Fornitore Test S.r.l.',
      vatNumber: '12345678901',
      email: 'ordini@test.it',
      phone: '+39 02 1234567',
      contactName: 'Mario Rossi',
      website: 'https://example.it',
      addressLine1: 'Via Roma 1',
      addressLine2: 'Interno 3',
      city: 'Milano',
      province: 'MI',
      postalCode: '20100',
      countryCode: 'IT',
      paymentTerms: '30 gg',
      supplierDiscount: '10',
      freightTerms: 'Franco',
      notes: 'Note interne',
      alsoCustomer: true,
    });
  });
});
