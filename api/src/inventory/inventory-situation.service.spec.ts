import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { InventorySituationService } from './inventory-situation.service';
import type { ListInventorySituationQueryDto } from './dto/list-inventory-situation.query.dto';

describe('InventorySituationService', () => {
  const tenantId = 'tenant-1';
  const ownerUser = testOwnerUser();

  const variantWithStock = {
    id: 'var-1',
    productId: 'prod-1',
    sku: 'SKU-1',
    optionValues: [{ name: 'Taglia', value: 'M' }],
    currency: 'EUR',
    sellingPriceMinor: 4900,
    purchasePriceMinor: 2000,
    product: { name: 'Blazer', articleCode: '00001', category: 'Giacche' },
    supplierLinks: [
      {
        supplierId: 'sup-1',
        supplier: {
          party: {
            companyName: 'Manifattura Rossi',
            firstName: null,
            lastName: null,
            contactName: null,
            email: null,
          },
        },
      },
    ],
    inventoryLevels: [
      { available: 2, onHand: 3, committed: 1, incoming: 4, minThreshold: 5 },
      { available: 1, onHand: 1, committed: 0, incoming: 0, minThreshold: 0 },
    ],
  };

  const variantWithoutStock = {
    id: 'var-2',
    productId: 'prod-2',
    sku: null,
    optionValues: [],
    currency: 'EUR',
    sellingPriceMinor: 900,
    purchasePriceMinor: null,
    product: { name: 'Cintura', articleCode: '00002', category: null },
    supplierLinks: [],
    inventoryLevels: [],
  };

  function createPrismaMock() {
    return {
      location: {
        findMany: vi.fn().mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]),
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
      productVariant: {
        findMany: vi.fn().mockResolvedValue([variantWithStock, variantWithoutStock]),
      },
      stockMovement: { groupBy: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  }

  function query(overrides: Partial<ListInventorySituationQueryDto> = {}) {
    return { page: 1, pageSize: 20, ...overrides } as ListInventorySituationQueryDto;
  }

  it('aggrega le giacenze per variante e calcola lo stato scorte', async () => {
    const prisma = createPrismaMock();
    const service = new InventorySituationService(prisma as unknown as PrismaService);

    const result = await service.listSituation(tenantId, query(), ownerUser);

    expect(result.total).toBe(2);
    const [first, second] = result.items;
    expect(first).toMatchObject({
      variantId: 'var-1',
      title: 'Blazer — M',
      articleCode: '00001',
      supplierName: 'Manifattura Rossi',
      available: 3,
      onHand: 4,
      committed: 1,
      incoming: 4,
      minThreshold: 5,
      stockStatus: 'low',
    });
    expect(second).toMatchObject({
      variantId: 'var-2',
      available: 0,
      purchasePriceMinor: null,
      supplierId: null,
      stockStatus: 'empty',
    });
  });

  it('filtra per stato scorte dopo l’aggregazione', async () => {
    const prisma = createPrismaMock();
    const service = new InventorySituationService(prisma as unknown as PrismaService);

    const result = await service.listSituation(
      tenantId,
      query({ stockStatus: 'empty' }),
      ownerUser,
    );

    expect(result.total).toBe(1);
    expect(result.items.map((row) => row.variantId)).toEqual(['var-2']);
  });

  it('somma i movimenti in entrata e uscita per le varianti in pagina', async () => {
    const prisma = createPrismaMock();
    prisma.stockMovement.groupBy
      .mockResolvedValueOnce([{ variantId: 'var-1', _sum: { quantity: 10 } }])
      .mockResolvedValueOnce([
        { variantId: 'var-1', _sum: { quantity: 7 } },
        { variantId: 'var-2', _sum: { quantity: 2 } },
      ]);
    const service = new InventorySituationService(prisma as unknown as PrismaService);

    const result = await service.listSituation(tenantId, query(), ownerUser);

    const byId = new Map(result.items.map((row) => [row.variantId, row]));
    expect(byId.get('var-1')).toMatchObject({ totalIn: 10, totalOut: 7 });
    expect(byId.get('var-2')).toMatchObject({ totalIn: 0, totalOut: 2 });
  });

  it('senza location in scope restituisce lista vuota', async () => {
    const prisma = createPrismaMock();
    prisma.location.findMany.mockResolvedValue([]);
    const service = new InventorySituationService(prisma as unknown as PrismaService);

    const result = await service.listSituation(tenantId, query(), ownerUser);

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
  });
});
