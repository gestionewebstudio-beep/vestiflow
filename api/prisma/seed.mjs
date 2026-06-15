// Seed di sviluppo: tenant demo, location, prodotto, giacenze e utente Supabase Auth.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '55555555-5555-4555-8555-555555555555';
const DEMO_EMAIL = 'owner@demo-boutique.it';
const DEMO_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? 'DemoOwner2026!';

async function resolveAuthUserId() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn(
      'Seed auth: imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in api/.env per creare l utente login.',
    );
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: listed } = await admin.auth.admin.listUsers();
  const existing = listed?.users.find(
    (user) => user.email?.toLowerCase() === DEMO_EMAIL.toLowerCase(),
  );
  if (existing) {
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    console.warn(`Seed auth: ${error?.message ?? 'creazione utente fallita'}`);
    return null;
  }
  return data.user.id;
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, name: 'Demo Boutique' },
  });

  const store = await prisma.store.upsert({
    where: { id: '22222222-2222-4222-8222-222222222222' },
    update: {},
    create: {
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: tenant.id,
      name: 'Negozio Centro',
      code: 'NEG-01',
    },
  });

  const locationShop = await prisma.location.upsert({
    where: { id: '33333333-3333-4333-8333-333333333333' },
    update: {},
    create: {
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: tenant.id,
      storeId: store.id,
      name: 'Negozio Centro',
      code: 'LOC-NEG',
      city: 'Napoli',
      countryCode: 'IT',
    },
  });

  const locationWarehouse = await prisma.location.upsert({
    where: { id: '44444444-4444-4444-8444-444444444444' },
    update: {},
    create: {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: tenant.id,
      name: 'Magazzino Centrale',
      code: 'LOC-MAG',
      city: 'Napoli',
      countryCode: 'IT',
    },
  });

  const authUserId = await resolveAuthUserId();

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: { authUserId: authUserId ?? undefined },
    create: {
      id: USER_ID,
      tenantId: tenant.id,
      authUserId,
      email: DEMO_EMAIL,
      displayName: 'Anna Esposito',
      role: 'owner',
      stores: { create: { storeId: store.id } },
    },
  });

  const product = await prisma.product.upsert({
    where: { id: '66666666-6666-4666-8666-666666666666' },
    update: {},
    create: {
      id: '66666666-6666-4666-8666-666666666666',
      tenantId: tenant.id,
      name: 'T-shirt Basic Cotone',
      brand: 'VestiBrand',
      category: 'T-shirt',
      season: 'SS26',
      status: 'active',
      options: [
        { name: 'Taglia', values: ['S', 'M', 'L'] },
        { name: 'Colore', values: ['Bianco', 'Nero'] },
      ],
    },
  });

  const variants = [
    { suffix: 'S-WHT', size: 'S', color: 'Bianco' },
    { suffix: 'M-WHT', size: 'M', color: 'Bianco' },
    { suffix: 'L-WHT', size: 'L', color: 'Bianco' },
    { suffix: 'S-BLK', size: 'S', color: 'Nero' },
    { suffix: 'M-BLK', size: 'M', color: 'Nero' },
    { suffix: 'L-BLK', size: 'L', color: 'Nero' },
  ];

  for (const def of variants) {
    const sku = `TSB-${def.suffix}`;
    const variant = await prisma.productVariant.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku } },
      update: {},
      create: {
        tenantId: tenant.id,
        productId: product.id,
        sku,
        optionValues: [
          { name: 'Taglia', value: def.size },
          { name: 'Colore', value: def.color },
        ],
        currency: 'EUR',
        sellingPriceMinor: 1990,
        purchasePriceMinor: 750,
      },
    });

    for (const [locationId, quantity] of [
      [locationShop.id, 8],
      [locationWarehouse.id, 20],
    ]) {
      const existing = await prisma.inventoryLevel.findUnique({
        where: { variantId_locationId: { variantId: variant.id, locationId } },
      });
      if (existing) continue;
      // Giacenza iniziale con relativo movimento di carico: anche il seed
      // rispetta la regola "mai stock senza movimento".
      await prisma.$transaction([
        prisma.inventoryLevel.create({
          data: {
            tenantId: tenant.id,
            variantId: variant.id,
            locationId,
            onHand: quantity,
            available: quantity,
            minThreshold: 3,
          },
        }),
        prisma.stockMovement.create({
          data: {
            tenantId: tenant.id,
            type: 'load',
            origin: 'manual',
            variantId: variant.id,
            sku,
            locationId,
            quantity,
            reason: 'Carico iniziale (seed)',
            createdByName: 'Seed',
          },
        }),
      ]);
    }
  }

  const supplier = await prisma.supplier.upsert({
    where: { id: '77777777-7777-4777-8777-777777777777' },
    update: {},
    create: {
      id: '77777777-7777-4777-8777-777777777777',
      tenantId: tenant.id,
      name: 'Confezioni Sud SRL',
      email: 'ordini@confezionisud.it',
    },
  });

  const variantMWhite = await prisma.productVariant.findFirst({
    where: { tenantId: tenant.id, sku: 'TSB-M-WHT' },
    select: { id: true },
  });
  const variantSBlack = await prisma.productVariant.findFirst({
    where: { tenantId: tenant.id, sku: 'TSB-S-BLK' },
    select: { id: true },
  });
  const variantLWhite = await prisma.productVariant.findFirst({
    where: { tenantId: tenant.id, sku: 'TSB-L-WHT' },
    select: { id: true },
  });
  const variantMBlack = await prisma.productVariant.findFirst({
    where: { tenantId: tenant.id, sku: 'TSB-M-BLK' },
    select: { id: true },
  });
  const variantLBlack = await prisma.productVariant.findFirst({
    where: { tenantId: tenant.id, sku: 'TSB-L-BLK' },
    select: { id: true },
  });

  if (variantMWhite && variantSBlack) {
    const line1Total = 30 * 750;
    const line2Total = 20 * 750;
    await prisma.supplierOrder.upsert({
      where: {
        tenantId_reference: { tenantId: tenant.id, reference: 'PO-2026-0001' },
      },
      update: {},
      create: {
        id: '88888888-8888-4888-8888-888888888888',
        tenantId: tenant.id,
        reference: 'PO-2026-0001',
        supplierId: supplier.id,
        supplierName: supplier.name,
        destinationLocationId: locationWarehouse.id,
        status: 'received',
        currency: 'EUR',
        totalMinor: line1Total + line2Total,
        expectedAt: new Date('2026-06-01'),
        lines: {
          create: [
            {
              id: '99999999-9999-4999-8999-999999999991',
              variantId: variantMWhite.id,
              sku: 'TSB-M-WHT',
              orderedQuantity: 30,
              receivedQuantity: 30,
              unitCostMinor: 750,
            },
            {
              id: '99999999-9999-4999-8999-999999999992',
              variantId: variantSBlack.id,
              sku: 'TSB-S-BLK',
              orderedQuantity: 20,
              receivedQuantity: 20,
              unitCostMinor: 750,
            },
          ],
        },
      },
    });

    await prisma.supplierOrder.upsert({
      where: {
        tenantId_reference: { tenantId: tenant.id, reference: 'PO-2026-0002' },
      },
      update: {},
      create: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        tenantId: tenant.id,
        reference: 'PO-2026-0002',
        supplierId: supplier.id,
        supplierName: supplier.name,
        destinationLocationId: locationShop.id,
        status: 'partially_received',
        currency: 'EUR',
        totalMinor: 15 * 750,
        expectedAt: new Date('2026-06-20'),
        lines: {
          create: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              variantId: variantMWhite.id,
              sku: 'TSB-M-WHT',
              orderedQuantity: 15,
              receivedQuantity: 8,
              unitCostMinor: 750,
            },
          ],
        },
      },
    });
  }

  const demoCustomers = [
    {
      id: 'c0011111-1111-4111-8111-111111111001',
      firstName: 'Giulia',
      lastName: 'Bianchi',
      email: 'giulia.bianchi@example.com',
      phone: '+39 333 1234567',
      addressLine1: 'Via Toledo 45',
      city: 'Napoli',
      province: 'NA',
      postalCode: '80134',
      countryCode: 'IT',
      shopifyCustomerId: 'gid://shopify/Customer/1001',
    },
    {
      id: 'c0022222-2222-4222-8222-222222222002',
      firstName: 'Marco',
      lastName: 'Rossi',
      email: 'marco.rossi@example.com',
      phone: '+39 340 7654321',
      addressLine1: 'Corso Buenos Aires 12',
      city: 'Milano',
      province: 'MI',
      postalCode: '20124',
      countryCode: 'IT',
      notes: 'Preferisce ritiro in negozio.',
      shopifyCustomerId: 'gid://shopify/Customer/1002',
    },
    {
      id: 'c0033333-3333-4333-8333-333333333003',
      firstName: 'Elena',
      lastName: 'Verdi',
      email: 'elena.verdi@example.com',
      addressLine1: 'Via del Corso 101',
      city: 'Roma',
      province: 'RM',
      postalCode: '00186',
      countryCode: 'IT',
      shopifyCustomerId: 'gid://shopify/Customer/1003',
    },
    {
      id: 'c0044444-4444-4444-8444-444444444004',
      firstName: 'Luca',
      lastName: 'Esposito',
      email: 'luca.esposito@example.com',
      phone: '+39 328 9988776',
    },
    {
      id: 'c0055555-5555-4555-8555-555555555005',
      firstName: 'Sara',
      lastName: 'Romano',
      email: 'sara.romano@example.com',
      notes: 'Iscritta alla newsletter; taglia abituale S.',
    },
    {
      id: 'c0066666-6666-4666-8666-666666666006',
      firstName: 'Davide',
      lastName: 'Greco',
      phone: '+39 347 1122334',
    },
    {
      id: 'c0077777-7777-4777-8777-777777777007',
      firstName: 'Francesca',
      lastName: 'Marini',
      email: 'francesca.marini@example.com',
      phone: '+39 366 5566778',
      addressLine1: 'Via Indipendenza 8',
      city: 'Bologna',
      province: 'BO',
      postalCode: '40121',
      countryCode: 'IT',
    },
    {
      id: 'c0088888-8888-4888-8888-888888888008',
      firstName: 'Antonio',
      lastName: 'Ferrara',
      email: 'antonio.ferrara@example.com',
      notes: 'Cliente storico del negozio di Napoli.',
    },
  ];

  for (const customer of demoCustomers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      update: {},
      create: { tenantId: tenant.id, ...customer },
    });
  }

  const salesOrderIds = [
    's0011111-1111-4111-8111-111111111001',
    's0022222-2222-4222-8222-222222222002',
    's0033333-3333-4333-8333-333333333003',
    's0044444-4444-4444-8444-444444444004',
    's0055555-5555-4555-8555-555555555005',
    's0066666-6666-4666-8666-666666666006',
  ];
  await prisma.salesOrder.deleteMany({ where: { id: { in: salesOrderIds } } });

  const demoSalesOrders = [
    {
      id: salesOrderIds[0],
      orderNumber: '#1001',
      source: 'shopify_online',
      financialStatus: 'paid',
      fulfillmentStatus: 'fulfilled',
      customerId: 'c0011111-1111-4111-8111-111111111001',
      customerName: 'Giulia Bianchi',
      subtotalMinor: 3980 + 1990,
      totalMinor: 3980 + 1990,
      placedAt: new Date('2026-05-28T09:15:00.000Z'),
      shopifyOrderId: 'gid://shopify/Order/5001',
      lines: [
        {
          id: 'sl001111-1111-4111-8111-111111111001',
          variantId: variantMWhite?.id ?? null,
          sku: 'TSB-M-WHT',
          title: 'T-shirt Basic Cotone — M / Bianco',
          quantity: 2,
          unitPriceMinor: 1990,
          totalMinor: 3980,
        },
        {
          id: 'sl001111-1111-4111-8111-111111111002',
          variantId: variantMBlack?.id ?? null,
          sku: 'TSB-M-BLK',
          title: 'T-shirt Basic Cotone — M / Nero',
          quantity: 1,
          unitPriceMinor: 1990,
          totalMinor: 1990,
        },
      ],
    },
    {
      id: salesOrderIds[1],
      orderNumber: '#1002',
      source: 'shopify_online',
      financialStatus: 'pending',
      fulfillmentStatus: 'unfulfilled',
      customerName: 'Cliente occasionale',
      subtotalMinor: 8990,
      totalMinor: 8990,
      placedAt: new Date('2026-05-30T14:40:00.000Z'),
      shopifyOrderId: 'gid://shopify/Order/5002',
      lines: [
        {
          id: 'sl002222-2222-4222-8222-222222222001',
          variantId: null,
          sku: 'SNEAKER-RUN-42-BIA',
          title: 'Sneaker Running · 42 / Bianco',
          quantity: 1,
          unitPriceMinor: 8990,
          totalMinor: 8990,
        },
      ],
    },
    {
      id: salesOrderIds[2],
      orderNumber: '#1003',
      source: 'shopify_pos',
      financialStatus: 'paid',
      fulfillmentStatus: 'partially_fulfilled',
      customerId: 'c0022222-2222-4222-8222-222222222002',
      customerName: 'Marco Rossi',
      subtotalMinor: 2490 * 3 + 5490,
      totalMinor: 2490 * 3 + 5490,
      placedAt: new Date('2026-06-01T17:05:00.000Z'),
      shopifyOrderId: 'gid://shopify/Order/5003',
      lines: [
        {
          id: 'sl003333-3333-4333-8333-333333333001',
          variantId: variantLWhite?.id ?? null,
          sku: 'TSB-L-WHT',
          title: 'T-shirt Basic Cotone — L / Bianco',
          quantity: 3,
          unitPriceMinor: 2490,
          totalMinor: 7470,
        },
        {
          id: 'sl003333-3333-4333-8333-333333333002',
          variantId: variantLBlack?.id ?? null,
          sku: 'TSB-L-BLK',
          title: 'T-shirt Basic Cotone — L / Nero',
          quantity: 1,
          unitPriceMinor: 5490,
          totalMinor: 5490,
        },
      ],
    },
    {
      id: salesOrderIds[3],
      orderNumber: '#1004',
      source: 'shopify_online',
      financialStatus: 'partially_refunded',
      fulfillmentStatus: 'fulfilled',
      customerId: 'c0033333-3333-4333-8333-333333333003',
      customerName: 'Elena Verdi',
      subtotalMinor: 7990 * 2,
      totalMinor: 7990 * 2,
      placedAt: new Date('2026-06-02T10:20:00.000Z'),
      shopifyOrderId: 'gid://shopify/Order/5004',
      lines: [
        {
          id: 'sl004444-4444-4444-8444-444444444001',
          variantId: variantMBlack?.id ?? null,
          sku: 'TSB-M-BLK',
          title: 'T-shirt Basic Cotone — M / Nero',
          quantity: 2,
          unitPriceMinor: 7990,
          totalMinor: 15980,
        },
      ],
    },
    {
      id: salesOrderIds[4],
      orderNumber: '#1005',
      source: 'shopify_pos',
      financialStatus: 'refunded',
      fulfillmentStatus: 'fulfilled',
      customerName: 'Vendita al banco',
      subtotalMinor: 1990,
      totalMinor: 1990,
      placedAt: new Date('2026-06-03T12:00:00.000Z'),
      shopifyOrderId: 'gid://shopify/Order/5005',
      lines: [
        {
          id: 'sl005555-5555-4555-8555-555555555001',
          variantId: variantMWhite?.id ?? null,
          sku: 'TSB-M-WHT',
          title: 'T-shirt Basic Cotone — M / Bianco',
          quantity: 1,
          unitPriceMinor: 1990,
          totalMinor: 1990,
        },
      ],
    },
    {
      id: salesOrderIds[5],
      orderNumber: '#1006',
      source: 'shopify_online',
      financialStatus: 'voided',
      fulfillmentStatus: 'unfulfilled',
      customerName: 'Cliente occasionale',
      subtotalMinor: 5490,
      totalMinor: 5490,
      placedAt: new Date('2026-06-04T08:30:00.000Z'),
      shopifyOrderId: 'gid://shopify/Order/5006',
      lines: [
        {
          id: 'sl006666-6666-4666-8666-666666666001',
          variantId: variantLBlack?.id ?? null,
          sku: 'TSB-L-BLK',
          title: 'T-shirt Basic Cotone — L / Nero',
          quantity: 1,
          unitPriceMinor: 5490,
          totalMinor: 5490,
        },
      ],
    },
  ];

  for (const order of demoSalesOrders) {
    const { lines, ...orderData } = order;
    await prisma.salesOrder.create({
      data: {
        tenantId: tenant.id,
        currency: 'EUR',
        ...orderData,
        lines: { create: lines },
      },
    });
  }

  console.log('Seed completato: tenant', tenant.id);
  if (authUserId) {
    console.log(`Login demo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
