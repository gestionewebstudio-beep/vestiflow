import { describe, expect, it, vi } from 'vitest';

import type { CorrispettiviService } from '../corrispettivi/corrispettivi.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AccountantRegisterService } from './accountant-register.service';

describe('AccountantRegisterService', () => {
  const tenantId = 'tenant-1';

  it('getSummary usa query aggregata e mappa DDT da fatturare', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        total: 10,
        invoice_draft_to_issue: 1,
        invoice_draft_sent: 2,
        invoice_draft_externally_issued: 0,
        invoice_draft_registered: 1,
        sales_ddt_pending_invoice: 3,
        supplier_docs_pending: 2,
      },
    ]);
    const prisma = { $queryRaw: queryRaw };
    const corrispettivi = {
      getSummary: vi.fn().mockResolvedValue({ totalOrders: 5, totalMinor: 10000 }),
    };

    const service = new AccountantRegisterService(
      prisma as unknown as PrismaService,
      corrispettivi as unknown as CorrispettiviService,
    );

    const summary = await service.getSummary(tenantId, {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });

    expect(summary.documents.salesDdtPendingInvoice).toBe(3);
    expect(summary.documents.total).toBe(10);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(corrispettivi.getSummary).toHaveBeenCalledTimes(1);
  });
});
