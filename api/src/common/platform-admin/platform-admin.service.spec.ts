import { describe, expect, it } from 'vitest';

import { PlatformAdminService } from './platform-admin.service';

describe('PlatformAdminService', () => {
  it('riconosce email admin da variabile d ambiente', () => {
    const service = new PlatformAdminService({
      get: (key: string) =>
        key === 'PLATFORM_ADMIN_EMAILS' ? ' Admin@VestiFlow.test , ops@test.it ' : undefined,
    } as never);

    expect(service.isPlatformAdmin('admin@vestiflow.test')).toBe(true);
    expect(service.isPlatformAdmin('ops@test.it')).toBe(true);
    expect(service.isPlatformAdmin('other@test.it')).toBe(false);
  });

  it('restituisce false se la lista admin è vuota', () => {
    const service = new PlatformAdminService({
      get: () => '',
    } as never);

    expect(service.isPlatformAdmin('admin@test.it')).toBe(false);
  });
});
