import 'reflect-metadata';

import { describe, expect, it } from 'vitest';

import {
  locationAddressFromProfile,
  tenantProfileCreateData,
  tenantProfileReplaceData,
} from './tenant-profile.util';

describe('tenant-profile.util', () => {
  const profile = {
    legalName: 'ACME Srl',
    vatNumber: 'IT12345678901',
    addressLine1: 'Via Roma 1',
    city: 'Milano',
    postalCode: '20100',
  };

  describe('tenantProfileCreateData', () => {
    it('imposta countryCode IT se c e indirizzo', () => {
      const data = tenantProfileCreateData(profile);
      expect(data.legalName).toBe('ACME Srl');
      expect(data.countryCode).toBe('IT');
    });

    it('countryCode null senza indirizzo', () => {
      const data = tenantProfileCreateData({ legalName: 'Solo nome' });
      expect(data.countryCode).toBeNull();
    });

    it('rispetta countryCode esplicito', () => {
      const data = tenantProfileCreateData({ ...profile, countryCode: 'FR' });
      expect(data.countryCode).toBe('FR');
    });
  });

  describe('tenantProfileReplaceData', () => {
    it('countryCode IT solo con addressLine1 valorizzato', () => {
      const data = tenantProfileReplaceData({ addressLine1: '  Via Test  ' });
      expect(data.countryCode).toBe('IT');
    });

    it('countryCode null senza indirizzo significativo', () => {
      const data = tenantProfileReplaceData({ city: 'Milano' });
      expect(data.countryCode).toBeNull();
    });
  });

  describe('locationAddressFromProfile', () => {
    it('allinea indirizzo location al profilo tenant', () => {
      const address = locationAddressFromProfile(profile);
      expect(address).toEqual({
        addressLine1: 'Via Roma 1',
        addressLine2: null,
        city: 'Milano',
        province: null,
        postalCode: '20100',
        countryCode: 'IT',
      });
    });
  });
});
