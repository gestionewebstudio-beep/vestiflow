import {
  CorrispettivoStatus,
  DocumentType,
  OnlineOrderEventType,
  OnlineSaleInventoryStatus,
  ReservationEventType,
  ReservationStatus,
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
  StockMovementType,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { OnlineOrderLifecycleService, type OnlineOrderEventInput } from './online-order-lifecycle.service';
import { OnlineSaleFulfillmentService } from './online-sale-fulfillment.service';
import { StockReservationService } from './stock-reservation.service';

/**
 * Test obbligatori fase 1 (§11) + fase 2 (§11): ordine ricevuto, duplicati,
 * annullamento, evasione completa con Vendita online + Corrispettivo,
 * rimborso senza carico, restock reale, fallimento transazionale.
 *
 * Fake Prisma in-memory: mantiene i saldi InventoryLevel e tutte le tabelle
 * di fase 2, così i test verificano i saldi finali (Giacenza, Impegnata,
 * Disponibile) e i collegamenti reali, non solo le chiamate. La transazione
 * fa snapshot/restore: un errore a metà ripristina lo stato precedente,
 * come il rollback Postgres.
 */

interface FakeLevel {
  tenantId: string;
  variantId: string;
  locationId: string;
  onHand: number;
  committed: number;
  available: number;
}

interface FakeOrderLine {
  id: string;
  orderId: string;
  variantId: string | null;
  sku: string;
  title: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

interface FakeOrder {
  id: string;
  tenantId: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string;
  currency: string;
  financialStatus: SalesOrderFinancialStatus;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  placedAt: Date;
  cancelledAt: Date | null;
  fulfilledAt: Date | null;
  externalFulfillmentId: string | null;
  fulfillmentStatus: SalesOrderFulfillmentStatus;
  requiresReview: boolean;
  reviewReason: string | null;
  lines: FakeOrderLine[];
}

interface FakeReservation {
  id: string;
  tenantId: string;
  locationId: string;
  variantId: string;
  channel: SalesOrderSource;
  salesOrderId: string;
  salesOrderLineId: string | null;
  sku: string;
  quantity: number;
  remainingQuantity: number;
  status: ReservationStatus;
  externalOrderRef: string | null;
  externalLineRef: string | null;
  createdAt: Date;
}

interface FakeOnlineSale {
  id: string;
  tenantId: string;
  salesOrderId: string;
  reference: string;
  dedupeKey: string;
  externalFulfillmentId: string | null;
  inventoryStatus: OnlineSaleInventoryStatus;
  refundedAt: Date | null;
  locationId: string | null;
  fulfilledAt: Date;
  orderNumber: string;
  totalMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  [key: string]: unknown;
}

interface FakeMovement {
  tenantId: string;
  type: StockMovementType;
  variantId: string;
  sku: string;
  locationId: string;
  quantity: number;
  sourceDocumentType: DocumentType | null;
  sourceDocumentId: string | null;
  sourceLineId: string | null;
  externalRef: string | null;
  reason: string | null;
  createdAt?: Date;
  [key: string]: unknown;
}

function createFakeDb() {
  const orders = new Map<string, FakeOrder>();
  const levels = new Map<string, FakeLevel>();
  const reservations: FakeReservation[] = [];
  const variants = new Map<string, { id: string; barcode: string | null }>();
  const reservationEvents: Array<{
    tenantId: string;
    reservationId: string;
    type: ReservationEventType;
    quantityDelta: number;
    remainingAfter: number;
    note?: string;
  }> = [];
  const orderEvents: Array<{
    tenantId: string;
    dedupeKey: string;
    type: OnlineOrderEventType;
    salesOrderId: string;
    externalOrderId: string;
  }> = [];
  const onlineSales: FakeOnlineSale[] = [];
  const onlineSaleLines: Array<Record<string, unknown> & { id: string }> = [];
  const corrispettivi: Array<Record<string, unknown> & { id: string; onlineSaleId: string }> = [];
  const corrispettivoLines: Array<Record<string, unknown>> = [];
  const movements: FakeMovement[] = [];
  const sequences = new Map<string, number>();

  let seq = 0;
  const nextId = (prefix: string): string => `${prefix}-${(seq += 1)}`;
  const levelKey = (variantId: string, locationId: string): string => `${variantId}:${locationId}`;

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, expected]) => {
      if (expected !== null && typeof expected === 'object' && 'in' in (expected as object)) {
        return ((expected as { in: unknown[] }).in ?? []).includes(row[key]);
      }
      return row[key] === expected;
    });

  const tx = {
    onlineOrderEvent: {
      createMany: ({
        data,
        skipDuplicates,
      }: {
        data: Array<(typeof orderEvents)[number]>;
        skipDuplicates?: boolean;
      }) => {
        let count = 0;
        for (const row of data) {
          const exists = orderEvents.some(
            (event) => event.tenantId === row.tenantId && event.dedupeKey === row.dedupeKey,
          );
          if (exists && skipDuplicates) {
            continue;
          }
          orderEvents.push(row);
          count += 1;
        }
        return Promise.resolve({ count });
      },
    },
    salesOrder: {
      findFirst: ({
        where,
        include,
      }: {
        where: { id: string; tenantId: string };
        include?: { lines?: boolean; customer?: boolean; reservations?: boolean };
      }) => {
        const order = orders.get(where.id);
        if (!order || order.tenantId !== where.tenantId) {
          return Promise.resolve(null);
        }
        const base: Record<string, unknown> = { ...order };
        if (include?.lines) {
          base.lines = order.lines.map((line) => ({ ...line }));
        }
        if (include?.customer) {
          base.customer = null;
        }
        if (include?.reservations) {
          base.reservations = reservations
            .filter((reservation) => reservation.salesOrderId === order.id)
            .map((reservation) => ({ ...reservation }));
        }
        return Promise.resolve(base);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: {
          id: string;
          tenantId: string;
          cancelledAt?: null;
          fulfilledAt?: null;
        };
        data: Partial<FakeOrder>;
      }) => {
        const order = orders.get(where.id);
        if (!order || order.tenantId !== where.tenantId) {
          return Promise.resolve({ count: 0 });
        }
        if ('cancelledAt' in where && order.cancelledAt !== null) {
          return Promise.resolve({ count: 0 });
        }
        if ('fulfilledAt' in where && order.fulfilledAt !== null) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(order, data);
        return Promise.resolve({ count: 1 });
      },
    },
    stockReservation: {
      findMany: ({
        where,
      }: {
        where: {
          tenantId: string;
          salesOrderId?: string;
          status?: ReservationStatus;
        };
      }) =>
        Promise.resolve(
          reservations
            .filter(
              (reservation) =>
                reservation.tenantId === where.tenantId &&
                (where.salesOrderId === undefined ||
                  reservation.salesOrderId === where.salesOrderId) &&
                (where.status === undefined || reservation.status === where.status),
            )
            .map((reservation) => ({ ...reservation })),
        ),
      create: ({ data }: { data: Omit<FakeReservation, 'id' | 'createdAt'> }) => {
        const reservation: FakeReservation = {
          ...data,
          id: nextId('res'),
          createdAt: new Date(),
        };
        reservations.push(reservation);
        return Promise.resolve({ ...reservation });
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<FakeReservation> }) => {
        const reservation = reservations.find((row) => row.id === where.id);
        if (!reservation) {
          return Promise.reject(new Error(`Reservation ${where.id} non trovata`));
        }
        Object.assign(reservation, data);
        return Promise.resolve({ ...reservation });
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; status?: ReservationStatus };
        data: Partial<FakeReservation>;
      }) => {
        const reservation = reservations.find(
          (row) => row.id === where.id && (where.status === undefined || row.status === where.status),
        );
        if (!reservation) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(reservation, data);
        return Promise.resolve({ count: 1 });
      },
    },
    stockReservationEvent: {
      create: ({ data }: { data: (typeof reservationEvents)[number] }) => {
        reservationEvents.push(data);
        return Promise.resolve(data);
      },
    },
    inventoryLevel: {
      upsert: ({
        where,
        create,
      }: {
        where: { variantId_locationId: { variantId: string; locationId: string } };
        create: { tenantId: string; variantId: string; locationId: string };
      }) => {
        const key = levelKey(
          where.variantId_locationId.variantId,
          where.variantId_locationId.locationId,
        );
        if (!levels.has(key)) {
          levels.set(key, {
            tenantId: create.tenantId,
            variantId: create.variantId,
            locationId: create.locationId,
            onHand: 0,
            committed: 0,
            available: 0,
          });
        }
        return Promise.resolve(levels.get(key));
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { tenantId: string; variantId: string; locationId: string };
        data: {
          onHand?: { increment: number };
          committed?: { increment: number };
          available?: { increment: number };
        };
      }) => {
        const level = levels.get(levelKey(where.variantId, where.locationId));
        if (!level || level.tenantId !== where.tenantId) {
          return Promise.resolve({ count: 0 });
        }
        if (data.onHand) {
          level.onHand += data.onHand.increment;
        }
        if (data.committed) {
          level.committed += data.committed.increment;
        }
        if (data.available) {
          level.available += data.available.increment;
        }
        return Promise.resolve({ count: 1 });
      },
    },
    stockMovement: {
      create: ({ data }: { data: FakeMovement }) => {
        movements.push({ ...data });
        return Promise.resolve({ ...data, id: nextId('mov') });
      },
    },
    productVariant: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in
            .map((id) => variants.get(id))
            .flatMap((variant) => (variant ? [variant] : [])),
        ),
    },
    documentSequence: {
      upsert: ({
        where,
      }: {
        where: {
          tenantId_type_series_year: {
            tenantId: string;
            type: DocumentType;
            series: string;
            year: number;
          };
        };
      }) => {
        const key = JSON.stringify(where.tenantId_type_series_year);
        const next = (sequences.get(key) ?? 0) + 1;
        sequences.set(key, next);
        return Promise.resolve({ lastNumber: next });
      },
    },
    onlineSale: {
      findFirst: ({ where }: { where: Record<string, unknown> }) => {
        const sale = onlineSales.find((row) => matches(row, where));
        return Promise.resolve(sale ? { ...sale } : null);
      },
      create: ({ data }: { data: Record<string, unknown> }) => {
        const sale = { ...data, id: nextId('sale') } as FakeOnlineSale;
        if (
          onlineSales.some(
            (row) => row.tenantId === sale.tenantId && row.dedupeKey === sale.dedupeKey,
          )
        ) {
          return Promise.reject(new Error('UNIQUE violato: tenant+dedupeKey'));
        }
        onlineSales.push(sale);
        return Promise.resolve({ ...sale });
      },
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const sale = onlineSales.find((row) => row.id === where.id);
        if (!sale) {
          return Promise.reject(new Error('Vendita non trovata'));
        }
        Object.assign(sale, data);
        return Promise.resolve({ ...sale });
      },
    },
    onlineSaleLine: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const line = { ...data, id: nextId('sline') };
        onlineSaleLines.push(line);
        return Promise.resolve({ ...line });
      },
    },
    corrispettivoEntry: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const entry = { ...data, id: nextId('cor') } as (typeof corrispettivi)[number];
        corrispettivi.push(entry);
        return Promise.resolve({ ...entry });
      },
      updateMany: ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const entry of corrispettivi) {
          if (matches(entry, where)) {
            Object.assign(entry, data);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
    corrispettivoEntryLine: {
      createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
        corrispettivoLines.push(...data.map((row) => ({ ...row })));
        return Promise.resolve({ count: data.length });
      },
    },
  };

  const takeSnapshot = () => ({
    orders: structuredClone([...orders.entries()]),
    levels: structuredClone([...levels.entries()]),
    reservations: structuredClone(reservations),
    reservationEvents: structuredClone(reservationEvents),
    orderEvents: structuredClone(orderEvents),
    onlineSales: structuredClone(onlineSales),
    onlineSaleLines: structuredClone(onlineSaleLines),
    corrispettivi: structuredClone(corrispettivi),
    corrispettivoLines: structuredClone(corrispettivoLines),
    movements: structuredClone(movements),
    sequences: structuredClone([...sequences.entries()]),
  });

  const restore = (snap: ReturnType<typeof takeSnapshot>): void => {
    orders.clear();
    for (const [key, value] of snap.orders) {
      orders.set(key, value);
    }
    levels.clear();
    for (const [key, value] of snap.levels) {
      levels.set(key, value);
    }
    reservations.splice(0, reservations.length, ...snap.reservations);
    reservationEvents.splice(0, reservationEvents.length, ...snap.reservationEvents);
    orderEvents.splice(0, orderEvents.length, ...snap.orderEvents);
    onlineSales.splice(0, onlineSales.length, ...snap.onlineSales);
    onlineSaleLines.splice(0, onlineSaleLines.length, ...snap.onlineSaleLines);
    corrispettivi.splice(0, corrispettivi.length, ...snap.corrispettivi);
    corrispettivoLines.splice(0, corrispettivoLines.length, ...snap.corrispettivoLines);
    movements.splice(0, movements.length, ...snap.movements);
    sequences.clear();
    for (const [key, value] of snap.sequences) {
      sequences.set(key, value);
    }
  };

  const prisma = {
    ...tx,
    // Rollback simulato: errore nella callback ⇒ stato ripristinato,
    // come la transazione Postgres reale (nessun saldo parziale).
    $transaction: async (cb: (client: typeof tx) => Promise<unknown>) => {
      const snap = takeSnapshot();
      try {
        return await cb(tx);
      } catch (error) {
        restore(snap);
        throw error;
      }
    },
  };

  return {
    prisma,
    tx,
    orders,
    levels,
    reservations,
    variants,
    reservationEvents,
    orderEvents,
    onlineSales,
    onlineSaleLines,
    corrispettivi,
    corrispettivoLines,
    movements,
  };
}

function seedOrder(db: ReturnType<typeof createFakeDb>, id = 'order-1'): void {
  db.orders.set(id, {
    id,
    tenantId: 'tenant-1',
    orderNumber: '#1001',
    customerId: null,
    customerName: 'Mario Rossi',
    currency: 'EUR',
    financialStatus: SalesOrderFinancialStatus.paid,
    subtotalMinor: 3000,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 541,
    totalMinor: 3000,
    placedAt: new Date('2026-07-10T09:00:00Z'),
    cancelledAt: null,
    fulfilledAt: null,
    externalFulfillmentId: null,
    fulfillmentStatus: SalesOrderFulfillmentStatus.unfulfilled,
    requiresReview: false,
    reviewReason: null,
    lines: [
      {
        id: 'line-1',
        orderId: id,
        variantId: 'variant-1',
        sku: 'SKU-1',
        title: 'Maglietta blu M',
        quantity: 2,
        unitPriceMinor: 1500,
        totalMinor: 3000,
      },
    ],
  });
  db.variants.set('variant-1', { id: 'variant-1', barcode: '8000000000001' });
}

function seedLevel(db: ReturnType<typeof createFakeDb>, onHand = 10): void {
  db.levels.set('variant-1:location-1', {
    tenantId: 'tenant-1',
    variantId: 'variant-1',
    locationId: 'location-1',
    onHand,
    committed: 0,
    available: onHand,
  });
}

function createService(db: ReturnType<typeof createFakeDb>): OnlineOrderLifecycleService {
  const prisma = db.prisma as unknown as PrismaService;
  const reservations = new StockReservationService(prisma);
  return new OnlineOrderLifecycleService(
    prisma,
    reservations,
    new OnlineSaleFulfillmentService(reservations),
  );
}

function createdEvent(overrides: Partial<OnlineOrderEventInput> = {}): OnlineOrderEventInput {
  return {
    tenantId: 'tenant-1',
    channel: SalesOrderSource.shopify_online,
    type: OnlineOrderEventType.online_order_created,
    salesOrderId: 'order-1',
    externalOrderId: 'gid://shopify/Order/1456',
    locationId: 'location-1',
    lines: [
      {
        salesOrderLineId: 'line-1',
        variantId: 'variant-1',
        sku: 'SKU-1',
        quantity: 2,
        externalLineRef: 'shopify-line-1',
      },
    ],
    ...overrides,
  };
}

function fulfilledEvent(overrides: Partial<OnlineOrderEventInput> = {}): OnlineOrderEventInput {
  return createdEvent({
    type: OnlineOrderEventType.online_order_fulfilled,
    lines: undefined,
    occurredAt: new Date('2026-07-12T11:00:00Z'),
    externalFulfillmentId: 'gid://shopify/Fulfillment/77',
    ...overrides,
  });
}

function level(db: ReturnType<typeof createFakeDb>): FakeLevel {
  const value = db.levels.get('variant-1:location-1');
  if (!value) {
    throw new Error('Level non seedato');
  }
  return value;
}

describe('OnlineOrderLifecycleService (test obbligatori fase 1 §11)', () => {
  it('ordine ricevuto: Giacenza invariata, Impegnata +, Disponibile -, nessun movimento fisico', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    const outcome = await service.handle(createdEvent());

    expect(outcome).toBe('applied');
    expect(level(db)).toMatchObject({ onHand: 10, committed: 2, available: 8 });
    expect(db.movements).toHaveLength(0);
    expect(db.reservations).toHaveLength(1);
    expect(db.reservations[0]).toMatchObject({
      status: ReservationStatus.active,
      quantity: 2,
      remainingQuantity: 2,
      externalOrderRef: 'gid://shopify/Order/1456',
    });
    expect(db.reservationEvents).toEqual([
      expect.objectContaining({ type: ReservationEventType.created, quantityDelta: 2 }),
    ]);
  });

  it('webhook duplicato: nessun doppio impegno né doppia quantità impegnata', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    const first = await service.handle(createdEvent());
    const second = await service.handle(createdEvent());

    expect(first).toBe('applied');
    expect(second).toBe('duplicate');
    expect(level(db)).toMatchObject({ onHand: 10, committed: 2, available: 8 });
    expect(db.reservations).toHaveLength(1);
    expect(db.orderEvents).toHaveLength(1);
  });

  it('ordine aggiornato con stessa quantità: impegno riusato, nessuna variazione dei saldi', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    const outcome = await service.handle(
      createdEvent({
        type: OnlineOrderEventType.online_order_updated,
        dedupeSuffix: '2026-07-12T10:00:00Z',
      }),
    );

    expect(outcome).toBe('applied');
    expect(level(db)).toMatchObject({ onHand: 10, committed: 2, available: 8 });
    expect(db.reservations).toHaveLength(1);
  });

  it('ordine annullato: Impegnata -, Disponibile +, Giacenza invariata, nessun falso carico', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    const outcome = await service.handle(
      createdEvent({
        type: OnlineOrderEventType.online_order_cancelled,
        lines: undefined,
        occurredAt: new Date('2026-07-12T09:00:00Z'),
      }),
    );

    expect(outcome).toBe('applied');
    expect(level(db)).toMatchObject({ onHand: 10, committed: 0, available: 10 });
    expect(db.movements).toHaveLength(0);
    expect(db.reservations[0]).toMatchObject({
      status: ReservationStatus.released,
      remainingQuantity: 0,
    });
    expect(db.orders.get('order-1')?.cancelledAt).toEqual(new Date('2026-07-12T09:00:00Z'));
    expect(db.reservationEvents).toContainEqual(
      expect.objectContaining({ type: ReservationEventType.released, quantityDelta: -2 }),
    );
  });

  it('doppio annullamento: il rilascio non viene applicato due volte', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    await service.handle(createdEvent({ type: OnlineOrderEventType.online_order_cancelled, lines: undefined }));
    const second = await service.handle(
      createdEvent({ type: OnlineOrderEventType.online_order_cancelled, lines: undefined }),
    );

    expect(second).toBe('duplicate');
    expect(level(db)).toMatchObject({ onHand: 10, committed: 0, available: 10 });
  });

  it('evasione parziale: stato Richiede verifica, nessuna Vendita online né scarico', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    const outcome = await service.handle(
      createdEvent({
        type: OnlineOrderEventType.online_order_partially_fulfilled,
        lines: undefined,
        dedupeSuffix: 'fulfillment-1',
      }),
    );

    expect(outcome).toBe('applied');
    expect(db.orders.get('order-1')).toMatchObject({ requiresReview: true });
    expect(db.orders.get('order-1')?.reviewReason).toContain('Evasione parziale');
    // Nessun rilascio né scarico: saldi invariati, nessuna vendita definitiva (§10).
    expect(level(db)).toMatchObject({ onHand: 10, committed: 2, available: 8 });
    expect(db.reservations[0]?.status).toBe(ReservationStatus.active);
    expect(db.movements).toHaveLength(0);
    expect(db.onlineSales).toHaveLength(0);
    expect(db.corrispettivi).toHaveLength(0);
  });

  it('concorrenza: eventi identici ravvicinati non producono saldi incoerenti', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    const outcomes = await Promise.all([
      service.handle(createdEvent()),
      service.handle(createdEvent()),
      service.handle(createdEvent()),
    ]);

    expect(outcomes.filter((outcome) => outcome === 'applied')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'duplicate')).toHaveLength(2);
    expect(level(db)).toMatchObject({ onHand: 10, committed: 2, available: 8 });
    expect(db.reservations).toHaveLength(1);
  });

  it('ordine già evaso importato in bulk: nessun impegno creato', async () => {
    const db = createFakeDb();
    seedOrder(db);
    const order = db.orders.get('order-1');
    if (order) {
      order.fulfillmentStatus = SalesOrderFulfillmentStatus.fulfilled;
    }
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());

    expect(level(db)).toMatchObject({ onHand: 10, committed: 0, available: 10 });
    expect(db.reservations).toHaveLength(0);
  });
});

describe('OnlineOrderLifecycleService (test obbligatori fase 2 §11)', () => {
  it('evasione completa: Vendita online + un movimento per riga + impegno consumato + Corrispettivo, Disponibile invariata', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    // Prima: Giacenza 10, Impegnata 2, Disponibile 8.
    expect(level(db)).toMatchObject({ onHand: 10, committed: 2, available: 8 });

    const outcome = await service.handle(fulfilledEvent());

    expect(outcome).toBe('applied');
    // Dopo (§3): Giacenza 8, Impegnata 0, Disponibile 8 (INVARIATA).
    expect(level(db)).toMatchObject({ onHand: 8, committed: 0, available: 8 });

    // Una Vendita online, una riga per prodotto.
    expect(db.onlineSales).toHaveLength(1);
    const sale = db.onlineSales[0];
    expect(sale).toMatchObject({
      reference: 'VO-2026-0001',
      salesOrderId: 'order-1',
      inventoryStatus: OnlineSaleInventoryStatus.unloaded,
      externalFulfillmentId: 'gid://shopify/Fulfillment/77',
      locationId: 'location-1',
      totalMinor: 3000,
    });
    expect(db.onlineSaleLines).toHaveLength(1);
    expect(db.onlineSaleLines[0]).toMatchObject({
      sku: 'SKU-1',
      barcode: '8000000000001',
      quantity: 2,
      salesOrderLineId: 'line-1',
      subtotalMinor: 2459,
      taxMinor: 541,
      totalMinor: 3000,
      vatRatePercent: 22,
    });

    // Un movimento per riga, negativo (tipo online_sale), collegato a vendita e riga.
    expect(db.movements).toHaveLength(1);
    expect(db.movements[0]).toMatchObject({
      type: StockMovementType.online_sale,
      quantity: 2,
      sourceDocumentType: DocumentType.online_sale,
      sourceDocumentId: sale?.id,
      locationId: 'location-1',
      externalRef: 'gid://shopify/Order/1456',
    });
    expect(db.movements[0]?.sourceLineId).toBeTruthy();
    expect(db.movements[0]?.createdAt).toEqual(new Date('2026-07-12T11:00:00Z'));

    // Impegno consumato con traccia (§5 regole invarianti).
    expect(db.reservations[0]).toMatchObject({
      status: ReservationStatus.consumed,
      remainingQuantity: 0,
    });
    expect(db.reservationEvents).toContainEqual(
      expect.objectContaining({ type: ReservationEventType.consumed, quantityDelta: -2 }),
    );

    // Un Corrispettivo collegato, con data fiscale distinta proposta dall'evasione.
    expect(db.corrispettivi).toHaveLength(1);
    expect(db.corrispettivi[0]).toMatchObject({
      reference: 'COR-2026-0001',
      onlineSaleId: sale?.id,
      salesOrderId: 'order-1',
      status: CorrispettivoStatus.to_verify,
      subtotalMinor: 3000,
      taxMinor: 541,
      totalMinor: 3000,
      operationalDate: new Date('2026-07-12T11:00:00Z'),
      fiscalDate: new Date('2026-07-12T00:00:00Z'),
    });
    expect(db.corrispettivoLines).toHaveLength(1);
  });

  it('evento duplicato: nessuna seconda Vendita, nessun secondo movimento, consumo o Corrispettivo', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    const first = await service.handle(fulfilledEvent());
    const second = await service.handle(fulfilledEvent());

    expect(first).toBe('applied');
    expect(second).toBe('duplicate');
    expect(db.onlineSales).toHaveLength(1);
    expect(db.movements).toHaveLength(1);
    expect(db.corrispettivi).toHaveLength(1);
    expect(level(db)).toMatchObject({ onHand: 8, committed: 0, available: 8 });
    expect(
      db.reservationEvents.filter((event) => event.type === ReservationEventType.consumed),
    ).toHaveLength(1);
  });

  it('rimborso dopo la vendita: nessun carico automatico, stato economico aggiornato, rettifica Corrispettivo predisposta', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    await service.handle(fulfilledEvent());
    const outcome = await service.handle(
      createdEvent({
        type: OnlineOrderEventType.online_order_refunded,
        lines: undefined,
        occurredAt: new Date('2026-07-13T10:00:00Z'),
      }),
    );

    expect(outcome).toBe('applied');
    // §7: Giacenza NON aumenta, la vendita e i movimenti restano.
    expect(level(db)).toMatchObject({ onHand: 8, committed: 0, available: 8 });
    expect(db.movements).toHaveLength(1);
    expect(db.onlineSales).toHaveLength(1);
    expect(db.onlineSales[0]?.refundedAt).toEqual(new Date('2026-07-13T10:00:00Z'));
    expect(db.corrispettivi[0]).toMatchObject({ status: CorrispettivoStatus.refunded });
    expect(String(db.corrispettivi[0]?.adjustmentNote)).toContain('rettifica');
    expect(db.orders.get('order-1')).toMatchObject({ requiresReview: true });
  });

  it('restock reale: movimento positivo collegato alla Vendita online, Giacenza e Disponibile +', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    await service.handle(fulfilledEvent());
    const outcome = await service.handle(
      createdEvent({
        type: OnlineOrderEventType.online_order_restocked,
        dedupeSuffix: 'refund-9:loc-shopify-1',
        occurredAt: new Date('2026-07-14T08:00:00Z'),
        locationId: 'location-1',
        lines: [
          {
            salesOrderLineId: 'line-1',
            variantId: 'variant-1',
            sku: 'SKU-1',
            quantity: 2,
            externalLineRef: 'shopify-line-1',
          },
        ],
      }),
    );

    expect(outcome).toBe('applied');
    expect(level(db)).toMatchObject({ onHand: 10, committed: 0, available: 10 });
    const restockMovement = db.movements.find(
      (movement) => movement.type === StockMovementType.return,
    );
    expect(restockMovement).toMatchObject({
      quantity: 2,
      locationId: 'location-1',
      sourceDocumentType: DocumentType.online_sale,
      sourceDocumentId: db.onlineSales[0]?.id,
    });
    expect(String(restockMovement?.reason)).toContain('Reso reale');
  });

  it('solo stato rimborsato senza evento restock: nessun carico', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());
    await service.handle(fulfilledEvent());
    await service.handle(
      createdEvent({ type: OnlineOrderEventType.online_order_refunded, lines: undefined }),
    );

    expect(level(db)).toMatchObject({ onHand: 8, committed: 0, available: 8 });
    expect(
      db.movements.filter((movement) => movement.type === StockMovementType.return),
    ).toHaveLength(0);
  });

  it('fallimento transazionale: nessun saldo parziale, nessun documento incompleto, nessun impegno consumato senza Vendita', async () => {
    const db = createFakeDb();
    seedOrder(db);
    seedLevel(db, 10);
    const service = createService(db);

    await service.handle(createdEvent());

    // Il Corrispettivo (ultimo passo della transazione) fallisce.
    const originalCreate = db.tx.corrispettivoEntry.create;
    db.tx.corrispettivoEntry.create = () =>
      Promise.reject(new Error('DB error simulato sul Corrispettivo'));

    await expect(service.handle(fulfilledEvent())).rejects.toThrow('DB error simulato');

    // Rollback completo: saldi come prima dell'evento, nessun oggetto orfano.
    expect(level(db)).toMatchObject({ onHand: 10, committed: 2, available: 8 });
    expect(db.onlineSales).toHaveLength(0);
    expect(db.onlineSaleLines).toHaveLength(0);
    expect(db.corrispettivi).toHaveLength(0);
    expect(db.movements).toHaveLength(0);
    expect(db.reservations[0]?.status).toBe(ReservationStatus.active);
    expect(db.reservations[0]?.remainingQuantity).toBe(2);
    // Anche l'evento canonico è annullato: il retry può riprocessare.
    expect(
      db.orderEvents.filter(
        (event) => event.type === OnlineOrderEventType.online_order_fulfilled,
      ),
    ).toHaveLength(0);

    // Il retry dopo il ripristino va a buon fine.
    db.tx.corrispettivoEntry.create = originalCreate;
    const retry = await service.handle(fulfilledEvent());
    expect(retry).toBe('applied');
    expect(level(db)).toMatchObject({ onHand: 8, committed: 0, available: 8 });
    expect(db.onlineSales).toHaveLength(1);
    expect(db.corrispettivi).toHaveLength(1);
  });

  it('ordine storico senza impegni attivi: Vendita e Corrispettivo registrati ma nessun effetto magazzino', async () => {
    const db = createFakeDb();
    seedOrder(db);
    const order = db.orders.get('order-1');
    if (order) {
      order.fulfillmentStatus = SalesOrderFulfillmentStatus.fulfilled;
    }
    seedLevel(db, 10);
    const service = createService(db);

    // created su ordine già evaso: nessun impegno (guardia fase 1).
    await service.handle(createdEvent());
    await service.handle(fulfilledEvent());

    expect(db.onlineSales).toHaveLength(1);
    expect(db.onlineSales[0]?.inventoryStatus).toBe(OnlineSaleInventoryStatus.not_applied);
    expect(db.movements).toHaveLength(0);
    expect(level(db)).toMatchObject({ onHand: 10, committed: 0, available: 10 });
    expect(db.corrispettivi).toHaveLength(1);
  });
});
