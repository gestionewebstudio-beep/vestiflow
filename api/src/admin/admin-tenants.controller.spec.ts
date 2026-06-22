import { describe, expect, it, vi } from 'vitest';

import type { AdminTenantsService } from './admin-tenants.service';
import { AdminTenantsController } from './admin-tenants.controller';

describe('AdminTenantsController', () => {
  const adminTenants = {
    listTenants: vi.fn(),
    createTenant: vi.fn(),
    getTenantById: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
  };

  const controller = new AdminTenantsController(
    adminTenants as unknown as AdminTenantsService,
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

  it('deleteTenant delega al service', async () => {
    adminTenants.deleteTenant.mockResolvedValue(undefined);

    await controller.deleteTenant('tenant-1');

    expect(adminTenants.deleteTenant).toHaveBeenCalledWith('tenant-1');
  });
});
