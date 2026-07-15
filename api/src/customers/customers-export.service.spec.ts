import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { CustomersExportService } from './customers-export.service';

describe('CustomersExportService', () => {
  it('exportCsv serializza clienti con intestazioni italiane (dati dal soggetto)', async () => {
    const prisma = {
      customer: {
        findMany: vi.fn().mockResolvedValue([
          {
            code: '0001',
            isActive: true,
            shopifyCustomerId: 'gid://shopify/Customer/1',
            party: {
              firstName: 'Mario',
              lastName: 'Rossi',
              companyName: null,
              vatNumber: null,
              email: 'mario@example.com',
              phone: null,
              addressLine1: 'Via Roma 1',
              addressLine2: null,
              city: 'Napoli',
              province: 'NA',
              postalCode: '80100',
              countryCode: 'IT',
              notes: null,
              supplierRole: { id: 'sup-1', isActive: true },
            },
          },
        ]),
      },
    };
    const service = new CustomersExportService(prisma as unknown as PrismaService);

    const csv = await service.exportCsv('tenant-1', { search: 'mario' });

    expect(prisma.customer.findMany).toHaveBeenCalled();
    expect(csv).toContain('Mario');
    expect(csv).toContain('mario@example.com');
    expect(csv).toContain('0001');
    expect(csv.split('\n')[0]).toContain('Nome');
    expect(csv.split('\n')[0]).toContain('Anche fornitore');
  });
});
