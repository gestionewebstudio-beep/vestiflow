import { describe, expect, it, vi } from 'vitest';

import type { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

describe('DashboardController', () => {
  it('summary delega al service', async () => {
    const dashboard = {
      getSummary: vi.fn().mockResolvedValue({
        productCount: 5,
        incomingSupplierOrders: 1,
        levels: [],
        locations: [],
      }),
    };
    const controller = new DashboardController(dashboard as unknown as DashboardService);

    await expect(controller.getSummary('tenant-1')).resolves.toEqual({
      productCount: 5,
      incomingSupplierOrders: 1,
      levels: [],
      locations: [],
    });
  });
});
