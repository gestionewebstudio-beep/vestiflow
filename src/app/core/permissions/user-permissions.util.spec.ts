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

  it('resolveEffectivePermissions usa preset ruolo se array vuoto', () => {
    const perms = resolveEffectivePermissions({ role: UserRole.Clerk, permissions: [] });

    expect(perms).not.toContain(TenantPermission.InventoryViewAllLocations);
    expect(perms).toContain(TenantPermission.RetailRegister);
  });

  it('hasTenantPermission rispetta permessi salvati filtrati', () => {
    expect(
      hasTenantPermission(
        {
          role: UserRole.Clerk,
          permissions: ['settings.integrations', TenantPermission.ReportsView],
        },
        TenantPermission.InventoryManage,
      ),
    ).toBe(false);
    expect(
      hasTenantPermission(
        {
          role: UserRole.Clerk,
          permissions: ['settings.integrations', TenantPermission.ReportsView],
        },
        TenantPermission.ReportsView,
      ),
    ).toBe(true);
  });
});
