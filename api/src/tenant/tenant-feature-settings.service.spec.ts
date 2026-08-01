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
