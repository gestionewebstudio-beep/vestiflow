import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductsImportService } from './products-import.service';

const CSV_HEADER = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare-at Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / AdWords Grouping,Google Shopping / AdWords Labels,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Status`;

const SAMPLE_CSV = `${CSV_HEADER}
maglietta-test,Maglietta Test,<p>Cotone</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-E2E-IMPORT,,,1,deny,manual,29.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
`;

const TWO_PRODUCTS_CSV = `${CSV_HEADER}
prod-alpha,Alpha Product,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-ALPHA-001,,,1,deny,manual,19.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
prod-beta,Beta Product,<p>B</p>,Brand,Abbigliamento,,TRUE,Taglia,M,,,,,SKU-BETA-001,,,1,deny,manual,24.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
`;

describe('ProductsImportService', () => {
  function createService(
    existingSkus: string[] = [],
    existingProducts: { name: string; importHandle?: string | null }[] = [],
  ) {
    const channelSync = { enqueueProductPush: vi.fn() };
    const prisma = {
      productVariant: {
        findMany: vi.fn().mockResolvedValue(existingSkus.map((sku) => ({ sku }))),
      },
      product: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue(
          existingProducts.map((product) => ({
            name: product.name,
            importHandle: product.importHandle ?? null,
          })),
        ),
      },
    };
    const service = new ProductsImportService(
      prisma as unknown as PrismaService,
      channelSync as unknown as ChannelSyncFacade,
    );
    return { service, prisma, channelSync };
  }

  it('previewCsv restituisce anteprima prodotti pronti', async () => {
    const { service } = createService();

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.total).toBe(1);
    expect(preview.products[0]?.handle).toBe('maglietta-test');
  });

  it('previewCsv segnala i prodotti già importati (per handle)', async () => {
    const { service } = createService([], [{ name: 'Altro', importHandle: 'maglietta-test' }]);

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.alreadyImported).toBe(1);
    expect(preview.products[0]?.alreadyImported).toBe(true);
  });

  it('previewCsv segnala i prodotti già importati (fallback sul nome)', async () => {
    const { service } = createService([], [{ name: 'Maglietta Test' }]);

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.alreadyImported).toBe(1);
    expect(preview.products[0]?.alreadyImported).toBe(true);
  });

  it('previewCsv rifiuta CSV non valido', async () => {
    const { service } = createService();

    await expect(service.previewCsv('tenant-1', 'not,a,valid,shopify,csv')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('importCsv importa prodotti pronti', async () => {
    const { service, prisma, channelSync } = createService();
    prisma.product.create.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta Test',
      variants: [{ sku: 'SKU-E2E-IMPORT' }],
    });

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.imported).toBe(1);
    expect(result.failed).toBe(0);
    expect(prisma.product.create).toHaveBeenCalledOnce();
    expect(channelSync.enqueueProductPush).toHaveBeenCalledWith('tenant-1', 'prod-1');
    expect(result.products[0]).toMatchObject({ handle: 'maglietta-test', status: 'imported' });
  });

  it('importCsv rispetta filtro handles', async () => {
    const { service, prisma } = createService();
    prisma.product.create.mockResolvedValue({
      id: 'prod-alpha',
      name: 'Alpha Product',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', TWO_PRODUCTS_CSV, {
      handles: ['prod-alpha'],
    });

    expect(result.imported).toBe(1);
    expect(prisma.product.create).toHaveBeenCalledOnce();
    expect(result.products.some((row) => row.handle === 'prod-beta')).toBe(false);
  });

  it('importCsv salta prodotti non pronti in anteprima', async () => {
    const { service, prisma } = createService();
    const preview = await service.previewCsv('tenant-1', TWO_PRODUCTS_CSV);
    const readyCount = preview.products.filter((product) => product.issues.every((issue) => issue.level !== 'error')).length;

    prisma.product.create.mockResolvedValue({
      id: 'prod-alpha',
      name: 'Alpha Product',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', TWO_PRODUCTS_CSV, {
      handles: ['prod-alpha'],
    });

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(0);
    expect(readyCount).toBeGreaterThanOrEqual(1);
    expect(prisma.product.create).toHaveBeenCalledOnce();
  });

  it('importCsv salta prodotti già presenti in catalogo (anti-duplicato per nome)', async () => {
    const { service, prisma } = createService([], [{ name: 'maglietta test' }]);

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(result.products[0]).toMatchObject({
      handle: 'maglietta-test',
      status: 'skipped',
    });
    expect(result.products[0]?.message).toContain('già presente');
  });

  it('importCsv salta per handle anche se il nome è diverso', async () => {
    const { service, prisma } = createService([], [
      { name: 'Nome Diverso', importHandle: 'maglietta-test' },
    ]);

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(result.products[0]?.message).toContain('già presente');
  });

  it('importCsv azzera i barcode duplicati nello stesso prodotto', async () => {
    const { service, prisma } = createService();
    const csv = `${CSV_HEADER}
barcode-dup,Prodotto Barcode,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-BC-1,,,1,deny,manual,19.90,,TRUE,TRUE,EAN-DUP,,,,,,,,,,,,,,,,,,,,,active
barcode-dup,Prodotto Barcode,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,M,,,,,SKU-BC-2,,,1,deny,manual,24.90,,TRUE,TRUE,EAN-DUP,,,,,,,,,,,,,,,,,,,,,active
`;
    prisma.product.create.mockResolvedValue({
      id: 'prod-bc',
      name: 'Prodotto Barcode',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', csv);

    expect(result.imported).toBe(1);
    const createArg = prisma.product.create.mock.calls[0]?.[0] as {
      data: { variants: { create: { sku: string; barcode: string | null }[] } };
    };
    const barcodes = createArg.data.variants.create.map((variant) => variant.barcode);
    expect(barcodes.filter((barcode) => barcode === 'EAN-DUP')).toHaveLength(1);
    expect(barcodes.filter((barcode) => barcode === null)).toHaveLength(1);
  });

  it('importCsv persiste import_handle del prodotto importato', async () => {
    const { service, prisma } = createService();
    prisma.product.create.mockResolvedValue({
      id: 'prod-1',
      name: 'Maglietta Test',
      variants: [{ sku: 'SKU-E2E-IMPORT' }],
    });

    await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(prisma.product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ importHandle: 'maglietta-test' }),
      }),
    );
  });

  it('importCsv non crea duplicati per lo stesso nome nello stesso file', async () => {
    const { service, prisma } = createService();
    const csv = `${CSV_HEADER}
dup-a,Prodotto Doppio,<p>A</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-DUP-A,,,1,deny,manual,19.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
dup-b,Prodotto Doppio,<p>B</p>,Brand,Abbigliamento,,TRUE,Taglia,M,,,,,SKU-DUP-B,,,1,deny,manual,24.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
`;
    prisma.product.create.mockResolvedValue({
      id: 'prod-dup-a',
      name: 'Prodotto Doppio',
      variants: [],
    });

    const result = await service.importCsv('tenant-1', csv);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(prisma.product.create).toHaveBeenCalledOnce();
  });

  it('importCsv segna fallimento se create lancia errore', async () => {
    const { service, prisma } = createService();
    prisma.product.create.mockRejectedValue(new UnprocessableEntityException('SKU duplicato'));

    const result = await service.importCsv('tenant-1', SAMPLE_CSV);

    expect(result.failed).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.products[0]).toMatchObject({ status: 'failed' });
  });
});
