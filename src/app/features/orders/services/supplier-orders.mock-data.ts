import type { EntityId, Money } from '@core/models/common.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import type { SupplierOrder, SupplierOrderLine } from '@core/models/supplier-order.model';
import { DEFAULT_CURRENCY, moneyFromMajor } from '@core/utils/money.util';

// Ordini fornitori mock (tenant-aware), coerenti con il catalogo varianti demo.
// Casi coperti: bozza, inviato, ricevuto parziale, ricevuto, annullato.

const TENANT_ID: EntityId = 'tenant-demo';

function line(
  id: string,
  variantId: EntityId,
  sku: string,
  ordered: number,
  received: number,
  unitCostMajor: number,
): SupplierOrderLine {
  return {
    id,
    variantId,
    sku,
    orderedQuantity: ordered,
    receivedQuantity: received,
    unitCost: moneyFromMajor(unitCostMajor, DEFAULT_CURRENCY),
  };
}

/** Totale ordine = somma (ordinato × costo unitario), in unità minori. */
function sumTotal(lines: readonly SupplierOrderLine[]): Money {
  const amountMinor = lines.reduce(
    (sum, current) => sum + current.orderedQuantity * current.unitCost.amountMinor,
    0,
  );
  return { amountMinor, currencyCode: DEFAULT_CURRENCY };
}

function order(seed: {
  readonly id: string;
  readonly reference: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly destinationLocationId: string;
  readonly status: SupplierOrderStatus;
  readonly lines: readonly SupplierOrderLine[];
  readonly expectedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}): SupplierOrder {
  return {
    tenantId: TENANT_ID,
    currency: DEFAULT_CURRENCY,
    totalAmount: sumTotal(seed.lines),
    ...seed,
  };
}

export const MOCK_SUPPLIER_ORDERS: readonly SupplierOrder[] = [
  order({
    id: 'po-0001',
    reference: 'PO-2026-0001',
    supplierId: 'sup-confezioni-sud',
    supplierName: 'Confezioni Sud SRL',
    destinationLocationId: '33333333-3333-4333-8333-333333333333',
    status: SupplierOrderStatus.Received,
    lines: [
      line('po-0001-l1', 'tee-basic-m-bia', 'TEE-BASIC-M-BIA', 40, 40, 7.5),
      line('po-0001-l2', 'tee-basic-s-ner', 'TEE-BASIC-S-NER', 20, 20, 7.5),
    ],
    expectedAt: '2026-05-25T00:00:00.000Z',
    createdAt: '2026-05-10T09:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
  }),
  order({
    id: 'po-0002',
    reference: 'PO-2026-0002',
    supplierId: 'sup-denim-co',
    supplierName: 'Denim Co Distribution',
    destinationLocationId: '44444444-4444-4444-8444-444444444444',
    status: SupplierOrderStatus.PartiallyReceived,
    lines: [
      line('po-0002-l1', 'jeans-slim-m-blu', 'JEANS-SLIM-M-BLU', 30, 18, 32),
      line('po-0002-l2', 'jeans-slim-l-ner', 'JEANS-SLIM-L-NER', 25, 0, 32),
    ],
    expectedAt: '2026-06-12T00:00:00.000Z',
    createdAt: '2026-05-20T11:30:00.000Z',
    updatedAt: '2026-06-05T15:00:00.000Z',
  }),
  order({
    id: 'po-0003',
    reference: 'PO-2026-0003',
    supplierId: 'sup-confezioni-sud',
    supplierName: 'Confezioni Sud SRL',
    destinationLocationId: '33333333-3333-4333-8333-333333333333',
    status: SupplierOrderStatus.Sent,
    lines: [
      line('po-0003-l1', 'tee-stripe-l-ros', 'TEE-STRIPE-L-ROS', 30, 0, 9.8),
      line('po-0003-l2', 'tee-stripe-m-blu', 'TEE-STRIPE-M-BLU', 30, 0, 9.8),
      line('po-0003-l3', 'short-mare-m-blu', 'SHORT-MARE-M-BLU', 24, 0, 11.2),
    ],
    expectedAt: '2026-06-20T00:00:00.000Z',
    createdAt: '2026-06-01T08:45:00.000Z',
    updatedAt: '2026-06-01T08:45:00.000Z',
  }),
  order({
    id: 'po-0004',
    reference: 'PO-2026-0004',
    supplierId: 'sup-passo',
    supplierName: 'Calzaturificio Passo',
    destinationLocationId: '44444444-4444-4444-8444-444444444444',
    status: SupplierOrderStatus.Draft,
    lines: [
      line('po-0004-l1', 'sneaker-run-42-bia', 'SNEAKER-RUN-42-BIA', 12, 0, 41),
      line('po-0004-l2', 'sneaker-low-43-ner', 'SNEAKER-LOW-43-NER', 12, 0, 36.5),
    ],
    createdAt: '2026-06-07T17:20:00.000Z',
    updatedAt: '2026-06-08T09:10:00.000Z',
  }),
  order({
    id: 'po-0005',
    reference: 'PO-2026-0005',
    supplierId: 'sup-denim-co',
    supplierName: 'Denim Co Distribution',
    destinationLocationId: '33333333-3333-4333-8333-333333333333',
    status: SupplierOrderStatus.Cancelled,
    lines: [line('po-0005-l1', 'jacket-denim-m-blu', 'JACKET-DENIM-M-BLU', 10, 0, 48)],
    expectedAt: '2026-06-05T00:00:00.000Z',
    createdAt: '2026-05-28T10:00:00.000Z',
    updatedAt: '2026-05-30T12:00:00.000Z',
  }),
];
