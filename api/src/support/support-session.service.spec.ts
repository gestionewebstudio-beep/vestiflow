import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SUPPORT_SESSION_TTL_MS } from './support-session.constants';
import { SupportSessionService } from './support-session.service';

describe('SupportSessionService', () => {
  function createService(options?: {
    isPlatformAdmin?: boolean;
    tenantUsers?: readonly { email: string }[];
    platformAdminForEmail?: (email: string) => boolean;
  }) {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue(options?.tenantUsers ?? [{ email: 'owner@test.it' }]),
      },
      supportSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      tenant: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
      ),
    };
    const platformAdmin = {
      isPlatformAdmin: options?.platformAdminForEmail
        ? vi.fn(options.platformAdminForEmail)
        : vi.fn().mockReturnValue(options?.isPlatformAdmin ?? true),
    };

    const service = new SupportSessionService(
      prisma as unknown as PrismaService,
      platformAdmin as unknown as PlatformAdminService,
    );

    return { service, prisma, platformAdmin };
  }

  it('startSession crea sessione da 2 ore e termina quelle precedenti', async () => {
    const { service, prisma } = createService({
      platformAdminForEmail: (email) => email === 'admin@vestiflow.it',
    });
    const expiresAt = new Date('2026-06-22T14:00:00.000Z');

    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'Negozio Demo' });
    prisma.supportSession.create.mockResolvedValue({
      id: 'session-1',
      targetTenantId: 'tenant-1',
      expiresAt,
      targetTenant: { name: 'Negozio Demo' },
    });

    const before = Date.now();
    const result = await service.startSession('op-1', 'admin@vestiflow.it', 'tenant-1');
    const after = Date.now();

    expect(prisma.supportSession.updateMany).toHaveBeenCalledWith({
      where: { operatorUserId: 'op-1', endedAt: null },
      data: { endedAt: expect.any(Date) },
    });
    expect(prisma.supportSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          operatorUserId: 'op-1',
          targetTenantId: 'tenant-1',
          expiresAt: expect.any(Date),
        }),
      }),
    );

    const createdExpiresAt = prisma.supportSession.create.mock.calls[0]?.[0]?.data
      ?.expiresAt as Date;
    expect(createdExpiresAt.getTime()).toBeGreaterThanOrEqual(before + SUPPORT_SESSION_TTL_MS);
    expect(createdExpiresAt.getTime()).toBeLessThanOrEqual(after + SUPPORT_SESSION_TTL_MS);

    expect(result).toEqual({
      sessionId: 'session-1',
      targetTenantId: 'tenant-1',
      targetTenantName: 'Negozio Demo',
      expiresAt: expiresAt.toISOString(),
    });
  });

  it('startSession rifiuta operatori non piattaforma', async () => {
    const { service } = createService({ isPlatformAdmin: false });

    await expect(
      service.startSession('op-1', 'user@test.it', 'tenant-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('startSession rifiuta tenant operatore piattaforma', async () => {
    const { service } = createService({
      tenantUsers: [{ email: 'admin@vestiflow.it' }],
    });

    await expect(
      service.startSession('op-1', 'admin@vestiflow.it', 'tenant-op'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolveActiveSession termina sessioni scadute', async () => {
    const { service, prisma } = createService();

    prisma.supportSession.findFirst.mockResolvedValue({
      id: 'session-1',
      targetTenantId: 'tenant-1',
      expiresAt: new Date(Date.now() - 1000),
      targetTenant: { name: 'Negozio Demo' },
    });

    await expect(service.resolveActiveSession('session-1', 'op-1')).resolves.toBeNull();
    expect(prisma.supportSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { endedAt: expect.any(Date) },
    });
  });

  it('endActiveSession segnala sessione assente', async () => {
    const { service, prisma } = createService();
    prisma.supportSession.findFirst.mockResolvedValue(null);

    await expect(service.endActiveSession('op-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
