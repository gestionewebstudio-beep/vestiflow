import { describe, expect, it, vi } from 'vitest';

import type { AdminTenantsService } from './admin-tenants.service';
import type { AdminTenantUsersService } from './admin-tenant-users.service';
import { AdminTenantsController } from './admin-tenants.controller';

describe('AdminTenantsController', () => {
  const adminTenants = {
    listTenants: vi.fn(),
    createTenant: vi.fn(),
    getTenantById: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    grantLocationSelectionChange: vi.fn(),
  };
  const adminTenantUsers = {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  };

  const controller = new AdminTenantsController(
    adminTenants as unknown as AdminTenantsService,
    adminTenantUsers as unknown as AdminTenantUsersService,
  );

  it('listTenants delega al service', async () => {
    adminTenants.listTenants.mockResolvedValue([{ id: 'tenant-1', name: 'Negozio' }]);

    await expect(controller.listTenants()).resolves.toEqual([
      { id: 'tenant-1', name: 'Negozio' },
    ]);
  });

  it('createTenant delega al service', async () => {
    const dto = { name: 'Nuovo tenant' };
    adminTenants.createTenant.mockResolvedValue({ id: 'tenant-new' });

    await controller.createTenant(dto as never);

    expect(adminTenants.createTenant).toHaveBeenCalledWith(dto);
  });

  it('getTenantById delega al service', async () => {
    adminTenants.getTenantById.mockResolvedValue({ id: 'tenant-1' });

    await expect(controller.getTenantById('tenant-1')).resolves.toEqual({ id: 'tenant-1' });
  });

  it('updateTenant delega al service', async () => {
    const dto = { name: 'Aggiornato' };
    adminTenants.updateTenant.mockResolvedValue({ id: 'tenant-1', name: 'Aggiornato' });

    await controller.updateTenant('tenant-1', dto as never);

    expect(adminTenants.updateTenant).toHaveBeenCalledWith('tenant-1', dto);
  });

  it('deleteTenant passa l attore preso dal PROFILO, non dalla richiesta', async () => {
    adminTenants.deleteTenant.mockResolvedValue(undefined);
    const request = {
      appUser: {
        id: 'op-1',
        email: 'admin@vestiflow.it',
        displayName: 'Operatore Piattaforma',
      },
    };

    await controller.deleteTenant('tenant-1', request as never);

    // ⭐ `displayName` come nome, `email` nel campo dedicato: l'email autorizza
    //    l'amministratore, non ne sostituisce il nome (§10.2).
    expect(adminTenants.deleteTenant).toHaveBeenCalledWith('tenant-1', {
      tipo: 'utente',
      userId: 'op-1',
      name: 'Operatore Piattaforma',
      email: 'admin@vestiflow.it',
    });
  });

  it('grantLocationSelectionChange delega al service', async () => {
    adminTenants.grantLocationSelectionChange.mockResolvedValue({
      licensedLocationCount: 2,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: true,
      locationSelectionChangeGranted: true,
      canChangeLicensedLocations: true,
    });

    await controller.grantLocationSelectionChange('tenant-1');

    expect(adminTenants.grantLocationSelectionChange).toHaveBeenCalledWith('tenant-1');
  });
});
