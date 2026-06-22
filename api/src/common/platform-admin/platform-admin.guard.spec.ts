import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PlatformAdminService } from './platform-admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';

describe('PlatformAdminGuard', () => {
  const platformAdmin = { isPlatformAdmin: vi.fn() };
  const guard = new PlatformAdminGuard(platformAdmin as unknown as PlatformAdminService);

  it('consente email admin di piattaforma', () => {
    platformAdmin.isPlatformAdmin.mockReturnValue(true);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ appUser: { email: 'admin@vestiflow.test' } }),
      }),
    };

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('rifiuta utente non admin', () => {
    platformAdmin.isPlatformAdmin.mockReturnValue(false);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ appUser: { email: 'user@example.com' } }),
      }),
    };

    expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
  });
});
