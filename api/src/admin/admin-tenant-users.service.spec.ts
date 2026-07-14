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
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    userLocation: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
    location: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    store: { findFirst: ReturnType<typeof vi.fn> };
    supportSession: { deleteMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let supabase: {
    isConfigured: ReturnType<typeof vi.fn>;
    createAuthUser: ReturnType<typeof vi.fn>;
    deleteAuthUser: ReturnType<typeof vi.fn>;
    getStorageClient: ReturnType<typeof vi.fn>;
  };
  let profileCache: { invalidate: ReturnType<typeof vi.fn> };
  let service: AdminTenantUsersService;

  const tenantId = 'tenant-1';

  beforeEach(() => {
    prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ email: 'owner@test.it' }]),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      userLocation: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      location: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue({ id: 'store-1' }),
      },
      supportSession: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    supabase = {
      isConfigured: vi.fn().mockReturnValue(true),
      createAuthUser: vi.fn().mockResolvedValue('auth-new'),
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
      hasAllLocationsAccess: false,
      permissions: ['settings.integrations', TenantPermission.InventoryManage],
      isActive: true,
      createdAt,
      locations: [{ locationId: 'loc-1', location: { id: 'loc-1', name: 'Napoli' } }],
    });
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-clerk',
      email: 'clerk@test.it',
      displayName: 'Commesso',
      role: UserRole.clerk,
      hasAllLocationsAccess: false,
      permissions: [TenantPermission.InventoryManage, TenantPermission.CustomersView],
      isActive: true,
      createdAt,
      authUserId: 'auth-clerk',
      locations: [{ locationId: 'loc-1', location: { id: 'loc-1', name: 'Napoli' } }],
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
          // Nessun input sedi/ruolo: l'assegnazione esistente è preservata.
          hasAllLocationsAccess: false,
        }),
      }),
    );
    expect(result.permissions).not.toContain('settings.integrations');
    expect(result.permissions).toEqual([
      TenantPermission.InventoryManage,
      TenantPermission.CustomersView,
    ]);
    expect(result.assignedLocationIds).toEqual(['loc-1']);
    expect(profileCache.invalidate).toHaveBeenCalledWith('auth-clerk');
  });

  describe('assegnazione sedi (N location per utente)', () => {
    it('createUser titolare: hasAllLocationsAccess sempre true, nessuna riga UserLocation, ignora input', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.user.create.mockResolvedValue({ id: 'user-owner' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-owner',
        email: 'owner2@test.it',
        displayName: 'Titolare 2',
        role: UserRole.owner,
        hasAllLocationsAccess: true,
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-new',
        locations: [],
      });
      prisma.user.findFirst.mockResolvedValueOnce(null); // check email univoca

      const result = await service.createUser(tenantId, {
        email: 'owner2@test.it',
        password: 'password123',
        displayName: 'Titolare 2',
        role: UserRole.owner,
        hasAllLocationsAccess: false,
        assignedLocationIds: ['loc-should-be-ignored'],
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hasAllLocationsAccess: true }),
        }),
      );
      expect(prisma.userLocation.createMany).not.toHaveBeenCalled();
      expect(result.hasAllLocationsAccess).toBe(true);
      expect(result.assignedLocationIds).toEqual([]);
    });

    it('createUser admin senza input sedi: default hasAllLocationsAccess=true (compatibilità storica)', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.user.create.mockResolvedValue({ id: 'user-admin' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-admin',
        email: 'admin@test.it',
        displayName: 'Admin',
        role: UserRole.admin,
        hasAllLocationsAccess: true,
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-new',
        locations: [],
      });

      const result = await service.createUser(tenantId, {
        email: 'admin@test.it',
        password: 'password123',
        displayName: 'Admin',
        role: UserRole.admin,
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ hasAllLocationsAccess: true }),
        }),
      );
      expect(result.hasAllLocationsAccess).toBe(true);
    });

    it('createUser admin con hasAllLocationsAccess=false richiede sedi valide', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.location.count.mockResolvedValue(2);

      await expect(
        service.createUser(tenantId, {
          email: 'admin2@test.it',
          password: 'password123',
          displayName: 'Admin ristretto',
          role: UserRole.admin,
          hasAllLocationsAccess: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('createUser manager/clerk senza sedi assegnate: 400 chiaro, nessun accesso automatico a tutte le sedi', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.location.count.mockResolvedValue(3);

      await expect(
        service.createUser(tenantId, {
          email: 'clerk-noloc@test.it',
          password: 'password123',
          displayName: 'Commesso senza sede',
          role: UserRole.clerk,
          assignedLocationIds: [],
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('Assegna almeno una sede operativa'),
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('createUser manager con una sola sede assegnata valida', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-rome' }]);
      prisma.user.create.mockResolvedValue({ id: 'user-manager' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-manager',
        email: 'manager@test.it',
        displayName: 'Manager Roma',
        role: UserRole.manager,
        hasAllLocationsAccess: false,
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-new',
        locations: [{ locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } }],
      });

      const result = await service.createUser(tenantId, {
        email: 'manager@test.it',
        password: 'password123',
        displayName: 'Manager Roma',
        role: UserRole.manager,
        assignedLocationIds: ['loc-rome'],
      });

      expect(prisma.userLocation.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'user-manager', locationId: 'loc-rome', tenantId }],
      });
      expect(result.assignedLocationIds).toEqual(['loc-rome']);
      expect(result.hasAllLocationsAccess).toBe(false);
    });

    it('createUser rifiuta sede non valida/non licenziata per il tenant', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.location.findMany.mockResolvedValue([]); // nessuna corrisponde

      await expect(
        service.createUser(tenantId, {
          email: 'clerk-badloc@test.it',
          password: 'password123',
          displayName: 'Commesso',
          role: UserRole.clerk,
          assignedLocationIds: ['loc-altro-tenant'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('updateUser sincronizza le righe UserLocation (deleteMany + createMany) quando cambia l’assegnazione', async () => {
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-clerk',
        tenantId,
        authUserId: 'auth-clerk',
        email: 'clerk@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        permissions: [],
        isActive: true,
        createdAt,
        locations: [{ locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } }],
      });
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-nap' }, { id: 'loc-rome' }]);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-clerk',
        email: 'clerk@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-clerk',
        locations: [
          { locationId: 'loc-nap', location: { id: 'loc-nap', name: 'Napoli' } },
          { locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } },
        ],
      });

      const result = await service.updateUser(tenantId, 'user-clerk', {
        assignedLocationIds: ['loc-nap', 'loc-rome'],
      });

      expect(prisma.userLocation.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-clerk' },
      });
      expect(prisma.userLocation.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-clerk', locationId: 'loc-nap', tenantId },
          { userId: 'user-clerk', locationId: 'loc-rome', tenantId },
        ],
      });
      expect(result.assignedLocationIds).toEqual(['loc-nap', 'loc-rome']);
    });
  });

  describe('sede predefinita (defaultLocationId)', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    it('createUser rifiuta una predefinita fuori dalle sedi assegnate (400)', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-rome' }]);

      await expect(
        service.createUser(tenantId, {
          email: 'clerk-def@test.it',
          password: 'password123',
          displayName: 'Commesso',
          role: UserRole.clerk,
          assignedLocationIds: ['loc-rome'],
          defaultLocationId: 'loc-fuori-assegnazione',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('createUser salva la predefinita quando è tra le sedi assegnate', async () => {
      prisma.user.findFirst.mockResolvedValueOnce(null);
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-rome' }]);
      prisma.user.create.mockResolvedValue({ id: 'user-clerk' });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-clerk',
        email: 'clerk-def@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        defaultLocationId: 'loc-rome',
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-new',
        locations: [{ locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } }],
      });

      const result = await service.createUser(tenantId, {
        email: 'clerk-def@test.it',
        password: 'password123',
        displayName: 'Commesso',
        role: UserRole.clerk,
        assignedLocationIds: ['loc-rome'],
        defaultLocationId: 'loc-rome',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ defaultLocationId: 'loc-rome' }),
        }),
      );
      expect(result.defaultLocationId).toBe('loc-rome');
    });

    it('updateUser rifiuta una predefinita esplicita fuori dalle sedi assegnate (400)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-clerk',
        tenantId,
        authUserId: 'auth-clerk',
        email: 'clerk@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        defaultLocationId: null,
        permissions: [],
        isActive: true,
        createdAt,
        locations: [{ locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } }],
      });

      await expect(
        service.updateUser(tenantId, 'user-clerk', {
          defaultLocationId: 'loc-non-assegnata',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updateUser azzera la predefinita quando il cambio assegnazioni la esclude', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-clerk',
        tenantId,
        authUserId: 'auth-clerk',
        email: 'clerk@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        defaultLocationId: 'loc-rome',
        permissions: [],
        isActive: true,
        createdAt,
        locations: [{ locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } }],
      });
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-nap' }]);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-clerk',
        email: 'clerk@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        defaultLocationId: null,
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-clerk',
        locations: [{ locationId: 'loc-nap', location: { id: 'loc-nap', name: 'Napoli' } }],
      });

      const result = await service.updateUser(tenantId, 'user-clerk', {
        assignedLocationIds: ['loc-nap'],
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ defaultLocationId: null }),
        }),
      );
      expect(result.defaultLocationId).toBeNull();
    });

    it('updateUser conserva la predefinita quando resta tra le sedi assegnate', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-clerk',
        tenantId,
        authUserId: 'auth-clerk',
        email: 'clerk@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        defaultLocationId: 'loc-rome',
        permissions: [],
        isActive: true,
        createdAt,
        locations: [{ locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } }],
      });
      prisma.location.findMany.mockResolvedValue([{ id: 'loc-nap' }, { id: 'loc-rome' }]);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-clerk',
        email: 'clerk@test.it',
        displayName: 'Commesso',
        role: UserRole.clerk,
        hasAllLocationsAccess: false,
        defaultLocationId: 'loc-rome',
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-clerk',
        locations: [
          { locationId: 'loc-nap', location: { id: 'loc-nap', name: 'Napoli' } },
          { locationId: 'loc-rome', location: { id: 'loc-rome', name: 'Roma' } },
        ],
      });

      const result = await service.updateUser(tenantId, 'user-clerk', {
        assignedLocationIds: ['loc-nap', 'loc-rome'],
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ defaultLocationId: 'loc-rome' }),
        }),
      );
      expect(result.defaultLocationId).toBe('loc-rome');
    });

    it('updateUser con accesso pieno valida la predefinita tra le sedi licenziate/attive del tenant', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-admin',
        tenantId,
        authUserId: 'auth-admin',
        email: 'admin@test.it',
        displayName: 'Admin',
        role: UserRole.admin,
        hasAllLocationsAccess: true,
        defaultLocationId: null,
        permissions: [],
        isActive: true,
        createdAt,
        locations: [],
      });
      prisma.location.count.mockResolvedValue(1);
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        id: 'user-admin',
        email: 'admin@test.it',
        displayName: 'Admin',
        role: UserRole.admin,
        hasAllLocationsAccess: true,
        defaultLocationId: 'loc-rome',
        permissions: [],
        isActive: true,
        createdAt,
        authUserId: 'auth-admin',
        locations: [],
      });

      const result = await service.updateUser(tenantId, 'user-admin', {
        defaultLocationId: 'loc-rome',
      });

      expect(prisma.location.count).toHaveBeenCalledWith({
        where: { id: 'loc-rome', tenantId, licensedInVf: true, isActive: true },
      });
      expect(result.defaultLocationId).toBe('loc-rome');
    });
  });
});
