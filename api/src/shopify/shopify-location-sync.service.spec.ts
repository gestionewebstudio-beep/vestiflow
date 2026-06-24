import { ShopifySyncStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import type { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyLocationSyncService } from './shopify-location-sync.service';

describe('ShopifyLocationSyncService', () => {
  const tenantId = 'tenant-1';
  const shopDomain = 'store.myshopify.com';
  const accessToken = 'token';

  function createService(options?: {
    shopifyLocations?: Array<{
      id: string | number;
      name: string;
      active?: boolean;
      address1?: string;
      city?: string;
      country_code?: string;
    }>;
    tenantLocations?: Array<Record<string, unknown>>;
    defaultStore?: { id: string } | null;
  }) {
    const shopifyLocations = options?.shopifyLocations ?? [
      {
        id: '1001',
        name: 'Negozio Napoli',
        active: true,
        address1: 'Via Roma 1',
        city: 'Napoli',
        country_code: 'IT',
      },
    ];
    const tenantLocations = options?.tenantLocations ?? [];
    const defaultStore = options?.defaultStore ?? { id: 'store-1' };
    const allLocations = [...tenantLocations];

    const locationUpdate = vi.fn().mockResolvedValue({});
    const locationCreate = vi.fn().mockResolvedValue({});
    const locationDelete = vi.fn().mockResolvedValue({});
    const locationFindMany = vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.code === 'LOC-01') {
        return Promise.resolve(
          allLocations.filter(
            (loc) => loc.code === 'LOC-01' && loc.shopifyLocationId == null,
          ),
        );
      }
      if (
        typeof where.shopifyLocationId === 'object' &&
        where.shopifyLocationId !== null &&
        'not' in where.shopifyLocationId
      ) {
        return Promise.resolve(allLocations.filter((loc) => loc.shopifyLocationId != null));
      }
      return Promise.resolve(allLocations);
    });

    const prisma = {
      location: {
        findMany: locationFindMany,
        update: locationUpdate,
        create: locationCreate,
        delete: locationDelete,
      },
      store: {
        findFirst: vi.fn().mockResolvedValue(defaultStore),
      },
      inventoryLevel: { count: vi.fn().mockResolvedValue(0) },
      stockMovement: { count: vi.fn().mockResolvedValue(0) },
      supplierOrder: { count: vi.fn().mockResolvedValue(0) },
      inventoryCountSession: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    const shopifyAdmin = {
      listLocations: vi.fn().mockResolvedValue(shopifyLocations),
    };

    const service = new ShopifyLocationSyncService(
      prisma as unknown as PrismaService,
      shopifyAdmin as unknown as ShopifyAdminClient,
    );

    return {
      service,
      prisma,
      shopifyAdmin,
      locationUpdate,
      locationCreate,
      locationDelete,
    };
  }

  it('collega location esistente per shopifyLocationId e aggiorna il nome', async () => {
    const { service, locationUpdate, locationCreate } = createService({
      tenantLocations: [
        {
          id: 'loc-1',
          tenantId,
          code: 'LOC-01',
          name: 'Nome onboarding errato',
          shopifyLocationId: '1001',
        },
      ],
    });

    const result = await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(result).toEqual({ matchedCount: 1, importedCount: 0, totalCount: 1 });
    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc-1' },
        data: expect.objectContaining({
          name: 'Negozio Napoli',
          shopifyLocationId: '1001',
          shopifySyncStatus: ShopifySyncStatus.synced,
        }),
      }),
    );
    expect(locationCreate).not.toHaveBeenCalled();
  });

  it('importa nuova location Shopify con codice LOC progressivo', async () => {
    const { service, locationCreate } = createService({
      tenantLocations: [{ id: 'loc-1', code: 'LOC-03', shopifyLocationId: null, name: 'Locale' }],
    });

    const result = await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(result.importedCount).toBe(1);
    expect(locationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          code: 'LOC-04',
          name: 'Negozio Napoli',
          shopifyLocationId: '1001',
          storeId: 'store-1',
        }),
      }),
    );
  });

  it('collega per nome quando shopifyLocationId manca lato VF', async () => {
    const { service, locationUpdate } = createService({
      tenantLocations: [
        {
          id: 'loc-local',
          code: 'LOC-02',
          name: 'Negozio Napoli',
          shopifyLocationId: null,
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'loc-local' } }),
    );
  });

  it('non collega automaticamente LOC-01 onboarding al primo match Shopify', async () => {
    const { service, locationCreate } = createService({
      tenantLocations: [
        {
          id: 'loc-onboarding',
          code: 'LOC-01',
          name: 'Sede temporanea',
          shopifyLocationId: null,
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationCreate).toHaveBeenCalled();
  });

  it('rimuove LOC-01 onboarding vuota dopo sync riuscito', async () => {
    const { service, locationDelete } = createService({
      tenantLocations: [
        {
          id: 'loc-onboarding',
          code: 'LOC-01',
          name: 'Sede temporanea',
          shopifyLocationId: null,
        },
        {
          id: 'loc-linked',
          code: 'LOC-02',
          name: 'Negozio Napoli',
          shopifyLocationId: '1001',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).toHaveBeenCalledWith({ where: { id: 'loc-onboarding' } });
  });

    it('elimina residui import non collegati dopo il sync', async () => {
      const { service, locationDelete } = createService({
        tenantLocations: [
          {
            id: 'loc-local',
            code: 'LOC-01',
            name: 'Negozio',
            shopifyLocationId: null,
            isActive: true,
          },
          {
            id: 'loc-residual',
            code: 'LOC-02',
            name: 'My Custom Location',
            shopifyLocationId: null,
            addressLine1: '123 Main St',
            isActive: true,
          },
        ],
      });

      await service.syncFromShopify(tenantId, shopDomain, accessToken);

      expect(locationDelete).toHaveBeenCalledWith({ where: { id: 'loc-residual' } });
    });

    it('elimina location Shopify stale senza dati operativi', async () => {
    const { service, locationDelete } = createService({
      shopifyLocations: [{ id: '1001', name: 'Negozio attivo', active: true }],
      tenantLocations: [
        {
          id: 'loc-stale',
          code: 'LOC-05',
          name: 'Magazzino chiuso',
          shopifyLocationId: '9999',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).toHaveBeenCalledWith({ where: { id: 'loc-stale' } });
  });

  it('scollega location Shopify stale ancora in uso', async () => {
    const { service, locationUpdate, locationDelete, prisma } = createService({
      shopifyLocations: [{ id: '1001', name: 'Negozio attivo', active: true }],
      tenantLocations: [
        {
          id: 'loc-busy',
          code: 'LOC-06',
          name: 'Negozio attivo',
          shopifyLocationId: '8888',
        },
      ],
    });

    vi.mocked(prisma.inventoryLevel.count).mockResolvedValue(3);

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).not.toHaveBeenCalled();
    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc-busy' },
        data: expect.objectContaining({
          isActive: false,
          shopifyLocationId: null,
          shopifySyncStatus: ShopifySyncStatus.not_connected,
        }),
      }),
    );
  });

  it('elimina tutte le location collegate quando Shopify non ne restituisce nessuna', async () => {
    const { service, locationDelete } = createService({
      shopifyLocations: [],
      tenantLocations: [
        {
          id: 'loc-stale',
          code: 'LOC-03',
          name: 'Snow City Warehouse',
          shopifyLocationId: '7777',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).toHaveBeenCalledWith({ where: { id: 'loc-stale' } });
  });

  it('normalizza GID Shopify nel confronto stale', async () => {
    const { service, locationDelete } = createService({
      shopifyLocations: [{ id: 1001, name: 'Negozio attivo', active: true }],
      tenantLocations: [
        {
          id: 'loc-stale',
          code: 'LOC-05',
          name: 'Snow City Warehouse',
          shopifyLocationId: 'gid://shopify/Location/9999',
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).toHaveBeenCalledWith({ where: { id: 'loc-stale' } });
  });

  it('disattiva location VF quando Shopify la segna come non attiva', async () => {
    const { service, locationUpdate, locationCreate } = createService({
      shopifyLocations: [{ id: '2002', name: 'Snow City Warehouse', active: false }],
      tenantLocations: [
        {
          id: 'loc-snow',
          code: 'LOC-03',
          name: 'Snow City Warehouse',
          shopifyLocationId: '2002',
          isActive: true,
        },
      ],
    });

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'loc-snow' },
        data: expect.objectContaining({
          name: 'Snow City Warehouse',
          isActive: false,
          shopifyLocationId: '2002',
        }),
      }),
    );
    expect(locationCreate).not.toHaveBeenCalled();
  });

  it('non elimina LOC-01 onboarding con inventario attivo', async () => {
    const { service, locationDelete, prisma } = createService({
      tenantLocations: [
        {
          id: 'loc-onboarding',
          code: 'LOC-01',
          name: 'Sede temporanea',
          shopifyLocationId: null,
        },
        {
          id: 'loc-linked',
          code: 'LOC-02',
          name: 'Negozio Napoli',
          shopifyLocationId: '1001',
        },
      ],
    });

    vi.mocked(prisma.inventoryLevel.count).mockResolvedValue(1);
    vi.mocked(prisma.inventoryCountSession.count).mockResolvedValue(0);

    await service.syncFromShopify(tenantId, shopDomain, accessToken);

    expect(locationDelete).not.toHaveBeenCalledWith({ where: { id: 'loc-onboarding' } });
  });
});
