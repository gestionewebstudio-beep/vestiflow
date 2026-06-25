import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { TenantPermission } from './tenant-permission.constants';
import {
  hasAnyTenantPermission,
  hasFullTenantAccess,
  hasTenantPermission,
  normalizeStoredPermissions,
  resolveEffectivePermissions,
} from './user-permissions.util';

describe('user-permissions.util', () => {
  it('hasFullTenantAccess solo per titolare', () => {
    expect(hasFullTenantAccess({ role: UserRole.owner, permissions: [] })).toBe(true);
    expect(hasFullTenantAccess({ role: UserRole.admin, permissions: [] })).toBe(false);
  });

  it('resolveEffectivePermissions usa preset ruolo se array vuoto', () => {
    const perms = resolveEffectivePermissions({ role: UserRole.clerk, permissions: [] });
    expect(perms).not.toContain(TenantPermission.InventoryViewAllLocations);
    expect(perms).toContain(TenantPermission.RetailRegister);
  });

  it('hasTenantPermission rispetta permessi salvati', () => {
    expect(
      hasTenantPermission(
        {
          role: UserRole.clerk,
          permissions: [TenantPermission.ReportsView],
        },
        TenantPermission.InventoryManage,
      ),
    ).toBe(false);
  });

  it('resolveEffectivePermissions esclude permessi legacy non validi', () => {
    const perms = resolveEffectivePermissions({
      role: UserRole.clerk,
      permissions: ['settings.integrations', TenantPermission.InventoryManage],
    });

    expect(perms).not.toContain('settings.integrations');
    expect(perms).toContain(TenantPermission.InventoryManage);
  });

  it('normalizeStoredPermissions filtra chiavi obsolete prima del salvataggio', () => {
    const normalized = normalizeStoredPermissions(UserRole.clerk, [
      'settings.integrations',
      TenantPermission.ReportsView,
      TenantPermission.ReportsView,
    ]);

    expect(normalized).not.toContain('settings.integrations');
    expect(normalized).toEqual([TenantPermission.ReportsView]);
  });

  it('hasAnyTenantPermission richiede almeno un permesso del gruppo', () => {
    const user = {
      role: UserRole.clerk,
      permissions: [TenantPermission.CustomersView],
    };
    expect(
      hasAnyTenantPermission(user, [
        TenantPermission.ReportsView,
        TenantPermission.CustomersView,
      ]),
    ).toBe(true);
    expect(
      hasAnyTenantPermission(user, [
        TenantPermission.ReportsView,
        TenantPermission.InventoryManage,
      ]),
    ).toBe(false);
  });
});
