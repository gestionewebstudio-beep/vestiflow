import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { CompanyProfileService } from './company-profile.service';

const EMPTY_FIELDS = {
  legalName: null,
  vatNumber: null,
  fiscalCode: null,
  phone: null,
  pec: null,
  sdiCode: null,
  iban: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  province: null,
  postalCode: null,
  countryCode: null,
};

describe('CompanyProfileService', () => {
  const prisma = {
    companyProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
  };

  let service: CompanyProfileService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CompanyProfileService(prisma as unknown as PrismaService);
  });

  it('profilo mai compilato: `null`, non un oggetto vuoto', async () => {
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue({ ...EMPTY_FIELDS, name: 'Boutique Demo' });

    const result = await service.get('tenant-1');

    // La maschera distingue «non ancora compilata» da «compilata e vuota»:
    // nella prima offre di precompilare, nella seconda no.
    expect(result.profile).toBeNull();
  });

  it('i dati di attivazione tornano come precompilazione, non come profilo', async () => {
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue({
      ...EMPTY_FIELDS,
      name: 'Boutique Demo',
      legalName: 'Boutique Demo Srl',
      vatNumber: '12345678901',
      city: 'Napoli',
    });

    const result = await service.get('tenant-1');

    expect(result.activationDefaults.legalName).toBe('Boutique Demo Srl');
    expect(result.activationDefaults.vatNumber).toBe('12345678901');
    expect(result.profile).toBeNull();
  });

  it('senza ragione sociale di attivazione propone il nome del cliente', async () => {
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue({ ...EMPTY_FIELDS, name: 'Boutique Demo' });

    const result = await service.get('tenant-1');

    expect(result.activationDefaults.legalName).toBe('Boutique Demo');
  });

  it('le due anagrafiche restano distinte: il profilo salvato vince', async () => {
    prisma.companyProfile.findUnique.mockResolvedValue({
      ...EMPTY_FIELDS,
      legalName: 'Altra Azienda Srl',
      vatNumber: '98765432109',
    });
    prisma.tenant.findUnique.mockResolvedValue({
      ...EMPTY_FIELDS,
      name: 'Boutique Demo',
      legalName: 'Boutique Demo Srl',
      vatNumber: '12345678901',
    });

    const result = await service.get('tenant-1');

    expect(result.profile?.legalName).toBe('Altra Azienda Srl');
    expect(result.profile?.vatNumber).toBe('98765432109');
    expect(result.activationDefaults.vatNumber).toBe('12345678901');
  });

  it('get fallisce se il tenant non esiste', async () => {
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update azzera i campi assenti dal body (sostituzione, non merge)', async () => {
    prisma.companyProfile.upsert.mockResolvedValue({});
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue({ ...EMPTY_FIELDS, name: 'Boutique Demo' });

    await service.update('tenant-1', { legalName: 'Solo Ragione Sociale Srl' });

    const call = prisma.companyProfile.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(call.update['legalName']).toBe('Solo Ragione Sociale Srl');
    // Senza questo, svuotare un campo dalla maschera sarebbe impossibile.
    expect(call.update['iban']).toBeNull();
    expect(call.update['city']).toBeNull();
  });

  it('con un indirizzo e nessuna nazione mette IT', async () => {
    prisma.companyProfile.upsert.mockResolvedValue({});
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue({ ...EMPTY_FIELDS, name: 'Boutique Demo' });

    await service.update('tenant-1', { addressLine1: 'Via Roma 1' });

    const call = prisma.companyProfile.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(call.update['countryCode']).toBe('IT');
  });

  it('senza indirizzo non inventa la nazione', async () => {
    prisma.companyProfile.upsert.mockResolvedValue({});
    prisma.companyProfile.findUnique.mockResolvedValue(null);
    prisma.tenant.findUnique.mockResolvedValue({ ...EMPTY_FIELDS, name: 'Boutique Demo' });

    await service.update('tenant-1', { legalName: 'Boutique Demo Srl' });

    const call = prisma.companyProfile.upsert.mock.calls[0]?.[0] as {
      update: Record<string, unknown>;
    };
    expect(call.update['countryCode']).toBeNull();
  });
});
