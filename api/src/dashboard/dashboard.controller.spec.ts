import { describe, expect, it, vi } from 'vitest';

import type { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('summary delega al service con locationId opzionale', async () => {
    const summary = {
      productCount: 5,
      incomingSupplierOrders: 1,
      availableUnits: 10,
      lowStockCount: 0,
      levels: [],
      locations: [],
    };
    const dashboard = {
      getSummary: vi.fn().mockResolvedValue(summary),
    };
    const controller = new DashboardController(dashboard as unknown as DashboardService);

    await expect(controller.getSummary('tenant-1', { locationId: 'loc-1' })).resolves.toEqual(
      summary,
    );
    expect(dashboard.getSummary).toHaveBeenCalledWith('tenant-1', 'loc-1');
  });
});
