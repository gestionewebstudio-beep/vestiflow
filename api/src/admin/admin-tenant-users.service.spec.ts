import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlatformAdminService } from '../common/platform-admin/platform-admin.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantUsersCoreService } from '../tenant-users/tenant-users-core.service';
import type { TenantUserActionActor } from '../tenant-users/tenant-users.types';

import { AdminTenantUsersService } from './admin-tenant-users.service';

describe('AdminTenantUsersService (facciata admin piattaforma)', () => {
  const tenantId = 'tenant-1';
  const actor: TenantUserActionActor = {
    userId: 'user-admin-vf',
    email: 'admin@vestiflow.it',
    name: 'Admin Vestiflow',
    isPlatformAdmin: true,
  };

  let prisma: { user: { findMany: ReturnType<typeof vi.fn> } };
  let core: {
    listUsers: ReturnType<typeof vi.fn>;
    requireUser: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };
  let service: AdminTenantUsersService;

  beforeEach(() => {
    prisma = {
      user: { findMany: vi.fn().mockResolvedValue([{ email: 'owner@test.it' }]) },
    };
    core = {
      listUsers: vi.fn().mockResolvedValue([]),
      requireUser: vi.fn(),
      createUser: vi.fn().mockResolvedValue({ id: 'user-new' }),
      updateUser: vi.fn().mockResolvedValue({ id: 'user-x' }),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };
    service = new AdminTenantUsersService(
      prisma as unknown as PrismaService,
      { isPlatformAdmin: vi.fn().mockReturnValue(false) } as unknown as PlatformAdminService,
      core as unknown as TenantUsersCoreService,
    );
  });

  it('rifiuta tenant senza utenti (non è un cliente)', async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.listUsers(tenantId)).rejects.toBeInstanceOf(NotFoundException);
    expect(core.listUsers).not.toHaveBeenCalled();
  });

  it('listUsers resta disponibile: consultazione e diagnosi permessi', async () => {
    await service.listUsers(tenantId);
    expect(core.listUsers).toHaveBeenCalledWith(tenantId);
  });

  it('createUser rifiuta i dipendenti: li crea il titolare', async () => {
    await expect(
      service.createUser(
        tenantId,
        {
          email: 'clerk@test.it',
          password: 'password123',
          displayName: 'Commesso',
          role: UserRole.clerk,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(core.createUser).not.toHaveBeenCalled();
  });

  it('createUser titolare delega al core con l’attore', async () => {
    const dto = {
      email: 'owner2@test.it',
      password: 'password123',
      displayName: 'Titolare 2',
      role: UserRole.owner,
    };

    await service.createUser(tenantId, dto, actor);
    expect(core.createUser).toHaveBeenCalledWith(tenantId, dto, actor);
  });

  it('updateUser su un dipendente è rifiutato (read-only da questa superficie)', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-clerk',
      role: UserRole.clerk,
      email: 'clerk@test.it',
    });

    await expect(
      service.updateUser(tenantId, 'user-clerk', { isActive: false }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(core.updateUser).not.toHaveBeenCalled();
  });

  it('updateUser su un account titolare delega al core (incluso il declassamento)', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-owner',
      role: UserRole.owner,
      email: 'owner@test.it',
    });

    await service.updateUser(tenantId, 'user-owner', { role: UserRole.manager }, actor);
    expect(core.updateUser).toHaveBeenCalledWith(
      tenantId,
      'user-owner',
      { role: UserRole.manager },
      actor,
    );
  });

  it('updateUser consente la promozione di un dipendente a titolare (passaggio di proprietà)', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-manager',
      role: UserRole.manager,
      email: 'manager@test.it',
    });

    await service.updateUser(tenantId, 'user-manager', { role: UserRole.owner }, actor);
    expect(core.updateUser).toHaveBeenCalledWith(
      tenantId,
      'user-manager',
      { role: UserRole.owner },
      actor,
    );
  });

  it('deleteUser su un dipendente è rifiutato', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-clerk',
      role: UserRole.clerk,
      email: 'clerk@test.it',
    });

    await expect(service.deleteUser(tenantId, 'user-clerk', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(core.deleteUser).not.toHaveBeenCalled();
  });

  it('deleteUser su un titolare delega al core (che applica il proprio blocco)', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-owner',
      role: UserRole.owner,
      email: 'owner@test.it',
    });

    await service.deleteUser(tenantId, 'user-owner', actor);
    expect(core.deleteUser).toHaveBeenCalledWith(tenantId, 'user-owner', actor);
  });

  it('deleteUser fallisce se utente assente', async () => {
    core.requireUser.mockRejectedValue(new NotFoundException('Utente non trovato'));

    await expect(service.deleteUser(tenantId, 'missing', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
