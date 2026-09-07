import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, SupplierOrderStatus } from '@prisma/client';
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

  it('purge richiede dominio corrispondente', async () => {
    const { service } = createService();

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'other.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  /*
    ⛔ **La rimozione del catalogo e' sospesa.** Cancellava prodotti collegati,
       giacenze, movimenti e righe di conteggio: l'opposto delle decisioni di
       prodotto, per cui la rimozione remota e' uno STATO del collegamento.

    ⚠️ Il rifiuto deve arrivare PRIMA di qualunque lettura o scrittura. Un
       rifiuto tardivo sarebbe gia' un percorso che entra nella purga, e
       basterebbe un `return` spostato per farlo diventare distruttivo di nuovo.
  */
  describe('purgeCatalog e` sospeso', () => {
    it('viene rifiutato prima di qualsiasi lettura o scrittura', async () => {
      const { service, prisma, tx, location } = createService();

      await expect(
        service.purge(tenantId, {
          confirmShopDomain: 'old.myshopify.com',
          purgeCatalog: true,
          purgeCustomers: false,
          purgeOrders: false,
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      // Nemmeno la lettura del dominio corrente: il rifiuto e' la prima cosa.
      expect(prisma.shopifyCredential.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      attendiCatalogoEInventarioIntatti(tx, location);
    });

    it('e` rifiutato anche insieme alle altre categorie, e anche col dominio giusto', async () => {
      const { service, prisma } = createService();

      for (const dto of [
        { purgeCatalog: true, purgeCustomers: true, purgeOrders: false },
        { purgeCatalog: true, purgeCustomers: false, purgeOrders: true },
        { purgeCatalog: true, purgeCustomers: true, purgeOrders: true },
      ]) {
        await expect(
          service.purge(tenantId, { confirmShopDomain: 'old.myshopify.com', ...dto }),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
      }

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('il messaggio dice perche` e cosa resta possibile', async () => {
      const { service } = createService();

      await expect(
        service.purge(tenantId, {
          confirmShopDomain: 'old.myshopify.com',
          purgeCatalog: true,
          purgeCustomers: false,
          purgeOrders: false,
        }),
      ).rejects.toThrow(/sospesa/i);
    });

    /*
      ⛔ **Una chiamata diretta all'endpoint non aggira la protezione**, e questa
         prova serve a dimostrare DOVE vive: nel servizio, non nel controller e
         non nel DTO.

         `ShopifyController.purgeShopifyData` inoltra il DTO cosi` com'e`
         (`return this.shopifyShopChange.purge(tenantId, dto)`) e il DTO valida
         solo che `purgeCatalog` sia un booleano. Quindi chi chiama l'endpoint
         con `curl` incontra lo stesso rifiuto di chi passa dall'interfaccia.

      ⚠️ Nascondere il comando nell'interfaccia sarebbe stato inutile: il difetto
         che ha distrutto i dati non e` passato da un pulsante nascosto, e la
         protezione che conta e` quella che il server applica da solo.
    */
    it('il rifiuto sta nel SERVIZIO, quindi vale anche per una chiamata diretta', async () => {
      const { service } = createService();
      const chiamataGrezza = {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: true,
        purgeCustomers: false,
        purgeOrders: false,
      };

      // Il controller fa esattamente questo, senza aggiungere né togliere nulla.
      await expect(service.purge(tenantId, chiamataGrezza)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });

  /*
    ⛔ **Qui c'era «purge elimina dati selezionati e location Shopify vuote»**,
       che asseriva `location.delete` chiamata due volte — cioe' verificava come
       corretto proprio il comportamento che ha distrutto i dati di un tenant.

    ⭐ Rimuovere clienti e ordini Shopify non tocca ne' il catalogo, ne'
       l'inventario, ne' le sedi.
  */
  describe('rimuovere clienti e ordini non tocca catalogo, inventario e sedi', () => {
    it('solo clienti', async () => {
      const { service, prisma, tx, location } = createService();
      /*
        Regola preesistente e corretta: i clienti Shopify non si rimuovono da
        soli se restano ordini Shopify che li referenziano. Qui non ce ne sono,
        cosi' la prova verifica cio' che deve verificare — che la purga dei soli
        clienti non tocchi inventario e sedi — e non inciampa in un altro rifiuto.
      */
      prisma.salesOrder.count.mockResolvedValue(0);

      const result = await service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: false,
      });

      expect(result.purged.customers).toBe(3);
      expect(result.purged.locations).toBe(0);
      expect(tx.customer.deleteMany).toHaveBeenCalledTimes(1);
      expect(tx.salesOrder.deleteMany).not.toHaveBeenCalled();
      attendiCatalogoEInventarioIntatti(tx, location);
    });

    it('solo ordini', async () => {
      const { service, tx, location } = createService();

      const result = await service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: false,
        purgeOrders: true,
      });

      expect(result.purged.salesOrders).toBe(4);
      expect(result.purged.locations).toBe(0);
      expect(tx.salesOrder.deleteMany).toHaveBeenCalledTimes(1);
      expect(tx.customer.deleteMany).not.toHaveBeenCalled();
      attendiCatalogoEInventarioIntatti(tx, location);
    });

    it('clienti e ordini insieme', async () => {
      const { service, tx, location } = createService();

      const result = await service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: true,
      });

      expect(result.purged.customers).toBe(3);
      expect(result.purged.salesOrders).toBe(4);
      expect(result.purged.locations).toBe(0);
      attendiCatalogoEInventarioIntatti(tx, location);
    });

    /*
      ⭐ **Il caso che ha prodotto il danno**: una sede collegata a Shopify che
         contiene articoli nati SOLO in VestiFlow. La vecchia pulizia cancellava
         giacenze e movimenti per SEDE, senza filtrare per variante: quegli
         articoli sparivano senza aver mai avuto a che fare col canale.
    */
    it('una sede Shopify con articoli solo VestiFlow non perde nulla', async () => {
      const { service, tx, location } = createService();
      // La sede E` collegata a Shopify — e` il caso peggiore, non uno facile.
      expect(location.shopifyLocation.shopifyLocationId).toBeTruthy();

      await service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: true,
      });

      attendiCatalogoEInventarioIntatti(tx, location);
      // E la sede non viene nemmeno ispezionata: la purga non la riguarda.
      expect(location.findMany).not.toHaveBeenCalled();
    });
  });

  /*
    ⛔ **La cascata che corrompe la giacenza senza cancellare nulla di visibile.**
       `StockReservation.order` e` `onDelete: Cascade`: cancellare un ordine
       Shopify porta via i suoi impegni SCAVALCANDO il servizio di dominio, che
       e` l'unico autorizzato a variare `committed` e `available`. Il risultato
       e` una giacenza disponibile piu` bassa del vero, per sempre.
  */
  it('purgeOrders e` rifiutato se restano impegni di magazzino attivi', async () => {
    const { service, prisma, tx } = createService();
    prisma.stockReservation.count.mockResolvedValue(21);

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: false,
        purgeOrders: true,
      }),
    ).rejects.toThrow(/impegni di magazzino/i);

    // Il rifiuto arriva prima della transazione: nessun ordine cancellato.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.salesOrder.deleteMany).not.toHaveBeenCalled();
  });

  it('purge blocca se manca connessione', async () => {
    const { service, prisma } = createService();
    prisma.shopifyCredential.findUnique.mockResolvedValue(null);
    prisma.shopifyConnection.findUnique.mockResolvedValue(null);

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: false,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('purge rifiuta se non e` selezionata alcuna categoria', async () => {
    const { service, prisma } = createService();

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: false,
        purgeOrders: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
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

  it('purge mappa vincoli FK Prisma in 422', async () => {
    const { service, prisma } = createService();
    const fkError = new Prisma.PrismaClientKnownRequestError('FK', {
      code: 'P2003',
      clientVersion: 'test',
    });
    prisma.$transaction.mockRejectedValue(fkError);

    await expect(
      service.purge(tenantId, {
        confirmShopDomain: 'old.myshopify.com',
        purgeCatalog: false,
        purgeCustomers: true,
        purgeOrders: true,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
