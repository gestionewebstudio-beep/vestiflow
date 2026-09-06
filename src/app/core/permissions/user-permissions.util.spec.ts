import { describe, expect, it } from 'vitest';

import { UserRole } from '@core/models/user.model';
import { TenantPermission } from '@core/models/tenant-permission.model';

import { hasTenantPermission, resolveEffectivePermissions } from './user-permissions.util';

describe('user-permissions.util (FE)', () => {
  it('resolveEffectivePermissions esclude permessi legacy non validi', () => {
    const perms = resolveEffectivePermissions({
      role: UserRole.Clerk,
      permissions: ['settings.integrations', TenantPermission.InventoryManage],
    });

    expect(perms).not.toContain('settings.integrations');
    expect(perms).toContain(TenantPermission.InventoryManage);
  });

  it('resolveEffectivePermissions: array vuoto = nessun permesso (specchio della regola API)', () => {
    const perms = resolveEffectivePermissions({ role: UserRole.Clerk, permissions: [] });

    expect(perms).toEqual([]);
  });

  it('hasTenantPermission rispetta permessi salvati filtrati', () => {
    expect(
      hasTenantPermission(
        {
          role: UserRole.Clerk,
          permissions: ['settings.integrations', TenantPermission.SectionReports],
        },
        TenantPermission.InventoryManage,
      ),
    ).toBe(false);
    expect(
      hasTenantPermission(
        {
          role: UserRole.Clerk,
          permissions: ['settings.integrations', TenantPermission.SectionReports],
        },
        TenantPermission.SectionReports,
      ),
    ).toBe(true);
  });
});
