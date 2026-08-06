import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const tenantId = 'tenant-1';

  function customerRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'cust-1',
      tenantId,
      partyId: 'party-1',
      code: '0001',
      isActive: true,
      customerDiscount: null,
      paymentMethod: null,
      paymentTerms: null,
      transportResponsible: null,
      documentCreationAlert: null,
      documentCreationNote: null,
      commercialNotes: null,
      shopifyCustomerId: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      party: {
        id: 'party-1',
        tenantId,
        companyName: null,
        firstName: 'Mario',
        lastName: 'Rossi',
        vatNumber: null,
        taxCode: null,
        email: 'mario@example.com',
        pec: null,
        phone: null,
        website: null,
        contactName: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        province: null,
        postalCode: null,
        countryCode: null,
        notes: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        supplierRole: null,
      },
      ...overrides,
    };
  }

  function createPrismaMock() {
    return {
      customer: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      supplier: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      party: {
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };
  }

  it('listAll restituisce i soli ruoli attivi senza paginazione (combo Ordine cliente)', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findMany.mockResolvedValue([customerRow()]);
    const service = new CustomersService(prisma as unknown as PrismaService);

    const result = await service.listAll(tenantId);

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, isActive: true } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'cust-1', firstName: 'Mario', lastName: 'Rossi' });
  });

  it('list pagina clienti con ricerca opzionale (vista appiattita dal soggetto)', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findMany.mockResolvedValue([customerRow()]);
    prisma.customer.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    const service = new CustomersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, {
      page: 1,
      pageSize: 20,
      search: 'mario',
    });

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: 'cust-1',
      firstName: 'Mario',
      lastName: 'Rossi',
      email: 'mario@example.com',
      code: '0001',
      isActive: true,
      linkedSupplierId: null,
      linkedSupplierActive: false,
    });
  });

  it('getById appiattisce i dati del soggetto e lo stato del ruolo fornitore', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findFirst.mockResolvedValue(
      customerRow({
        party: {
          ...customerRow().party,
          supplierRole: { id: 'sup-9', isActive: true },
        },
      }),
    );
    const service = new CustomersService(prisma as unknown as PrismaService);

    const customer = await service.getById(tenantId, 'cust-1');
    expect(customer.linkedSupplierId).toBe('sup-9');
    expect(customer.linkedSupplierActive).toBe(true);
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findFirst.mockResolvedValue(null);
    const service = new CustomersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update con alsoSupplier=false disattiva il ruolo senza eliminarlo', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findFirst.mockResolvedValue(
      customerRow({
        party: {
          ...customerRow().party,
          supplierRole: { id: 'sup-9', isActive: true },
        },
      }),
    );
    const tx = {
      customer: { update: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
      party: { update: vi.fn() },
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sup-9', isActive: true }),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );
    const service = new CustomersService(prisma as unknown as PrismaService);

    await service.update(tenantId, 'cust-1', { alsoSupplier: false });

    expect(tx.supplier.update).toHaveBeenCalledWith({
      where: { id: 'sup-9' },
      data: { isActive: false },
    });
    expect(tx.supplier.create).not.toHaveBeenCalled();
  });

  it('update con alsoSupplier=true riattiva un ruolo esistente invece di crearne uno nuovo', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findFirst.mockResolvedValue(customerRow());
    const tx = {
      customer: { update: vi.fn() },
      party: { update: vi.fn() },
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sup-9', isActive: false }),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );
    const service = new CustomersService(prisma as unknown as PrismaService);

    await service.update(tenantId, 'cust-1', { alsoSupplier: true });

    expect(tx.supplier.update).toHaveBeenCalledWith({
      where: { id: 'sup-9' },
      data: { isActive: true },
    });
    expect(tx.supplier.create).not.toHaveBeenCalled();
  });

  it('setCustomerRoleForSupplier aggancia il ruolo cliente allo stesso soggetto (nessuna copia)', async () => {
    const prisma = createPrismaMock();
    prisma.supplier.findFirst.mockResolvedValue({
      id: 'sup-1',
      partyId: 'party-7',
      party: { customerRole: null },
    });
    const tx = {
      customer: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'cust-new' }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    );
    prisma.customer.findFirst.mockResolvedValue(
      customerRow({ id: 'cust-new', partyId: 'party-7' }),
    );
    const service = new CustomersService(prisma as unknown as PrismaService);

    await service.setCustomerRoleForSupplier(tenantId, 'sup-1', true);

    expect(tx.customer.create).toHaveBeenCalledWith({
      data: { tenantId, partyId: 'party-7', code: '0001' },
      select: { id: true },
    });
  });
});
