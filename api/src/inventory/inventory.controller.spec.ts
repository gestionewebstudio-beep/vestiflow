import { describe, expect, it, vi } from 'vitest';




import { testOwnerUser } from '../test/fixtures/user-profile.fixture';

import type { InventoryCountService } from './inventory-count.service';

import type { InventoryExportService } from './inventory-export.service';

import type { InventoryImportService } from './inventory-import.service';

import type { InventoryService } from './inventory.service';

import { InventoryController } from './inventory.controller';



describe('InventoryController', () => {

  const tenantId = 'tenant-1';

  const user = testOwnerUser();

  const inventory = {

    listLocations: vi.fn(),

    listLevels: vi.fn(),

    listMovements: vi.fn(),

    registerMovement: vi.fn(),

  };

  const inventoryCount = {

    list: vi.fn(),

    create: vi.fn(),

    getById: vi.fn(),

    deleteCancelled: vi.fn(),

  };

  const inventoryExport = { exportCsv: vi.fn() };

  const inventoryImport = { previewCsv: vi.fn(), importCsv: vi.fn() };



  const stockReservations = { listActiveForLevel: vi.fn().mockResolvedValue([]) };

  const controller = new InventoryController(
    inventory as unknown as InventoryService,
    inventoryCount as unknown as InventoryCountService,
    inventoryExport as unknown as InventoryExportService,
    inventoryImport as unknown as InventoryImportService,
    {} as never,
    {} as never,
    {} as never,
    stockReservations as never,
  );

  /**
   * ⛔ **La rotta deve PROPAGARE l’utente al servizio.**
   *
   * Misurato il 28/08/2026: la guardia di sede viveva nel servizio, era
   * coperta da cinque prove verdi, e questa rotta — il suo unico chiamante
   * di produzione — non le passava l’utente. La porta era aperta e la suite
   * verde, perché nessun test guardava il LIVELLO in cui il difetto stava.
   *
   * ⚠️ Il tipo obbliga a passare un argomento, ma `undefined` compila lo
   * stesso: senza questa prova, chi «sistema» l’errore del compilatore
   * scrivendo `undefined` riapre il buco e non se ne accorge nessuno.
   */
  it('listReservations propaga l’utente al servizio impegni', async () => {
    await controller.listReservations(tenantId, user, {
      variantId: 'var-1',
      locationId: 'loc-altrui',
    } as never);

    expect(stockReservations.listActiveForLevel).toHaveBeenCalledWith(
      tenantId,
      'var-1',
      'loc-altrui',
      user,
    );
  });

  /**
   * ⛔ **Anche l’anteprima import deve propagare l’utente.**
   *
   * È la terza rotta di questo controller su cui vale la stessa regola, e la
   * quarta volta nel backend: un test di servizio verde non dimostra che la
   * rotta sia protetta. Qui l’anteprima restituisce la Disponibile per riga.
   */
  it('previewLevelsImport propaga l’utente al servizio import', async () => {
    const file = { buffer: Buffer.from('SKU,Location,Disponibile'), mimetype: 'text/csv' };
  
    await controller.previewLevelsImport(tenantId, user, file as never);
  
    expect(inventoryImport.previewCsv).toHaveBeenCalledWith(
      tenantId,
      expect.any(String),
      user,
    );
  });



  it('listLocations delega al service con tenantId', async () => {

    inventory.listLocations.mockResolvedValue([{ id: 'loc-1', name: 'Shop' }]);



    await expect(controller.listLocations(tenantId)).resolves.toEqual([

      { id: 'loc-1', name: 'Shop' },

    ]);

    expect(inventory.listLocations).toHaveBeenCalledWith(tenantId);

  });



  it('listLevels delega al service con query', async () => {

    const query = { page: 1, pageSize: 20 };

    inventory.listLevels.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });



    await controller.listLevels(tenantId, user, query);



    expect(inventory.listLevels).toHaveBeenCalledWith(tenantId, query, user);

  });



  it('registerMovement passa displayName utente al service', async () => {

    const dto = {

      type: 'load',

      variantId: 'var-1',

      locationId: 'loc-1',

      quantity: 2,

    };

    inventory.registerMovement.mockResolvedValue({ id: 'mov-1' });



    await controller.registerMovement(tenantId, user, dto as never);



    expect(inventory.registerMovement).toHaveBeenCalledWith(

      tenantId,

      dto,

      user.displayName,

      user.id,

      user,

    );

  });



  it('listMovements delega al service', async () => {

    const query = { page: 1, pageSize: 20 };

    inventory.listMovements.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });



    await controller.listMovements(tenantId, user, query);



    expect(inventory.listMovements).toHaveBeenCalledWith(tenantId, query, user);

  });



  it('exportLevelsCsv restituisce StreamableFile', async () => {

    inventoryExport.exportCsv.mockResolvedValue('sku,qty\n');



    const file = await controller.exportLevelsCsv(tenantId, user, {});



    expect(inventoryExport.exportCsv).toHaveBeenCalledWith(tenantId, {}, user);

    expect(file.options.disposition).toContain('giacenze-vestiflow');

  });



  it('previewLevelsImport rifiuta file CSV mancante', () => {

    expect(() => controller.previewLevelsImport(tenantId, user, undefined as never)).toThrow(

      'File CSV mancante o vuoto.',

    );

  });



  it('importLevels delega a inventoryImport.importCsv', async () => {

    const file = {

      buffer: Buffer.from('SKU,Location,Disponibile\n', 'utf8'),

      originalname: 'levels.csv',

      mimetype: 'text/csv',

    } as Express.Multer.File;

    inventoryImport.importCsv.mockResolvedValue({

      updated: 1,

      unchanged: 0,

      skipped: 0,

      failed: 0,

    });



    await controller.importLevels(tenantId, user, file, { keys: ['sku|loc'] });



    expect(inventoryImport.importCsv).toHaveBeenCalledWith(

      tenantId,

      'SKU,Location,Disponibile\n',

      user,

      { keys: ['sku|loc'] },

    );

  });



  it('createCount delega al service conteggi', async () => {

    const dto = { locationId: 'loc-1', name: 'Conteggio' };

    inventoryCount.create.mockResolvedValue({ id: 'count-1' });



    await controller.createCount(tenantId, user, dto);



    expect(inventoryCount.create).toHaveBeenCalledWith(tenantId, dto, user);

  });



  it('listCounts delega al service conteggi', async () => {

    const query = { page: 1, pageSize: 10 };

    inventoryCount.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });



    await controller.listCounts(tenantId, user, query);



    expect(inventoryCount.list).toHaveBeenCalledWith(tenantId, query, user);

  });



  it('getCount delega al service conteggi', async () => {

    inventoryCount.getById.mockResolvedValue({ id: 'count-1' });



    await expect(controller.getCount(tenantId, user, 'count-1')).resolves.toEqual({ id: 'count-1' });

    expect(inventoryCount.getById).toHaveBeenCalledWith(tenantId, 'count-1', user);

  });



  it('deleteCount delega al service conteggi', async () => {

    inventoryCount.deleteCancelled.mockResolvedValue(undefined);



    await expect(controller.deleteCount(tenantId, user, 'count-1')).resolves.toBeUndefined();

    expect(inventoryCount.deleteCancelled).toHaveBeenCalledWith(tenantId, 'count-1', user);

  });

});


