import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  const tenantId = 'tenant-1';

  function supplierRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'sup-1',
      tenantId,
      partyId: 'party-1',
      code: '0001',
      isActive: true,
      paymentMethod: null,
      paymentTerms: null,
      supplierDiscount: null,
      defaultVatCodeId: null,
      transportResponsible: null,
      freightTerms: null,
      documentCreationAlert: null,
      documentCreationNote: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      party: {
        id: 'party-1',
        tenantId,
        companyName: 'Fornitore',
        firstName: null,
        lastName: null,
        vatNumber: null,
        taxCode: null,
        email: null,
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
        customerRole: null,
      },
      ...overrides,
    };
  }

  const prisma = {
    supplier: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    party: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    vatCode: { findFirst: vi.fn() },
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

  const customers = {
    setCustomerRoleForSupplier: vi.fn(),
  };

  let service: SuppliersService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.customer.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return arg(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    });
    service = new SuppliersService(prisma as never, customers as never);
  });

  it('getById lancia NotFoundException se assente', async () => {
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(service.getById(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getById appiattisce il soggetto (nome = ragione sociale)', async () => {
    prisma.supplier.findFirst.mockResolvedValue(
      supplierRow({
        party: { ...supplierRow().party, customerRole: { id: 'cust-3', isActive: false } },
      }),
    );
    const supplier = await service.getById(tenantId, 'sup-1');
    expect(supplier.name).toBe('Fornitore');
    expect(supplier.linkedCustomerId).toBe('cust-3');
    expect(supplier.linkedCustomerActive).toBe(false);
  });

  it('create normalizza il nome nel soggetto (ragione sociale)', async () => {
    prisma.supplier.findMany.mockResolvedValue([]);
    prisma.supplier.findFirst.mockResolvedValue(supplierRow());
    prisma.party.create.mockResolvedValue({ id: 'party-1' });
    prisma.supplier.create.mockResolvedValue({ id: 'sup-1' });
    await service.create(tenantId, { name: '  Fornitore  ' });
    expect(prisma.party.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyName: 'Fornitore' }),
      }),
    );
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: '0001', partyId: 'party-1' }),
      }),
    );
  });

  it('create assegna codice progressivo se assente', async () => {
    prisma.supplier.findMany.mockResolvedValue([{ code: '0002' }, { code: 'FORN-X' }]);
    prisma.supplier.findFirst.mockResolvedValue(supplierRow({ id: 'sup-2', code: '0003' }));
    prisma.party.create.mockResolvedValue({ id: 'party-2' });
    prisma.supplier.create.mockResolvedValue({ id: 'sup-2' });
    await service.create(tenantId, { name: 'Nuovo' });
    expect(prisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: '0003' }),
      }),
    );
  });

  it('delete blocca se ci sono ordini collegati', async () => {
    prisma.supplier.findFirst.mockResolvedValue(supplierRow());
    prisma.supplierOrder.count.mockResolvedValue(1);
    prisma.document.count.mockResolvedValue(0);
    await expect(service.delete(tenantId, 'sup-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('delete di un ruolo senza ruolo cliente elimina anche il soggetto', async () => {
    prisma.supplier.findFirst.mockResolvedValue(supplierRow());
    prisma.supplierOrder.count.mockResolvedValue(0);
    prisma.document.count.mockResolvedValue(0);
    await service.delete(tenantId, 'sup-1');
    expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: 'sup-1' } });
    expect(prisma.party.delete).toHaveBeenCalledWith({ where: { id: 'party-1' } });
  });

  it('delete conserva il soggetto se esiste il ruolo cliente', async () => {
    prisma.supplier.findFirst.mockResolvedValue(
      supplierRow({
        party: { ...supplierRow().party, customerRole: { id: 'cust-3', isActive: true } },
      }),
    );
    prisma.supplierOrder.count.mockResolvedValue(0);
    prisma.document.count.mockResolvedValue(0);
    await service.delete(tenantId, 'sup-1');
    expect(prisma.supplier.delete).toHaveBeenCalledWith({ where: { id: 'sup-1' } });
    expect(prisma.party.delete).not.toHaveBeenCalled();
  });
});
