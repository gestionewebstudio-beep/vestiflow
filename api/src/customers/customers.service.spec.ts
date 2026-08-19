import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { docManagePermission, TenantPermission } from '../auth/tenant-permission.constants';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
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

  /**
   * Perché questo blocco esiste — la rotta `POST/PATCH /customers` chiede
   * `customers.manage`, ma il corpo porta `alsoSupplier`, e quella spunta non
   * tocca il cliente: crea o disattiva un'anagrafica FORNITORE, sceglibile in
   * ordini fornitore, arrivi merce e registrazioni fattura. È il difetto
   * gemello di quello del form fornitore, nella direzione opposta.
   */
  describe('il permesso segue il ruolo gemello, non la rotta', () => {
    // Passa il gate della rotta clienti, ma non gestisce gli ordini fornitore.
    const soloClienti = testClerkUser({
      permissions: [...testClerkUser().permissions, TenantPermission.CustomersManage],
    });
    const ancheFornitori = testClerkUser({
      permissions: [
        ...testClerkUser().permissions,
        TenantPermission.CustomersManage,
        docManagePermission('supplier_order'),
      ],
    });
    // Titolare con l'elenco permessi VUOTO: passa per ruolo, non per array.
    const titolare = testOwnerUser({ permissions: [] });

    /** Transazione di creazione: codice, soggetto, ruolo cliente e gemello. */
    function creaTx() {
      return {
        customer: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({ id: 'cust-new', partyId: 'party-new' }),
          update: vi.fn(),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        party: { create: vi.fn().mockResolvedValue({ id: 'party-new' }), update: vi.fn() },
        supplier: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
        },
      };
    }

    /** Modifica di un cliente che è ANCHE fornitore attivo (spunta accesa). */
    function modificaTx() {
      return {
        customer: { update: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
        party: { update: vi.fn() },
        supplier: {
          findUnique: vi.fn().mockResolvedValue({ id: 'sup-9', isActive: true }),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
          create: vi.fn(),
        },
      };
    }

    function conRuoloFornitoreAttivo() {
      return customerRow({
        party: { ...customerRow().party, supplierRole: { id: 'sup-9', isActive: true } },
      });
    }

    const nuovoCliente = { firstName: 'Mario', lastName: 'Rossi' };

    it('crea: senza «Ordine fornitore · Gestisci» la spunta «È anche fornitore» è negata e nulla viene scritto', async () => {
      const prisma = createPrismaMock();
      const tx = creaTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      const service = new CustomersService(prisma as unknown as PrismaService);

      await expect(
        service.create('tenant-1', { ...nuovoCliente, alsoSupplier: true }, soloClienti),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // Il rifiuto arriva prima della transazione: nessuna riga toccata.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.party.create).not.toHaveBeenCalled();
      expect(tx.customer.create).not.toHaveBeenCalled();
      expect(tx.supplier.create).not.toHaveBeenCalled();
    });

    it('crea: con il permesso sugli ordini fornitore il ruolo gemello nasce come prima', async () => {
      const prisma = createPrismaMock();
      const tx = creaTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      prisma.customer.findFirst.mockResolvedValue(customerRow({ id: 'cust-new' }));
      const service = new CustomersService(prisma as unknown as PrismaService);

      await service.create('tenant-1', { ...nuovoCliente, alsoSupplier: true }, ancheFornitori);

      expect(tx.supplier.create).toHaveBeenCalledWith({
        data: { tenantId: 'tenant-1', partyId: 'party-new', code: '0001' },
      });
    });

    it('crea: il titolare passa anche con l\'elenco permessi vuoto', async () => {
      const prisma = createPrismaMock();
      const tx = creaTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      prisma.customer.findFirst.mockResolvedValue(customerRow({ id: 'cust-new' }));
      const service = new CustomersService(prisma as unknown as PrismaService);

      await service.create('tenant-1', { ...nuovoCliente, alsoSupplier: true }, titolare);

      expect(titolare.permissions).toEqual([]);
      expect(tx.supplier.create).toHaveBeenCalled();
    });

    it('crea: senza la spunta il cliente si salva anche senza il permesso gemello', async () => {
      const prisma = createPrismaMock();
      const tx = creaTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      prisma.customer.findFirst.mockResolvedValue(customerRow({ id: 'cust-new' }));
      const service = new CustomersService(prisma as unknown as PrismaService);

      await service.create('tenant-1', { ...nuovoCliente, alsoSupplier: false }, soloClienti);

      expect(tx.customer.create).toHaveBeenCalled();
      expect(tx.supplier.create).not.toHaveBeenCalled();
    });

    it('modifica: SPEGNERE la spunta è negato quanto accenderla (disattivare un fornitore è una scrittura)', async () => {
      const prisma = createPrismaMock();
      const tx = modificaTx();
      prisma.customer.findFirst.mockResolvedValue(conRuoloFornitoreAttivo());
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      const service = new CustomersService(prisma as unknown as PrismaService);

      await expect(
        service.update('tenant-1', 'cust-1', { alsoSupplier: false }, soloClienti),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.customer.update).not.toHaveBeenCalled();
      expect(tx.supplier.update).not.toHaveBeenCalled();
    });

    it('modifica: accendere la spunta senza il permesso gemello è negato e nulla viene scritto', async () => {
      const prisma = createPrismaMock();
      const tx = modificaTx();
      prisma.customer.findFirst.mockResolvedValue(customerRow());
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      const service = new CustomersService(prisma as unknown as PrismaService);

      await expect(
        service.update('tenant-1', 'cust-1', { alsoSupplier: true }, soloClienti),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.supplier.create).not.toHaveBeenCalled();
    });

    it('modifica: la spunta invariata non chiede nulla — la maschera la manda a ogni salvataggio', async () => {
      const prisma = createPrismaMock();
      const tx = modificaTx();
      prisma.customer.findFirst.mockResolvedValue(conRuoloFornitoreAttivo());
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      const service = new CustomersService(prisma as unknown as PrismaService);

      await service.update(
        'tenant-1',
        'cust-1',
        { paymentTerms: '60 gg', alsoSupplier: true },
        soloClienti,
      );

      expect(tx.customer.update).toHaveBeenCalled();
      // Stato già allineato: il ruolo fornitore non viene toccato.
      expect(tx.supplier.update).not.toHaveBeenCalled();
      expect(tx.supplier.create).not.toHaveBeenCalled();
    });

    it('modifica: con il permesso gemello la disattivazione del ruolo fornitore passa', async () => {
      const prisma = createPrismaMock();
      const tx = modificaTx();
      prisma.customer.findFirst.mockResolvedValue(conRuoloFornitoreAttivo());
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      const service = new CustomersService(prisma as unknown as PrismaService);

      await service.update('tenant-1', 'cust-1', { alsoSupplier: false }, ancheFornitori);

      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-9' },
        data: { isActive: false },
      });
    });

    it('senza utente in contesto non si decide: le chiamate interne restano intatte', async () => {
      const prisma = createPrismaMock();
      const tx = modificaTx();
      prisma.customer.findFirst.mockResolvedValue(conRuoloFornitoreAttivo());
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx),
      );
      const service = new CustomersService(prisma as unknown as PrismaService);
      const chiamataInterna: UserProfileDto | undefined = undefined;

      await service.update('tenant-1', 'cust-1', { alsoSupplier: false }, chiamataInterna);

      expect(tx.supplier.update).toHaveBeenCalledWith({
        where: { id: 'sup-9' },
        data: { isActive: false },
      });
    });
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
