import { describe, expect, it } from 'vitest';

import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';

import {
  buildTenantClientExtendedFields,
  tenantClientExtendedDetailsMeta,
  tenantCompanyFromDto,
  type TenantCompany,
} from './tenant-company.model';

const baseCompany = (profile: Partial<TenantCompany['profile']> = {}): TenantCompany => ({
  name: 'Boutique Napoli',
  channelProfile: TenantChannelProfile.Shopify,
  storeName: 'Negozio principale',
  licensedLocationCount: 1,
  licensedLocationActiveCount: 1,
  locationSelectionLocked: false,
  locationSelectionChangeGranted: false,
  canChangeLicensedLocations: true,
  profile: {
    legalName: null,
    vatNumber: null,
    fiscalCode: null,
    phone: null,
    pec: null,
    sdiCode: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    countryCode: null,
    ...profile,
  },
});

describe('tenant-company.model extended fields', () => {
  it('buildTenantClientExtendedFields restituisce array vuoto senza dati extra', () => {
    expect(buildTenantClientExtendedFields(baseCompany())).toEqual([]);
  });

  it('buildTenantClientExtendedFields include solo campi valorizzati', () => {
    const fields = buildTenantClientExtendedFields(
      baseCompany({
        legalName: 'Boutique Napoli Srl',
        vatNumber: '12345678901',
        phone: '+39 081 0000000',
        addressLine1: 'Via Roma 1',
        city: 'Napoli',
        postalCode: '80100',
        province: 'NA',
        countryCode: 'IT',
      }),
    );

    expect(fields.map((field) => field.label)).toEqual([
      'Ragione sociale',
      'Partita IVA',
      'Indirizzo',
      'Telefono',
    ]);
  });

  it('tenantClientExtendedDetailsMeta pluralizza il conteggio', () => {
    expect(tenantClientExtendedDetailsMeta(0)).toBe('');
    expect(tenantClientExtendedDetailsMeta(1)).toBe('1 dato registrato');
    expect(tenantClientExtendedDetailsMeta(3)).toBe('3 dati registrati');
  });

  it('tenantCompanyFromDto mappa flag blocco selezione sedi', () => {
    const company = tenantCompanyFromDto({
      name: 'Cliente',
      channelProfile: TenantChannelProfile.Shopify,
      storeName: 'Negozio',
      licensedLocationCount: 2,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
      canChangeLicensedLocations: false,
      profile: baseCompany().profile,
    });

    expect(company.locationSelectionLocked).toBe(true);
    expect(company.canChangeLicensedLocations).toBe(false);
  });
});
