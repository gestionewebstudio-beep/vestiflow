import { describe, expect, it, vi } from 'vitest';

import { TenantPermission } from '../auth/tenant-permission.constants';
import { TENANT_PERMISSIONS_KEY } from '../common/auth/tenant-permissions.decorator';
import { testOwnerUser } from '../test/fixtures/user-profile.fixture';
import type { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('protegge summary con permesso reports.view', () => {
    const permissions = Reflect.getMetadata(
      TENANT_PERMISSIONS_KEY,
      DashboardController.prototype.getSummary,
    ) as string[];
    expect(permissions).toContain(TenantPermission.ReportsView);
  });

  it('summary delega al service con locationId opzionale', async () => {
    const summary = {
      productCount: 5,
      incomingSupplierOrders: 1,
      availableUnits: 10,
      lowStockCount: 0,
      levels: [],
      locations: [],
    };
    const user = testOwnerUser();
    const dashboard = {
      getSummary: vi.fn().mockResolvedValue(summary),
    };
    const controller = new DashboardController(dashboard as unknown as DashboardService);

    await expect(controller.getSummary('tenant-1', user, { locationId: 'loc-1' })).resolves.toEqual(
      summary,
    );
    expect(dashboard.getSummary).toHaveBeenCalledWith('tenant-1', 'loc-1', user);
  });
});
