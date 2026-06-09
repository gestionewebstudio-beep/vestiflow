import type { EntityId, IsoDateString, Money } from '@core/models/common.model';
import type { SalesOrder, SalesOrderLine } from '@core/models/sales-order.model';
import {
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
} from '@core/models/sales-order.model';
import { ShopifySyncStatus } from '@core/models/shopify.model';
import { DEFAULT_CURRENCY, moneyFromMajor } from '@core/utils/money.util';

// Dataset mock vendite (tenant-aware). Snapshot sku/title/customerName sempre
// valorizzati. Le righe referenziano varianti/SKU dei prodotti mock esistenti.
// NB temporaneo: customerId e storeId puntano a id convenzionali; i mock di
// Customer/Store non esistono ancora.

const TENANT_ID: EntityId = 'tenant-demo';

// Righe: snapshot espliciti; lineTotal = unitPrice × quantity (via minor units).
function line(
  id: string,
  variantId: EntityId,
  sku: string,
  title: string,
  quantity: number,
  unitMajor: number,
): SalesOrderLine {
  const unitPrice = moneyFromMajor(unitMajor, DEFAULT_CURRENCY);
  return {
    id,
    variantId,
    sku,
    title,
    quantity,
    unitPrice,
    lineTotal: { amountMinor: unitPrice.amountMinor * quantity, currencyCode: DEFAULT_CURRENCY },
  };
}

// Subtotale/totale dalla somma delle righe (no tasse/spedizioni in questa fase).
function sumTotal(lines: readonly SalesOrderLine[]): Money {
  const amountMinor = lines.reduce((acc, l) => acc + l.lineTotal.amountMinor, 0);
  return { amountMinor, currencyCode: DEFAULT_CURRENCY };
}

interface OrderSeed {
  readonly id: string;
  readonly orderNumber: string;
  readonly financialStatus: SalesOrder['financialStatus'];
  readonly fulfillmentStatus: SalesOrder['fulfillmentStatus'];
  readonly source: SalesOrder['source'];
  readonly customerId?: EntityId;
  readonly customerName: string;
  readonly customerEmail?: string;
  readonly storeId?: EntityId;
  readonly lines: readonly SalesOrderLine[];
  readonly placedAt: IsoDateString;
  readonly shopifyId?: string;
}

const SEEDS: readonly OrderSeed[] = [
  // 1) paid + fulfilled · online · con cliente
  {
    id: 'so-1001',
    orderNumber: '#1001',
    financialStatus: SalesOrderFinancialStatus.Paid,
    fulfillmentStatus: SalesOrderFulfillmentStatus.Fulfilled,
    source: SalesOrderSource.Online,
    customerId: 'cust-001',
    customerName: 'Giulia Bianchi',
    customerEmail: 'giulia.bianchi@example.com',
    lines: [
      line(
        'so-1001-l1',
        'tee-basic-m-bia',
        'TEE-BASIC-M-BIA',
        'T-shirt Basic · M / Bianco',
        2,
        19.9,
      ),
      line('so-1001-l2', 'jeans-slim-m-blu', 'JEANS-SLIM-M-BLU', 'Jeans Slim · M / Blu', 1, 79.9),
    ],
    placedAt: '2026-05-28T09:15:00.000Z',
    shopifyId: 'gid://shopify/Order/5001',
  },
  // 2) pending + unfulfilled · online · guest
  {
    id: 'so-1002',
    orderNumber: '#1002',
    financialStatus: SalesOrderFinancialStatus.Pending,
    fulfillmentStatus: SalesOrderFulfillmentStatus.Unfulfilled,
    source: SalesOrderSource.Online,
    customerName: 'Cliente occasionale',
    lines: [
      line(
        'so-1002-l1',
        'sneaker-run-42-bia',
        'SNEAKER-RUN-42-BIA',
        'Sneaker Running · 42 / Bianco',
        1,
        89.9,
      ),
    ],
    placedAt: '2026-05-30T14:40:00.000Z',
    shopifyId: 'gid://shopify/Order/5002',
  },
  // 3) paid + partial · pos · con cliente (negozio Napoli)
  {
    id: 'so-1003',
    orderNumber: '#1003',
    financialStatus: SalesOrderFinancialStatus.Paid,
    fulfillmentStatus: SalesOrderFulfillmentStatus.Partial,
    source: SalesOrderSource.Pos,
    customerId: 'cust-002',
    customerName: 'Marco Rossi',
    customerEmail: 'marco.rossi@example.com',
    storeId: 'store-napoli',
    lines: [
      line(
        'so-1003-l1',
        'tee-stripe-l-ros',
        'TEE-STRIPE-L-ROS',
        'T-shirt Righe · L / Rosso',
        3,
        24.9,
      ),
      line(
        'so-1003-l2',
        'hoodie-felpa-l-ner',
        'HOODIE-FELPA-L-NER',
        'Felpa con Cappuccio · L / Nero',
        1,
        54.9,
      ),
    ],
    placedAt: '2026-06-01T17:05:00.000Z',
    shopifyId: 'gid://shopify/Order/5003',
  },
  // 4) partially_refunded · online · con cliente
  {
    id: 'so-1004',
    orderNumber: '#1004',
    financialStatus: SalesOrderFinancialStatus.PartiallyRefunded,
    fulfillmentStatus: SalesOrderFulfillmentStatus.Fulfilled,
    source: SalesOrderSource.Online,
    customerId: 'cust-003',
    customerName: 'Elena Verdi',
    customerEmail: 'elena.verdi@example.com',
    lines: [
      line('so-1004-l1', 'jeans-slim-m-blu', 'JEANS-SLIM-M-BLU', 'Jeans Slim · M / Blu', 2, 79.9),
    ],
    placedAt: '2026-06-02T10:20:00.000Z',
    shopifyId: 'gid://shopify/Order/5004',
  },
  // 5) refunded · pos · guest (negozio Milano)
  {
    id: 'so-1005',
    orderNumber: '#1005',
    financialStatus: SalesOrderFinancialStatus.Refunded,
    fulfillmentStatus: SalesOrderFulfillmentStatus.Fulfilled,
    source: SalesOrderSource.Pos,
    customerName: 'Vendita al banco',
    storeId: 'store-milano',
    lines: [
      line(
        'so-1005-l1',
        'tee-basic-m-bia',
        'TEE-BASIC-M-BIA',
        'T-shirt Basic · M / Bianco',
        1,
        19.9,
      ),
    ],
    placedAt: '2026-06-03T12:00:00.000Z',
    shopifyId: 'gid://shopify/Order/5005',
  },
  // 6) voided · online · guest (ordine annullato prima del pagamento)
  {
    id: 'so-1006',
    orderNumber: '#1006',
    financialStatus: SalesOrderFinancialStatus.Voided,
    fulfillmentStatus: SalesOrderFulfillmentStatus.Unfulfilled,
    source: SalesOrderSource.Online,
    customerName: 'Cliente occasionale',
    lines: [
      line(
        'so-1006-l1',
        'hoodie-felpa-l-ner',
        'HOODIE-FELPA-L-NER',
        'Felpa con Cappuccio · L / Nero',
        1,
        54.9,
      ),
    ],
    placedAt: '2026-06-04T08:30:00.000Z',
    shopifyId: 'gid://shopify/Order/5006',
  },
];

function buildOrder(seed: OrderSeed): SalesOrder {
  const total = sumTotal(seed.lines);
  return {
    id: seed.id,
    tenantId: TENANT_ID,
    orderNumber: seed.orderNumber,
    financialStatus: seed.financialStatus,
    fulfillmentStatus: seed.fulfillmentStatus,
    source: seed.source,
    currency: DEFAULT_CURRENCY,
    customerId: seed.customerId,
    customerName: seed.customerName,
    customerEmail: seed.customerEmail,
    storeId: seed.storeId,
    lines: seed.lines,
    subtotal: total,
    total,
    placedAt: seed.placedAt,
    shopify: { status: ShopifySyncStatus.Synced, shopifyId: seed.shopifyId },
    createdAt: seed.placedAt,
    updatedAt: seed.placedAt,
  };
}

/** Vendite mock (tenant-aware), ordinate per data discendente alla lettura nel service. */
export const MOCK_SALES_ORDERS: readonly SalesOrder[] = SEEDS.map(buildOrder);
