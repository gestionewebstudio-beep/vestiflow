import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { SalesOrdersService } from './sales-orders.service';

describe('SalesOrdersService', () => {
  const tenantId = 'tenant-1';

  function createPrismaMock() {
    return {
      salesOrder: {
        findMany: vi.fn(),
        count: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  }

  it('list pagina ordini con filtri e calcola Impegnata/location dalle prenotazioni attive', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: '1001',
        onlineSale: null,
        reservations: [
          { remainingQuantity: 2, location: { name: 'Negozio Roma' } },
          { remainingQuantity: 1, location: { name: 'Negozio Roma' } },
        ],
      },
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, {
      page: 1,
      pageSize: 10,
      search: '1001',
      financialStatus: 'paid',
      source: 'shopify',
    });

    expect(result.items).toEqual([
      {
        id: 'order-1',
        orderNumber: '1001',
        onlineSale: null,
        customer: null,
        committedQuantity: 3,
        locationName: 'Negozio Roma',
      },
    ]);
    expect(result.total).toBe(1);
  });

  // Ordine evaso: l'impegno è stato consumato, quindi la colonna non può più
  // leggerlo. La merce però è uscita da un magazzino, e a dirlo resta la
  // vendita online. Senza il ripiego la colonna si svuota proprio quando il
  // dato smette di essere una previsione e diventa storia.
  it("list legge la location dalla vendita online quando l'ordine è evaso e non ha piu' impegni attivi", async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      {
        id: 'order-2',
        orderNumber: '1004',
        onlineSale: {
          id: 'sale-1',
          reference: 'VO-2026-0001',
          fulfilledAt: new Date('2026-08-08T13:32:35.000Z'),
          inventoryStatus: 'unloaded',
          refundedAt: null,
          location: { name: 'Magazzino test 3' },
        },
        reservations: [],
      },
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 });

    expect(result.items[0]?.locationName).toBe('Magazzino test 3');
    expect(result.items[0]?.committedQuantity).toBe(0);
    // La location serve solo alla colonna: non deve comparire nella riga.
    expect(result.items[0]?.onlineSale).toEqual({
      id: 'sale-1',
      reference: 'VO-2026-0001',
      fulfilledAt: new Date('2026-08-08T13:32:35.000Z'),
      inventoryStatus: 'unloaded',
      refundedAt: null,
    });
  });

  // Annullato: gli impegni sono stati rilasciati e non esiste vendita online,
  // perché non è uscito niente da nessun magazzino. Il vuoto è la verità.
  it("list lascia la location vuota su un ordine annullato", async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      { id: 'order-3', orderNumber: '1003', onlineSale: null, reservations: [] },
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 });

    expect(result.items[0]?.locationName).toBeNull();
  });

  it('getById include righe e cliente', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      lines: [],
      customer: { party: { email: 'buyer@example.com' } },
    });
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'order-1', testOwnerUser())).resolves.toMatchObject({
      id: 'order-1',
    });
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue(null);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'missing', testOwnerUser())).rejects.toBeInstanceOf(NotFoundException);
  });
});
