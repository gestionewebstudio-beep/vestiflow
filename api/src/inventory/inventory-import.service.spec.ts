import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { InventoryService } from './inventory.service';
import type { PrismaService } from '../prisma/prisma.service';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { InventoryImportService } from './inventory-import.service';

const SAMPLE_CSV = `SKU,Location,Disponibile,Soglia minima
SKU-RED-M,Napoli,10,2
UNKNOWN-SKU,Milano,5,
`;

describe('InventoryImportService', () => {
  const ownerUser = testOwnerUser();
  function createService(options: {
    variants?: Array<{
      id: string;
      sku: string;
      optionValues: Record<string, string>;
      product: { name: string };
    }>;
    locations?: Array<{ id: string; name: string }>;
    levels?: Array<{ variantId: string; locationId: string; available: number }>;
  } = {}) {
    const {
      variants = [
        {
          id: 'var-1',
          sku: 'SKU-RED-M',
          optionValues: { Taglia: 'M' },
          product: { name: 'Maglietta' },
        },
      ],
      locations = [
        { id: 'loc-1', name: 'Napoli' },
        { id: 'loc-2', name: 'Milano' },
      ],
      levels = [{ variantId: 'var-1', locationId: 'loc-1', available: 8 }],
    } = options;

    const prisma = {
      productVariant: { findMany: vi.fn().mockResolvedValue(variants) },
      location: { findMany: vi.fn().mockResolvedValue(locations) },
      inventoryLevel: { findMany: vi.fn().mockResolvedValue(levels) },
      inventoryLevelUpdateMany: vi.fn(),
    };

    const inventory = {
      registerMovement: vi.fn(),
    };

    const service = new InventoryImportService(
      prisma as unknown as PrismaService,
      inventory as unknown as InventoryService,
    );

    return { service, prisma, inventory };
  }

  it('previewCsv restituisce righe pronte e con errori', async () => {
    const { service } = createService();

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.total).toBe(2);
    expect(preview.summary.ready).toBe(1);
    expect(preview.summary.errors).toBe(1);
    expect(preview.rows[0]).toMatchObject({
      sku: 'SKU-RED-M',
      locationName: 'Napoli',
      currentAvailable: 8,
      newAvailable: 10,
      delta: 2,
      status: 'ready',
    });
    expect(preview.rows[1]?.status).toBe('error');
  });

  it('previewCsv segna riga invariata se quantità uguale', async () => {
    const { service } = createService({
      levels: [{ variantId: 'var-1', locationId: 'loc-1', available: 10 }],
    });

    const csv = `SKU,Location,Disponibile\nSKU-RED-M,Napoli,10\n`;
    const preview = await service.previewCsv('tenant-1', csv);

    expect(preview.summary.unchanged).toBe(1);
    expect(preview.rows[0]?.status).toBe('unchanged');
  });

  it('previewCsv rifiuta CSV non valido', async () => {
    const { service } = createService();

    await expect(service.previewCsv('tenant-1', 'SKU,Disponibile\nx,1\n')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('importCsv applica righe pronte via inventory service', async () => {
    const { service, inventory } = createService({
      levels: [{ variantId: 'var-1', locationId: 'loc-1', available: 8 }],
    });

    const csv = `SKU,Location,Disponibile\nSKU-RED-M,Napoli,10\n`;
    const result = await service.importCsv('tenant-1', csv, ownerUser);

    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
    expect(inventory.registerMovement).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        type: 'adjustment',
        variantId: 'var-1',
        locationId: 'loc-1',
        quantity: 2,
      }),
      'Import CSV',
      undefined,
      ownerUser,
    );
  });
});
