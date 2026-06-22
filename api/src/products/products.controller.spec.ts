import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ProductMediaService } from './product-media.service';
import type { ProductsExportService } from './products-export.service';
import type { ProductsImportService } from './products-import.service';
import type { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

describe('ProductsController', () => {
  const tenantId = 'tenant-1';
  const products = {
    list: vi.fn(),
    getById: vi.fn(),
    checkSkuAvailability: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    syncToShopify: vi.fn(),
    findVariantByCode: vi.fn(),
  };
  const productMedia = { uploadImage: vi.fn(), deleteImage: vi.fn() };
  const productsImport = { previewCsv: vi.fn(), importCsv: vi.fn() };
  const productsExport = { exportCsv: vi.fn().mockResolvedValue('name,sku\n') };

  const controller = new ProductsController(
    products as unknown as ProductsService,
    productMedia as unknown as ProductMediaService,
    productsImport as unknown as ProductsImportService,
    productsExport as unknown as ProductsExportService,
  );

  it('list delega al service', async () => {
    const query = { page: 1, pageSize: 10 };
    products.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 });

    await controller.list(tenantId, query as never);

    expect(products.list).toHaveBeenCalledWith(tenantId, query);
  });

  it('checkSku delega al service', async () => {
    products.checkSkuAvailability.mockResolvedValue({ sku: 'SKU-1', available: true });

    await expect(
      controller.checkSku(tenantId, { sku: 'SKU-1' } as never),
    ).resolves.toEqual({ sku: 'SKU-1', available: true });
  });

  it('previewImport rifiuta file CSV mancante', () => {
    expect(() => controller.previewImport(tenantId, undefined)).toThrow(BadRequestException);
  });

  it('importProducts delega a productsImport.importCsv', async () => {
    const file = {
      buffer: Buffer.from('handle,title\n', 'utf8'),
      originalname: 'products.csv',
      mimetype: 'text/csv',
    } as Express.Multer.File;
    productsImport.importCsv.mockResolvedValue({ imported: 1, skipped: 0, failed: 0, products: [] });

    await controller.importProducts(tenantId, file, { handles: ['handle-a'] } as never);

    expect(productsImport.importCsv).toHaveBeenCalledWith(
      tenantId,
      'handle,title\n',
      { handles: ['handle-a'] },
    );
  });

  it('getById delega al service', async () => {
    products.getById.mockResolvedValue({ id: 'prod-1', name: 'Giacca' });

    await expect(controller.getById(tenantId, 'prod-1')).resolves.toEqual({
      id: 'prod-1',
      name: 'Giacca',
    });
  });

  it('create delega al service', async () => {
    const dto = { name: 'Nuovo', status: 'active', options: [], variants: [] };
    products.create.mockResolvedValue({ id: 'prod-new' });

    await controller.create(tenantId, dto as never);

    expect(products.create).toHaveBeenCalledWith(tenantId, dto);
  });

  it('exportCsv restituisce StreamableFile', async () => {
    const file = await controller.exportCsv(tenantId, {} as never);

    expect(productsExport.exportCsv).toHaveBeenCalledWith(tenantId, {});
    expect(file.options.disposition).toContain('prodotti-vestiflow');
  });

  it('findVariantByCode delega al service', async () => {
    products.findVariantByCode.mockResolvedValue({ sku: 'SKU-1' });

    await expect(
      controller.findVariantByCode(tenantId, { code: 'SKU-1' } as never),
    ).resolves.toEqual({ sku: 'SKU-1' });
  });

  it('update delega al service', async () => {
    const dto = { name: 'Aggiornato' };
    products.update.mockResolvedValue({ id: 'prod-1', name: 'Aggiornato' });

    await controller.update(tenantId, 'prod-1', dto as never);

    expect(products.update).toHaveBeenCalledWith(tenantId, 'prod-1', dto);
  });

  it('delete delega al service', async () => {
    products.delete.mockResolvedValue(undefined);

    await controller.delete(tenantId, 'prod-1');

    expect(products.delete).toHaveBeenCalledWith(tenantId, 'prod-1');
  });

  it('syncToShopify delega al service', async () => {
    products.syncToShopify.mockResolvedValue({ queued: true });

    await expect(controller.syncToShopify(tenantId, 'prod-1')).resolves.toEqual({ queued: true });
  });
});
