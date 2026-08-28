import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import { testClerkUser, testOwnerUser } from '../test/fixtures/user-profile.fixture';
import { SalesOrdersExportService } from './sales-orders-export.service';

describe('SalesOrdersExportService', () => {
  it('exportCsv serializza ordini con importi decimali', async () => {
    const prisma = {
      salesOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            orderNumber: '1001',
            placedAt: new Date('2026-01-15T10:00:00.000Z'),
            customerName: 'Mario Rossi',
            customer: { party: { email: 'mario@example.com' } },
            source: 'shopify',
            financialStatus: 'paid',
            fulfillmentStatus: 'fulfilled',
            currency: 'EUR',
            subtotalMinor: 5000,
            totalMinor: 5900,
            shopifyOrderId: 'gid://shopify/Order/1',
          },
        ]),
      },
    };
    const service = new SalesOrdersExportService(prisma as unknown as PrismaService);

    const csv = await service.exportCsv('tenant-1', {});

    expect(csv).toContain('1001');
    // Importo in formato it-IT (virgola decimale) per Excel italiano.
    expect(csv).toContain('59,00');
    // Intestazione con BOM UTF-8 + delimitatore ';'.
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')[0]).toContain('Numero ordine;Data;Cliente');
  });
  // ── Scope sede: il CSV non esce dal perimetro dell'operatore ───────────────
  //
  // ⛔ Il difetto che questi test inchiodano: exportCsv NON riceveva l'utente
  //    — il controller non dichiarava nemmeno @CurrentUser() — quindi il file
  //    scaricato portava fuori gli ordini MANUALI di tutte le sedi del tenant,
  //    mentre l'elenco a schermo li nascondeva. Stessi permessi, due risposte.
  describe('scope sede', () => {
    const prismaConSedi = (locationIds: string[]) => ({
      salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
      location: { findMany: vi.fn().mockResolvedValue(locationIds.map((id) => ({ id }))) },
    });

    it('restringe agli ordini manuali delle sedi assegnate al commesso', async () => {
      const prisma = prismaConSedi(['loc-roma', 'loc-milano']);
      const service = new SalesOrdersExportService(prisma as unknown as PrismaService);

      await service.exportCsv('tenant-1', {}, testClerkUser({ assignedLocationIds: ['loc-roma'] }));

      const where = prisma.salesOrder.findMany.mock.calls[0][0].where;
      // ⭐ Il vincolo è quello di SalesOrdersService.list, alla lettera: i
      //    manuali solo dalle sedi proprie, il resto passa.
      expect(where.AND).toContainEqual({
        OR: [
          { source: { not: 'manual' } },
          { locationId: null },
          { locationId: { in: ['loc-roma'] } },
        ],
      });
    });

    it('non restringe il titolare', async () => {
      const prisma = prismaConSedi(['loc-roma']);
      const service = new SalesOrdersExportService(prisma as unknown as PrismaService);

      await service.exportCsv('tenant-1', {}, testOwnerUser());

      const where = prisma.salesOrder.findMany.mock.calls[0][0].where;
      expect(where.AND).toBeUndefined();
    });

    it('senza sedi assegnate il CSV ha la sola intestazione, non tutte le righe', async () => {
      // ⚠️ Il ripiego pericoloso sarebbe «scope vuoto → nessun filtro → tutto».
      //    Qui non si interroga nemmeno il database.
      const prisma = prismaConSedi([]);
      const service = new SalesOrdersExportService(prisma as unknown as PrismaService);

      const csv = await service.exportCsv('tenant-1', {}, testClerkUser({ assignedLocationIds: [] }));

      expect(prisma.salesOrder.findMany).not.toHaveBeenCalled();
      expect(csv.split('\r\n').filter((r) => r.length > 0)).toHaveLength(1);
    });
  });
});
