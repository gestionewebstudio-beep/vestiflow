import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';

import type { AuthProfileCacheService } from '../auth/auth-profile-cache.service';
import type { SupabaseService } from '../auth/supabase.service';
import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';

import { AdminTenantUsersService } from './admin-tenant-users.service';

describe('AdminTenantUsersService', () => {
  let prisma: {
    user: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    supportSession: { deleteMany: ReturnType<typeof vi.fn> };
  };
  let supabase: { deleteAuthUser: ReturnType<typeof vi.fn>; getStorageClient: ReturnType<typeof vi.fn> };
  let profileCache: { invalidate: ReturnType<typeof vi.fn> };
  let service: AdminTenantUsersService;

  const tenantId = 'tenant-1';

  beforeEach(() => {
    prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ email: 'owner@test.it' }]),
        findFirst: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        update: vi.fn(),
      },
      supportSession: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    supabase = {
      deleteAuthUser: vi.fn().mockResolvedValue(undefined),
      getStorageClient: vi.fn().mockReturnValue(null),
    };
    profileCache = { invalidate: vi.fn() };

    service = new AdminTenantUsersService(
      prisma as unknown as PrismaService,
      supabase as unknown as SupabaseService,
      { isPlatformAdmin: vi.fn().mockReturnValue(false) } as unknown as PlatformAdminService,
      profileCache as unknown as AuthProfileCacheService,
      { get: vi.fn().mockReturnValue('user-avatars') } as never,
    );
  });

  it('deleteUser rimuove commesso e credenziali Auth', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-clerk',
      authUserId: 'auth-clerk',
      role: UserRole.clerk,
      avatarStoragePath: null,
    });

    await expect(service.deleteUser(tenantId, 'user-clerk')).resolves.toBeUndefined();

    expect(prisma.supportSession.deleteMany).toHaveBeenCalledWith({
      where: { operatorUserId: 'user-clerk' },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-clerk' } });
    expect(supabase.deleteAuthUser).toHaveBeenCalledWith('auth-clerk');
    expect(profileCache.invalidate).toHaveBeenCalledWith('auth-clerk');
  });

  it('deleteUser blocca eliminazione titolare', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-owner',
      authUserId: 'auth-owner',
      role: UserRole.owner,
      avatarStoragePath: null,
    });

    await expect(service.deleteUser(tenantId, 'user-owner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('deleteUser fallisce se utente assente', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.deleteUser(tenantId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updateUser filtra permessi obsoleti dal payload e dal DTO', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    prisma.user.findFirst.mockResolvedValue({
      id: 'user-clerk',
      tenantId,
      authUserId: 'auth-clerk',
      email: 'clerk@test.it',
      displayName: 'Commesso',
      role: UserRole.clerk,
      assignedLocationId: 'loc-1',
      permissions: ['settings.integrations', TenantPermission.InventoryManage],
      isActive: true,
      createdAt,
      assignedLocation: { id: 'loc-1', name: 'Napoli' },
    });
    prisma.user.update.mockResolvedValue({
      id: 'user-clerk',
      email: 'clerk@test.it',
      displayName: 'Commesso',
      role: UserRole.clerk,
      assignedLocationId: 'loc-1',
      permissions: [TenantPermission.InventoryManage, TenantPermission.CustomersView],
      isActive: true,
      createdAt,
      authUserId: 'auth-clerk',
      assignedLocation: { id: 'loc-1', name: 'Napoli' },
    });

    const result = await service.updateUser(tenantId, 'user-clerk', {
      permissions: [
        'settings.integrations',
        TenantPermission.InventoryManage,
        TenantPermission.CustomersView,
      ],
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-clerk' },
        data: expect.objectContaining({
          permissions: [TenantPermission.InventoryManage, TenantPermission.CustomersView],
        }),
      }),
    );
    expect(result.permissions).not.toContain('settings.integrations');
    expect(result.permissions).toEqual([
      TenantPermission.InventoryManage,
      TenantPermission.CustomersView,
    ]);
    expect(profileCache.invalidate).toHaveBeenCalledWith('auth-clerk');
  });
});
