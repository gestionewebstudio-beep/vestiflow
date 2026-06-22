import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseService } from '../auth/supabase.service';
import { AdminTenantsService } from './admin-tenants.service';

describe('AdminTenantsService', () => {
  function createService() {
    const prisma = {
      tenant: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
    };
    const platformAdmin = {
      isPlatformAdmin: vi.fn().mockReturnValue(false),
    };

    const service = new AdminTenantsService(
      prisma as unknown as PrismaService,
      {} as SupabaseService,
      platformAdmin as unknown as PlatformAdminService,
    );

    return { service, prisma, platformAdmin };
  }

  it('listTenants esclude tenant con utenti platform admin', async () => {
    const { service, prisma, platformAdmin } = createService();
    platformAdmin.isPlatformAdmin.mockImplementation((email: string) =>
      email.includes('operator@'),
    );
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-client',
        name: 'Cliente',
        channelProfile: 'hybrid',
        createdAt: new Date('2026-01-01'),
        vatNumber: null,
        users: [{ email: 'owner@client.it', displayName: 'Owner', createdAt: new Date() }],
      },
      {
        id: 'tenant-op',
        name: 'Operatore',
        channelProfile: 'hybrid',
        createdAt: new Date('2026-01-02'),
        vatNumber: null,
        users: [{ email: 'operator@vestiflow.test', displayName: 'Ops', createdAt: new Date() }],
      },
    ]);

    const tenants = await service.listTenants();

    expect(tenants).toHaveLength(1);
    expect(tenants[0]?.id).toBe('tenant-client');
  });

  it('getTenantById lancia NotFoundException per tenant operatore', async () => {
    const { service, prisma, platformAdmin } = createService();
    platformAdmin.isPlatformAdmin.mockReturnValue(true);
    prisma.user.findMany.mockResolvedValue([{ email: 'operator@vestiflow.test' }]);

    await expect(service.getTenantById('tenant-op')).rejects.toBeInstanceOf(NotFoundException);
  });
});
