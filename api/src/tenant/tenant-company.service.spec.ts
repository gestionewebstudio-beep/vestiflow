import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantChannelProfile } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import type { LocationLicensingService } from '../inventory/location-licensing.service';
import { TenantCompanyService } from './tenant-company.service';

describe('TenantCompanyService', () => {
  const prisma = {
    tenant: {
      findUnique: vi.fn(),
    },
  };
  const locationLicensing = {
    getSummary: vi.fn().mockResolvedValue({
      licensedLocationCount: 2,
      licensedLocationActiveCount: 1,
    }),
  };

  let service: TenantCompanyService;

  beforeEach(() => {
    vi.clearAllMocks();
    locationLicensing.getSummary.mockResolvedValue({
      licensedLocationCount: 2,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: false,
      locationSelectionChangeGranted: false,
      canChangeLicensedLocations: true,
    });
    service = new TenantCompanyService(
      prisma as unknown as PrismaService,
      locationLicensing as unknown as LocationLicensingService,
    );
  });

  it('getCompany mappa anagrafica e negozio principale', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      name: 'Mimmo Test VF',
      channelProfile: TenantChannelProfile.shopify,
      legalName: 'Mimmo Test VF Srl',
      vatNumber: '12345678901',
      fiscalCode: null,
      phone: '+39 081 0000000',
      pec: 'pec@example.it',
      sdiCode: 'ABC1234',
      addressLine1: 'Via Roma 1',
      addressLine2: null,
      city: 'Napoli',
      province: 'NA',
      postalCode: '80100',
      countryCode: 'IT',
      stores: [{ name: 'Negozio principale' }],
    });

    await expect(service.getCompany('tenant-1')).resolves.toEqual({
      name: 'Mimmo Test VF',
      channelProfile: TenantChannelProfile.shopify,
      storeName: 'Negozio principale',
      licensedLocationCount: 2,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: false,
      locationSelectionChangeGranted: false,
      canChangeLicensedLocations: true,
      profile: {
        legalName: 'Mimmo Test VF Srl',
        vatNumber: '12345678901',
        fiscalCode: null,
        phone: '+39 081 0000000',
        pec: 'pec@example.it',
        sdiCode: 'ABC1234',
        addressLine1: 'Via Roma 1',
        addressLine2: null,
        city: 'Napoli',
        province: 'NA',
        postalCode: '80100',
        countryCode: 'IT',
      },
    });
  });

  it('getCompany fallisce se tenant assente', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.getCompany('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
