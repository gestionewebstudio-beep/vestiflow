import { describe, expect, it, vi } from 'vitest';
import { CorrispettivoStatus } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';
import { CorrispettivoRegisterService } from './corrispettivo-register.service';

describe('CorrispettivoRegisterService', () => {
  it('update con invoiceIssued=true esclude automaticamente dal riepilogo', async () => {
    const prisma = {
      corrispettivoEntry: {
        findFirst: vi.fn().mockResolvedValue({ id: 'entry-1' }),
        update: vi.fn().mockResolvedValue({
          id: 'entry-1',
          reference: 'COR-1',
          status: CorrispettivoStatus.excluded_invoiced,
          invoiceIssued: true,
          excludedFromSummary: true,
          fiscalDate: new Date('2026-07-01'),
          operationalDate: new Date('2026-07-01'),
          subtotalMinor: 1000,
          taxMinor: 220,
          totalMinor: 1220,
          channel: 'shopify_online',
          salesOrderId: 'order-1',
          onlineSale: { reference: 'VO-1', orderNumber: '#1001' },
          lines: [],
        }),
      },
    };

    const service = new CorrispettivoRegisterService(prisma as unknown as PrismaService);

    await service.update('tenant-1', 'entry-1', { invoiceIssued: true });

    expect(prisma.corrispettivoEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          invoiceIssued: true,
          excludedFromSummary: true,
          status: CorrispettivoStatus.excluded_invoiced,
        }),
      }),
    );
  });
});
