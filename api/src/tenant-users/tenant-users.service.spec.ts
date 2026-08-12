import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TenantUsersService } from './tenant-users.service';

import type { TenantUsersCoreService } from './tenant-users-core.service';
import type { TenantUserActionActor } from './tenant-users.types';

describe('TenantUsersService (facciata titolare)', () => {
  const tenantId = 'tenant-1';
  const actor: TenantUserActionActor = {
    userId: 'user-owner',
    email: 'owner@test.it',
    name: 'Titolare',
    isPlatformAdmin: false,
  };

  let core: {
    listUsers: ReturnType<typeof vi.fn>;
    requireUser: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };
  let service: TenantUsersService;

  beforeEach(() => {
    core = {
      listUsers: vi.fn().mockResolvedValue([]),
      requireUser: vi.fn(),
      createUser: vi.fn().mockResolvedValue({ id: 'user-new' }),
      updateUser: vi.fn().mockResolvedValue({ id: 'user-clerk' }),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };
    service = new TenantUsersService(core as unknown as TenantUsersCoreService);
  });

  it('createUser rifiuta il ruolo titolare', async () => {
    await expect(
      service.createUser(
        tenantId,
        { email: 'x@test.it', password: 'password123', displayName: 'X', role: UserRole.owner },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(core.createUser).not.toHaveBeenCalled();
  });

  it('createUser delega al core con l’attore per l’audit', async () => {
    const dto = {
      email: 'x@test.it',
      password: 'password123',
      displayName: 'X',
      role: UserRole.clerk,
    };
    await service.createUser(tenantId, dto, actor);
    expect(core.createUser).toHaveBeenCalledWith(tenantId, dto, actor);
  });

  it('updateUser blocca la modifica del proprio account', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-owner',
      role: UserRole.owner,
      email: 'owner@test.it',
    });

    await expect(
      service.updateUser(tenantId, 'user-owner', { displayName: 'Nuovo nome' }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(core.updateUser).not.toHaveBeenCalled();
  });

  it('updateUser blocca gli account titolare (read-only da questa superficie)', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-owner-2',
      role: UserRole.owner,
      email: 'owner2@test.it',
    });

    await expect(
      service.updateUser(tenantId, 'user-owner-2', { isActive: false }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(core.updateUser).not.toHaveBeenCalled();
  });

  it('updateUser blocca la promozione a titolare', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-clerk',
      role: UserRole.clerk,
      email: 'clerk@test.it',
    });

    await expect(
      service.updateUser(tenantId, 'user-clerk', { role: UserRole.owner }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(core.updateUser).not.toHaveBeenCalled();
  });

  it('updateUser delega al core per un bersaglio legittimo', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-clerk',
      role: UserRole.clerk,
      email: 'clerk@test.it',
    });

    await service.updateUser(tenantId, 'user-clerk', { role: UserRole.manager }, actor);
    expect(core.updateUser).toHaveBeenCalledWith(
      tenantId,
      'user-clerk',
      { role: UserRole.manager },
      actor,
    );
  });

  it('deleteUser blocca l’eliminazione del proprio account', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-owner',
      role: UserRole.owner,
      email: 'owner@test.it',
    });

    await expect(service.deleteUser(tenantId, 'user-owner', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(core.deleteUser).not.toHaveBeenCalled();
  });

  it('deleteUser blocca gli account titolare con messaggio dedicato', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-owner-2',
      role: UserRole.owner,
      email: 'owner2@test.it',
    });

    await expect(service.deleteUser(tenantId, 'user-owner-2', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(core.deleteUser).not.toHaveBeenCalled();
  });

  it('deleteUser delega al core per un bersaglio legittimo', async () => {
    core.requireUser.mockResolvedValue({
      id: 'user-clerk',
      role: UserRole.clerk,
      email: 'clerk@test.it',
    });

    await service.deleteUser(tenantId, 'user-clerk', actor);
    expect(core.deleteUser).toHaveBeenCalledWith(tenantId, 'user-clerk', actor);
  });
});
