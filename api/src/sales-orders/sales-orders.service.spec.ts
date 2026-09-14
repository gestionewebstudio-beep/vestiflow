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
        location: null,
        reservations: [
          { remainingQuantity: 2, location: { id: 'roma', name: 'Negozio Roma' } },
          { remainingQuantity: 1, location: { id: 'roma', name: 'Negozio Roma' } },
        ],
        // ⭐ Le rettifiche del canale: la somma è di TESTATA, il conteggio dal _count.
        refundTotalMinor: 750,
        currentTotalMinor: 9250,
        _count: { refunds: 2 },
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
        // La somma e il totale aggiornato passano dalla testata così come sono.
        refundCount: 2,
        refundTotalMinor: 750,
        currentTotalMinor: 9250,
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
          location: { id: 'mag-3', name: 'Magazzino test 3' },
        },
        location: null,
        reservations: [],
        _count: { refunds: 0 },
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
  it('list lascia la location vuota su un ordine annullato', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      { id: 'order-3', orderNumber: '1003', onlineSale: null, reservations: [], _count: { refunds: 0 } },
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 });

    expect(result.items[0]?.locationName).toBeNull();
  });

  // ⛔ Impegni su sedi diverse: la colonna resta vuota. Era «la prima trovata», cioè
  //    una sede scelta al posto dell'operatore (proprietario, 13/09/2026).
  it('list lascia la location vuota con impegni attivi su più sedi', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findMany.mockResolvedValue([
      {
        id: 'order-4',
        orderNumber: '1005',
        onlineSale: null,
        location: null,
        reservations: [
          { remainingQuantity: 1, location: { id: 'a', name: 'Sede A' } },
          { remainingQuantity: 2, location: { id: 'b', name: 'Sede B' } },
        ],
        _count: { refunds: 0 },
      },
    ]);
    prisma.salesOrder.count.mockResolvedValue(1);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const result = await service.list(tenantId, { page: 1, pageSize: 10 });

    expect(result.items[0]?.locationName).toBeNull();
    expect(result.items[0]?.committedQuantity).toBe(3);
  });

  it('getById include righe e cliente', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-1',
      lines: [
        { id: 'riga-1', quantity: 3, spedizioni: [{ salesOrderLineId: 'riga-1', quantity: 2 }] },
      ],
      customer: { party: { email: 'buyer@example.com' } },
      location: null,
      reservations: [],
      onlineSale: {
        id: 'sale-1',
        reference: 'VO-2026-0002',
        fulfilledAt: new Date('2026-09-13T13:13:52.000Z'),
        inventoryStatus: 'unloaded',
        refundedAt: null,
        location: { id: 'shop', name: 'Shop location' },
      },
      refunds: [
        {
          id: 'r-1',
          kind: 'cancellation',
          occurredAt: new Date('2026-09-13T13:11:58.000Z'),
          totalMinor: 74995,
          taxMinor: 0,
          note: null,
          lines: [{ salesOrderLineId: 'riga-1', quantity: 1, restockType: 'cancel' }],
        },
      ],
    });
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    // ⭐ Con le rettifiche del canale e le tre quantità per riga (#1014, 13/09/2026):
    //    ordinati 3 · annullati 1 (dal `cancel` del canale) · spediti 2.
    // ⭐ E la sede per RACCORDO: evaso, senza impegni attivi, risponde la Vendita online —
    //    la maschera mostrava «Seleziona location…» su un ordine uscito da una sede nota.
    await expect(service.getById(tenantId, 'order-1', testOwnerUser())).resolves.toMatchObject({
      id: 'order-1',
      locationId: 'shop',
      locationName: 'Shop location',
      onlineSale: { id: 'sale-1', reference: 'VO-2026-0002' },
      lines: [{ id: 'riga-1', quantity: 3, cancelledQuantity: 1, shippedQuantity: 2 }],
    });
  });

  it('getById: un ordine manuale tiene la sede di testata, e la sede della vendita non esce', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-5',
      source: 'manual',
      locationId: 'roma',
      location: { id: 'roma', name: 'Negozio Roma' },
      lines: [],
      customer: null,
      reservations: [{ location: { id: 'b', name: 'Sede B' } }],
      onlineSale: null,
      refunds: [],
    });
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const dettaglio = await service.getById(tenantId, 'order-5', testOwnerUser());

    expect(dettaglio.locationId).toBe('roma');
    expect(dettaglio.locationName).toBe('Negozio Roma');
    expect(dettaglio.onlineSale).toBeNull();
    expect(dettaglio).not.toHaveProperty('reservations');
  });

  it('⛔ getById: impegni su più sedi, nessuna sede — mai la prima', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: 'order-6',
      source: 'shopify',
      locationId: null,
      location: null,
      lines: [],
      customer: null,
      reservations: [{ location: { id: 'a', name: 'Sede A' } }, { location: { id: 'b', name: 'Sede B' } }],
      onlineSale: null,
      refunds: [],
    });
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    const dettaglio = await service.getById(tenantId, 'order-6', testOwnerUser());

    expect(dettaglio.locationId).toBeNull();
    expect(dettaglio.locationName).toBeNull();
  });

  it('getById lancia NotFoundException se assente', async () => {
    const prisma = createPrismaMock();
    prisma.salesOrder.findFirst.mockResolvedValue(null);
    const service = new SalesOrdersService(prisma as unknown as PrismaService);

    await expect(service.getById(tenantId, 'missing', testOwnerUser())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
