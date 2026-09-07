import { UnprocessableEntityException } from '@nestjs/common';
import { SupplierOrderStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { ShopifyShopChangeService } from './shopify-shop-change.service';

describe('ShopifyShopChangeService', () => {
  const tenantId = 'tenant-1';

  function createLocationMocks() {
    const shopifyLocation = {
      id: 'loc-shopify',
      name: 'Shop location',
      addressLine1: '123 Main St',
      shopifyLocationId: 'gid://shopify/Location/1',
      shopifyLastSyncAt: new Date('2026-01-01'),
      code: 'LOC-02',
    };
    const orphanLocation = {
      id: 'loc-orphan',
      name: 'Orphan',
      addressLine1: '456 Side St',
      shopifyLocationId: null,
      shopifyLastSyncAt: null,
      code: 'LOC-03',
    };

    return {
      shopifyLocation,
      orphanLocation,
      findMany: vi.fn().mockResolvedValue([shopifyLocation, orphanLocation]),
      delete: vi.fn().mockResolvedValue({ id: 'loc-shopify' }),
      update: vi.fn().mockResolvedValue({ id: 'loc-shopify' }),
    };
  }

  function createService() {
    const location = createLocationMocks();
    const tx = creaTx();
    tx.location = {
      findMany: location.findMany,
      delete: location.delete,
      update: location.update,
    };

    const prisma = {
      shopifyCredential: {
        findUnique: vi.fn().mockResolvedValue({ shopDomain: 'old.myshopify.com' }),
      },
      shopifyConnection: {
        findUnique: vi.fn(),
      },
      productVariant: {
        findMany: vi.fn().mockResolvedValue([{ id: 'var-1' }]),
        count: vi.fn().mockResolvedValue(1),
      },
      product: {
        count: vi.fn().mockResolvedValue(2),
        deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      customer: {
        count: vi.fn().mockResolvedValue(3),
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      salesOrder: {
        count: vi.fn().mockResolvedValue(4),
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      // Nessun impegno attivo, salvo dove un test lo imposta apposta.
      stockReservation: { count: vi.fn().mockResolvedValue(0) },
      inventoryLevel: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
      },
      stockMovement: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 6 }),
      },
      inventoryCountLine: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      inventoryCountSession: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      supplierOrder: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue({ name: 'Negozio test' }),
      },
      location,
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx)),
    };

    const service = new ShopifyShopChangeService(prisma as unknown as PrismaService);
    return { service, prisma, location, tx };
  }

  /*
    ⭐ **I mock della transazione sono ESPOSTI, non creati dentro `$transaction`.**
       Prima nascevano inline a ogni chiamata, quindi nessun test poteva chiedere
       loro se fossero stati invocati — e le prove che contano qui sono proprio
       quelle NEGATIVE: «questa cancellazione non deve essere avvenuta».

    ⚠️ Un mock non ispezionabile rende impossibile distinguere «non e' stato
       chiamato» da «non l'ho guardato», che e' esattamente il silenzio in cui il
       difetto e' vissuto per un mese.
  */
  function creaTx() {
    return {
      productVariant: { findMany: vi.fn().mockResolvedValue([{ id: 'var-1' }]) },
      inventoryCountLine: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      inventoryCountSession: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      stockMovement: {
        deleteMany: vi.fn().mockResolvedValue({ count: 6 }),
        count: vi.fn().mockResolvedValue(0),
      },
      inventoryLevel: {
        deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
        count: vi.fn().mockResolvedValue(0),
      },
      product: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      salesOrder: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
      customer: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
      supplierOrder: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      store: { findFirst: vi.fn().mockResolvedValue({ name: 'Negozio test' }) },
      location: {
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  /** Le entita' che nessun percorso Shopify puo' cancellare (decisioni di prodotto). */
  function attendiCatalogoEInventarioIntatti(
    tx: ReturnType<typeof creaTx>,
    location: ReturnType<typeof createLocationMocks>,
  ) {
    expect(tx.product.deleteMany).not.toHaveBeenCalled();
    expect(tx.inventoryLevel.deleteMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.deleteMany).not.toHaveBeenCalled();
    expect(tx.inventoryCountSession.deleteMany).not.toHaveBeenCalled();
    expect(tx.inventoryCountLine.deleteMany).not.toHaveBeenCalled();
    expect(tx.supplierOrder.deleteMany).not.toHaveBeenCalled();
    // Le sedi: ne' cancellate, ne' archiviate. Una sede e' un luogo del
    // gestionale, non un dato del canale.
    expect(tx.location.delete).not.toHaveBeenCalled();
    expect(tx.location.update).not.toHaveBeenCalled();
    expect(location.delete).not.toHaveBeenCalled();
    expect(location.update).not.toHaveBeenCalled();
  }

  it('preview restituisce conteggi e blockers', async () => {
    const { service } = createService();

    const preview = await service.preview(tenantId);

    expect(preview.currentShopDomain).toBe('old.myshopify.com');
    expect(preview.counts.shopifyProducts).toBe(2);
    expect(preview.counts.shopifyLinkedLocations).toBe(1);
    expect(preview.counts.removableShopifyLocations).toBe(2);
    expect(preview.blockers).toEqual([]);
  });

  /*
    ⛔ **La purga e' SOSPESA in ogni sua forma** — `docs/24` §1.14: nessuna
       funzione Shopify elimina clienti o ordini VestiFlow.

    ⚠️ **Qui c'erano dodici prove** che descrivevano il comportamento delle
       singole categorie: quali combinazioni riuscissero, che cosa rimuovessero,
       quali guardie le fermassero. Descrivevano una capacita' che non esiste
       piu', e tenerle avrebbe significato sorvegliare un contratto ritirato.

    ⭐ **Restano le tre domande che contano ancora**: che il rifiuto arrivi per
       OGNI combinazione, che arrivi PRIMA di qualunque accesso al database, e
       che il messaggio dica «sospesa» — cioe' che la capacita' tornera' in
       un'altra forma, non che sia vietata per sempre.
  */
  describe('la purga e` sospesa in ogni sua forma', () => {
    /** Le sette combinazioni non vuote delle tre categorie. */
    const COMBINAZIONI = Array.from({ length: 7 }, (_, n) => n + 1).map((maschera) => ({
      purgeCatalog: Boolean(maschera & 1),
      purgeCustomers: Boolean(maschera & 2),
      purgeOrders: Boolean(maschera & 4),
    }));

    it.each(COMBINAZIONI)(
      'rifiutata: catalogo=$purgeCatalog clienti=$purgeCustomers ordini=$purgeOrders',
      async (scelte) => {
        const { service, prisma, tx, location } = createService();

        await expect(
          service.purge(tenantId, { confirmShopDomain: 'old.myshopify.com', ...scelte }),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);

        /*
          ⭐ **Nessun accesso al database, di nessun tipo.** Non «nessuna
             scrittura»: nessuna LETTURA. Un rifiuto che arrivasse dopo una
             lettura sarebbe gia' un percorso che entra nella purga.
        */
        expect(prisma.shopifyCredential.findUnique).not.toHaveBeenCalled();
        expect(prisma.shopifyConnection.findUnique).not.toHaveBeenCalled();
        expect(prisma.stockReservation.count).not.toHaveBeenCalled();
        expect(prisma.salesOrder.count).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
        attendiCatalogoEInventarioIntatti(tx, location);
      },
    );

    it('il messaggio dice che e` sospesa, non che e` vietata per sempre', async () => {
      const { service } = createService();

      await expect(
        service.purge(tenantId, {
          confirmShopDomain: 'old.myshopify.com',
          purgeCatalog: false,
          purgeCustomers: true,
          purgeOrders: true,
        }),
      ).rejects.toThrow(/sospes/i);
    });

    it('il rifiuto precede il controllo del dominio', async () => {
      /*
        ⭐ **Come si prova**: con un dominio di conferma SBAGLIATO. Il controllo
           del dominio richiede una lettura della connessione; se il rifiuto lo
           precede, il messaggio parla della sospensione e non del dominio.
      */
      const { service } = createService();

      await expect(
        service.purge(tenantId, {
          confirmShopDomain: 'un-altro-negozio.myshopify.com',
          purgeCatalog: false,
          purgeCustomers: true,
          purgeOrders: true,
        }),
      ).rejects.toThrow(/sospes/i);
    });

    it('il rifiuto sta nel SERVIZIO, quindi vale anche per una chiamata diretta', async () => {
      /*
        ⚠️ Nasconderla nell'interfaccia proteggerebbe solo chi passa
           dall'interfaccia: il wizard non e' l'unico modo di arrivare qui.
      */
      const { service } = createService();

      for (const scelte of COMBINAZIONI) {
        await expect(
          service.purge(tenantId, { confirmShopDomain: 'old.myshopify.com', ...scelte }),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
      }
    });
  });



  it('preview segnala ordini fornitore aperti', async () => {
    const { service, prisma } = createService();
    prisma.supplierOrder.findMany.mockResolvedValue([
      { id: 'po-1', reference: 'OF-2026-0001' },
    ]);

    const preview = await service.preview(tenantId);

    expect(preview.blockers).toHaveLength(1);
    expect(preview.blockers[0]?.code).toBe('supplier_orders_open');
    expect(preview.blockers[0]?.references[0]?.reference).toBe('OF-2026-0001');
    expect(prisma.supplierOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: [SupplierOrderStatus.confirmed],
          },
        }),
      }),
    );
  });

});
