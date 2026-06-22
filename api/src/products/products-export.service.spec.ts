import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { ProductsExportService } from './products-export.service';

describe('ProductsExportService', () => {
  it('exportCsv serializza prodotti in formato Shopify CSV', async () => {
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'prod-1',
            name: 'Maglietta',
            handle: 'maglietta',
            status: 'active',
            description: '',
            vendor: '',
            productType: '',
            tags: [],
            category: null,
            brand: null,
            season: null,
            variants: [
              {
                id: 'var-1',
                sku: 'SKU-M',
                barcode: null,
                optionValues: [{ name: 'Taglia', value: 'M' }],
                sellingPriceMinor: 2990,
                compareAtPriceMinor: null,
                purchasePriceMinor: null,
                currency: 'EUR',
                weightGrams: null,
              },
            ],
            images: [],
          },
        ]),
      },
    };
    const service = new ProductsExportService(prisma as unknown as PrismaService);

    const csv = await service.exportCsv('tenant-1', { search: 'maglietta' } as never);

    expect(prisma.product.findMany).toHaveBeenCalled();
    expect(csv).toContain('Maglietta');
    expect(csv).toContain('SKU-M');
  });
});
