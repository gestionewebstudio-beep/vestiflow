import { describe, expect, it, vi } from 'vitest';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';
import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
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
    // Un articolo senza costo vale ZERO in colonna: `null` non esiste più.
    purchasePriceMinor: 0,
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
      purchasePriceMinor: 0,
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

  /**
   * Il titolare può negare a un dipendente la vista dei costi d'acquisto
   * (permesso `catalog.view_purchase_costs`). Il servizio non nasconde la
   * colonna: toglie il valore dalla RISPOSTA, perché una maschera solo lato UI
   * lascerebbe il costo leggibile nel traffico di rete.
   *
   * Senza questi test quel ramo non è coperto da nulla: una `select` ritoccata,
   * un campo economico aggiunto alla riga o un `showPurchaseCosts` perso in un
   * refactor rimetterebbero i costi nel JSON senza far diventare rosso niente —
   * il permesso smetterebbe di funzionare in silenzio, che è il modo peggiore in
   * cui può smettere di funzionare.
   */
  describe('costi d’acquisto e permesso catalog.view_purchase_costs', () => {
    // Sedi: senza accesso alle location lo scope svuoterebbe la lista e le
    // asserzioni sui costi passerebbero su zero righe, cioè su niente.
    const dipendenteSenzaCosti = testClerkUser({ hasAllLocationsAccess: true });
    const dipendenteConCosti = testClerkUser({
      hasAllLocationsAccess: true,
      permissions: [...dipendenteSenzaCosti.permissions, TenantPermission.CatalogViewPurchaseCosts],
    });

    /** Costo d'acquisto vero della variante `var-1` nel finto Prisma. */
    const costoVero = variantWithStock.purchasePriceMinor;

    async function situazione(user?: UserProfileDto) {
      const prisma = createPrismaMock();
      const service = new InventorySituationService(prisma as unknown as PrismaService);
      const result = await service.listSituation(tenantId, query(), user);
      // Guardia: una lista vuota renderebbe vere per vacuità tutte le
      // asserzioni sotto. Se questa cade, il test non stava provando nulla.
      expect(result.items).toHaveLength(2);
      return result;
    }

    it('il preset commesso non porta il permesso sui costi: è la fixture del ramo negato', () => {
      expect(dipendenteSenzaCosti.permissions).not.toContain(
        TenantPermission.CatalogViewPurchaseCosts,
      );
      expect(dipendenteConCosti.permissions).toContain(TenantPermission.CatalogViewPurchaseCosts);
    });

    it('con il permesso il costo d’acquisto arriva con il valore vero', async () => {
      const result = await situazione(dipendenteConCosti);

      expect(result.items[0]).toMatchObject({
        variantId: 'var-1',
        purchasePriceMinor: costoVero,
      });
      // Contraltare della verifica sul JSON nel test successivo: qui il numero
      // c'è davvero, quindi quel `not.toContain` è un rilevatore che sa
      // accendersi, non un'asserzione che passerebbe comunque.
      expect(JSON.stringify(result)).toContain(String(costoVero));
    });

    it('senza il permesso i costi d’acquisto non entrano nella risposta', async () => {
      const result = await situazione(dipendenteSenzaCosti);
      const riga = result.items[0];

      // Il campo resta nella forma della riga, ma svuotato: null, non assente.
      expect(riga).toHaveProperty('purchasePriceMinor', null);
      expect(result.items.map((row) => row.purchasePriceMinor)).toEqual([null, null]);

      // La maschera è chirurgica: tutto il resto della riga resta intero.
      expect(riga).toMatchObject({
        variantId: 'var-1',
        sellingPriceMinor: 4900,
        available: 3,
        supplierName: 'Manifattura Rossi',
        stockStatus: 'low',
      });

      // «Mascherato nella risposta, non solo nella UI»: il numero non deve
      // comparire da nessuna parte in ciò che l'API serializza.
      expect(JSON.stringify(result)).not.toContain(String(costoVero));
    });

    it('il titolare vede i costi anche con l’elenco permessi vuoto', async () => {
      // hasFullTenantAccess: per il titolare l'array salvato è vuoto per scelta,
      // non per dimenticanza — non deve valere come «nessun permesso».
      expect(ownerUser.permissions).toEqual([]);

      const result = await situazione(ownerUser);

      expect(result.items[0]).toMatchObject({ purchasePriceMinor: costoVero });
    });

    it('senza utente identificato i costi restano fuori (default nega)', async () => {
      const result = await situazione(undefined);

      expect(result.items[0]).toMatchObject({ purchasePriceMinor: null });
      expect(JSON.stringify(result)).not.toContain(String(costoVero));
    });
  });
});
