import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TenantChannelProfile } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SupabaseService } from '../auth/supabase.service';
import { AdminTenantsService } from './admin-tenants.service';

describe('AdminTenantsService', () => {
  function createService(options?: {
    supabase?: Partial<SupabaseService>;
    config?: Record<string, string | undefined>;
  }) {
    const prisma = {
      tenant: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      store: {
        create: vi.fn(),
      },
      location: {
        create: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    const platformAdmin = {
      isPlatformAdmin: vi.fn().mockReturnValue(false),
    };
    const supabase = {
      isConfigured: vi.fn().mockReturnValue(true),
      inviteAuthUser: vi.fn(),
      provisionAuthUserForInvite: vi.fn(),
      resendAuthInvite: vi.fn(),
      deleteAuthUser: vi.fn(),
      ...options?.supabase,
    };
    const config = {
      get: (key: string) => options?.config?.[key],
    } as ConfigService;

    const service = new AdminTenantsService(
      prisma as unknown as PrismaService,
      supabase as unknown as SupabaseService,
      platformAdmin as unknown as PlatformAdminService,
      config,
    );

    return { service, prisma, platformAdmin, supabase, config };
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

  it('createTenant invia provisionAuthUserForInvite con redirect da FRONTEND_URL', async () => {
    const { service, prisma, supabase } = createService({
      config: { FRONTEND_URL: 'http://localhost:4200' },
    });
    prisma.user.findFirst.mockResolvedValue(null);
    supabase.provisionAuthUserForInvite.mockResolvedValue({
      authUserId: 'auth-user-1',
      inviteSent: true,
    });
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        tenant: {
          create: vi.fn().mockResolvedValue({
            id: 'tenant-1',
            name: 'Cliente',
            channelProfile: 'gestionale',
          }),
        },
        store: {
          create: vi.fn().mockResolvedValue({ id: 'store-1', name: 'Negozio principale' }),
        },
        location: {
          create: vi.fn().mockResolvedValue({ id: 'loc-1', name: 'Negozio principale' }),
        },
        user: {
          create: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'owner@test.it',
            displayName: 'Titolare',
            role: 'owner',
          }),
        },
      }),
    );

    const result = await service.createTenant({
      tenantName: 'Cliente',
      ownerEmail: 'owner@test.it',
      ownerDisplayName: 'Titolare',
      channelProfile: TenantChannelProfile.gestionale,
    });

    expect(supabase.provisionAuthUserForInvite).toHaveBeenCalledWith(
      'owner@test.it',
      'http://localhost:4200/login/reset-password',
    );
    expect(result.ownerInviteSent).toBe(true);
  });
});
