import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { TenantFeatureSettingsService } from './tenant-feature-settings.service';

describe('TenantFeatureSettingsService', () => {
  const tenantId = 'tenant-1';
  const prisma = {
    tenantFeatureSettings: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
  };

  let service: TenantFeatureSettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TenantFeatureSettingsService(prisma as unknown as PrismaService);
  });

  it('getOrCreate crea defaults se mancante', async () => {
    prisma.tenantFeatureSettings.upsert.mockResolvedValue({
      tenantId,
      lotsEnabled: false,
      serialsEnabled: false,
      variantsEnabled: true,
      barcodeScannerEnabled: true,
      supplierOrdersEnabled: true,
      goodsReceiptEnabled: true,
      warehouseValuationEnabled: true,
      allowNegativeInventory: false,
      warnNegativeInventory: true,
      blockNegativeInventory: false,
      defaultUnitOfMeasure: 'pz',
    });

    await expect(service.getOrCreate(tenantId)).resolves.toMatchObject({
      lotsEnabled: false,
    });
    expect(prisma.tenantFeatureSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        create: expect.objectContaining({ tenantId, defaultUnitOfMeasure: 'pz' }),
      }),
    );
  });

  // §B3b-4: i tre listini si rinominano e si attivano da qui. Il nome `null`
  // non e' un nome vuoto — e' «torna a chiamarsi Listino N» — e va distinto dal
  // campo assente, che significa «non toccare».
  it('update rinomina e attiva i listini, e null riporta al nome di default', async () => {
    prisma.tenantFeatureSettings.upsert.mockResolvedValue({});
    prisma.tenantFeatureSettings.update.mockResolvedValue({
      tenantId,
      listino1Name: 'Ingrosso',
      listino1Active: true,
      listino2Name: null,
      listino2Active: true,
      listino3Name: null,
      listino3Active: false,
    });

    await expect(
      service.update(tenantId, {
        listino1Name: 'Ingrosso',
        listino2Name: null,
        listino2Active: true,
      }),
    ).resolves.toMatchObject({ listino1Name: 'Ingrosso', listino2Name: null, listino2Active: true });

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalledWith({
      where: { tenantId },
      data: { listino1Name: 'Ingrosso', listino2Name: null, listino2Active: true },
    });
  });

  it('update persiste i campi modificati', async () => {
    prisma.tenantFeatureSettings.upsert.mockResolvedValue({});
    prisma.tenantFeatureSettings.update.mockResolvedValue({
      tenantId,
      lotsEnabled: true,
      serialsEnabled: true,
      variantsEnabled: true,
      barcodeScannerEnabled: true,
      supplierOrdersEnabled: true,
      goodsReceiptEnabled: true,
      warehouseValuationEnabled: true,
      allowNegativeInventory: false,
      warnNegativeInventory: true,
      blockNegativeInventory: false,
      defaultUnitOfMeasure: 'kg',
    });

    await expect(
      service.update(tenantId, {
        lotsEnabled: true,
        serialsEnabled: true,
        defaultUnitOfMeasure: 'kg',
      }),
    ).resolves.toMatchObject({
      lotsEnabled: true,
      serialsEnabled: true,
      defaultUnitOfMeasure: 'kg',
    });

    expect(prisma.tenantFeatureSettings.update).toHaveBeenCalledWith({
      where: { tenantId },
      data: {
        lotsEnabled: true,
        serialsEnabled: true,
        defaultUnitOfMeasure: 'kg',
      },
    });
  });
});
