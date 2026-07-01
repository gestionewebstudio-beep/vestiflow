import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  const tenantId = 'tenant-1';

  const prisma = {
    supplier: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    supplierOrder: { count: vi.fn() },
    document: { count: vi.fn() },
    productVariant: { findFirst: vi.fn() },
    supplierVariantLink: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    product: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };

  let service: SuppliersService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    service = new SuppliersService(prisma as never);
  });

  it('getById lancia NotFoundException se assente', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create normalizza il nome', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    prisma.supplier.create.mockResolvedValue({ id: 'sup-1', name: 'Fornitore' });
    await service.create(tenantId, { name: '  Fornitore  ' });
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Fornitore' }),
      }),
    );
  });

  it('delete blocca se ci sono ordini collegati', async () => {
    prisma.supplier.findFirst.mockResolvedValue({ id: 'sup-1' });
    prisma.supplierOrder.count.mockResolvedValue(1);
    prisma.document.count.mockResolvedValue(0);
    await expect(service.delete(tenantId, 'sup-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
