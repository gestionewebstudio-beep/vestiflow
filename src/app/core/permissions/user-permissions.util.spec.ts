import { describe, expect, it } from 'vitest';

import { UserRole } from '@core/models/user.model';
import { TenantPermission } from '@core/models/tenant-permission.model';

import {
  hasAllTenantPermissionGroups,
  hasTenantPermission,
  resolveEffectivePermissions,
} from './user-permissions.util';

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

  /**
   * Lo specchio di `RequireAllPermissionGroups`: almeno uno da OGNI gruppo.
   * Un gruppo vuoto nega (errore di programmazione, non «nessun requisito»);
   * zero gruppi non chiedono niente.
   */
  it('hasAllTenantPermissionGroups: uno per gruppo, gruppo vuoto nega, zero gruppi consentono', () => {
    const commesso = {
      role: UserRole.Clerk,
      permissions: [TenantPermission.ReportsExport, TenantPermission.CustomersManage],
    };
    expect(
      hasAllTenantPermissionGroups(commesso, [
        [TenantPermission.ReportsExport],
        [TenantPermission.CustomersManage, TenantPermission.SectionCustomers],
      ]),
    ).toBe(true);
    expect(
      hasAllTenantPermissionGroups(commesso, [
        [TenantPermission.ReportsExport],
        [TenantPermission.SectionCustomers],
      ]),
    ).toBe(false);
    expect(hasAllTenantPermissionGroups(commesso, [[TenantPermission.ReportsExport], []])).toBe(
      false,
    );
    expect(hasAllTenantPermissionGroups(commesso, [])).toBe(true);
    expect(hasAllTenantPermissionGroups(null, [[TenantPermission.ReportsExport]])).toBe(false);
    // Il titolare passa qualunque gruppo, anche con l’array vuoto.
    expect(
      hasAllTenantPermissionGroups({ role: UserRole.Owner, permissions: [] }, [
        [TenantPermission.ReportsExport],
        [TenantPermission.CustomersManage],
      ]),
    ).toBe(true);
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
