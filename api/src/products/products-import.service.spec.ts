import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductsImportService } from './products-import.service';

const SAMPLE_CSV = `Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare-at Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / AdWords Grouping,Google Shopping / AdWords Labels,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Status
maglietta-test,Maglietta Test,<p>Cotone</p>,Brand,Abbigliamento,,TRUE,Taglia,S,,,,,SKU-E2E-IMPORT,,,1,deny,manual,29.90,,TRUE,TRUE,,,,,,,,,,,,,,,,,,,,,active
`;

describe('ProductsImportService', () => {
  function createService(existingSkus: string[] = []) {
    const prisma = {
      productVariant: {
        findMany: vi.fn().mockResolvedValue(existingSkus.map((sku) => ({ sku }))),
      },
      product: { create: vi.fn() },
    };
    const service = new ProductsImportService(
      prisma as unknown as PrismaService,
      {} as ChannelSyncFacade,
    );
    return { service, prisma };
  }

  it('previewCsv restituisce anteprima prodotti pronti', async () => {
    const { service } = createService();

    const preview = await service.previewCsv('tenant-1', SAMPLE_CSV);

    expect(preview.summary.total).toBe(1);
    expect(preview.products[0]?.handle).toBe('maglietta-test');
  });

  it('previewCsv rifiuta CSV non valido', async () => {
    const { service } = createService();

    await expect(service.previewCsv('tenant-1', 'not,a,valid,shopify,csv')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
