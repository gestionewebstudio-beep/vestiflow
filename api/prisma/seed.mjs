// Seed di sviluppo: un tenant demo con location, prodotto e giacenze
// iniziali, così l'API è esplorabile da subito. Idempotente: si può
// rilanciare senza duplicare dati. NON eseguire in produzione reale.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

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

  await prisma.user.upsert({
    where: { id: '55555555-5555-4555-8555-555555555555' },
    update: {},
    create: {
      id: '55555555-5555-4555-8555-555555555555',
      tenantId: tenant.id,
      email: 'owner@demo-boutique.it',
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

  console.log('Seed completato: tenant', tenant.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
