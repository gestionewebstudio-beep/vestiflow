import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';

import { StoreSaleLookupService } from './store-sale-lookup.service';

/**
 * Lookup di cassa: il permesso `retail.register` dice che si può battere uno
 * scontrino, non SU QUALE magazzino. La sede arriva dalla query, quindi la
 * verifica sta nel servizio — prima ancora della ricerca articolo.
 */

const TENANT = 'tenant-1';
const SEDE_ASSEGNATA = 'loc-assegnata';
const SEDE_ALTRUI = 'loc-altrui';

function createService() {
  const prisma = {
    productVariant: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'var-1',
          sku: 'SKU-1',
          barcode: '8000000000001',
          optionValues: [{ name: 'Taglia', value: 'M' }],
          sellingPriceMinor: 2990,
          currency: 'EUR',
          product: { name: 'Maglietta test', defaultVatCodeId: null },
        },
      ]),
    },
    inventoryLevel: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ variantId: 'var-1', onHand: 7, committed: 2, available: 5 }]),
    },
    tenantFeatureSettings: {
      findUnique: vi.fn().mockResolvedValue({ defaultVatCodeId: null }),
    },
    vatCode: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const service = new StoreSaleLookupService(prisma as unknown as PrismaService);
  return { service, prisma };
}

const query = (locationId: string) => ({ code: 'SKU-1', locationId });

describe('StoreSaleLookupService — la giacenza è quella della propria sede', () => {
  // Il commesso della fixture non ha sedi assegnate: senza questa esplicita
  // non si distinguerebbe «sede altrui» da «nessuna sede».
  const commesso = () => testClerkUser({ assignedLocationIds: [SEDE_ASSEGNATA] });

  it('nega la sede fuori dal proprio ambito, senza leggere articoli né giacenze', async () => {
    const { service, prisma } = createService();

    await expect(
      service.lookupItems(TENANT, query(SEDE_ALTRUI), commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Nessun effetto: il rifiuto arriva prima di qualunque query.
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    expect(prisma.inventoryLevel.findMany).not.toHaveBeenCalled();
  });

  it('consente la sede assegnata e restituisce le sue quantità', async () => {
    const { service, prisma } = createService();

    const rows = await service.lookupItems(TENANT, query(SEDE_ASSEGNATA), commesso());

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: 'SKU-1', onHand: 7, committed: 2, available: 5 });
    expect(prisma.inventoryLevel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ locationId: SEDE_ASSEGNATA }),
      }),
    );
  });

  it('consente qualunque sede a chi ha inventory.view_all_locations', async () => {
    const { service } = createService();
    const supervisore = testClerkUser({
      assignedLocationIds: [SEDE_ASSEGNATA],
      permissions: [TenantPermission.InventoryViewAllLocations],
    });

    await expect(service.lookupItems(TENANT, query(SEDE_ALTRUI), supervisore)).resolves.toHaveLength(
      1,
    );
  });

  it('consente qualunque sede a chi ha accesso a tutte le sedi', async () => {
    const { service } = createService();
    const multisede = testClerkUser({ hasAllLocationsAccess: true, assignedLocationIds: [] });

    await expect(service.lookupItems(TENANT, query(SEDE_ALTRUI), multisede)).resolves.toHaveLength(
      1,
    );
  });

  it('il titolare non è mai fermato: array permessi vuoto, accesso pieno', async () => {
    const { service } = createService();

    await expect(
      service.lookupItems(
        TENANT,
        query(SEDE_ALTRUI),
        testOwnerUser({ permissions: [], assignedLocationIds: [] }),
      ),
    ).resolves.toHaveLength(1);
  });

  /**
   * ⛔ **Qui c'erano DUE test che codificavano il difetto come contratto.**
   *
   * Il primo diceva «senza utente in contesto non decide: le chiamate interne
   * passano» — di chiamanti interni non ce n’erano. Il secondo, che l’aveva
   * sostituito il 28/08, ammetteva `undefined` esplicito.
   *
   * ⭐ Ora la firma e `user: UserProfileDto`: passare `undefined` **non
   * compila**, quindi non c’e piu niente da testare. Misurato che la rotta sta
   * sotto `JwtAuthGuard` senza `@Public()`, l'identita non puo essere assente.
   */

  // ⭐ Il caso REALE della rotta: un utente vero, una sede non sua.
  it('sede altrui: rifiuto, e nemmeno una query di prodotto o giacenza', async () => {
    const { service, prisma } = createService();

    await expect(
      service.lookupItems(TENANT, query(SEDE_ALTRUI), commesso()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    expect(prisma.inventoryLevel.findMany).not.toHaveBeenCalled();
  });
});
