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

  it('resolveEffectivePermissions: array vuoto = nessun permesso (mai fallback ai preset)', () => {
    const perms = resolveEffectivePermissions({ role: UserRole.clerk, permissions: [] });
    expect(perms).toEqual([]);
  });

  it('hasTenantPermission rispetta permessi salvati', () => {
    expect(
      hasTenantPermission(
        {
          role: UserRole.clerk,
          permissions: [TenantPermission.SectionReports],
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

  it('normalizeStoredPermissions materializza i preset del ruolo se non c’è input', () => {
    const normalized = normalizeStoredPermissions(UserRole.clerk, undefined);
    expect(normalized).toContain(TenantPermission.RetailRegister);
    expect(normalized).not.toContain(TenantPermission.InventoryViewAllLocations);
  });

  it('normalizeStoredPermissions conserva l’array vuoto esplicito (zero permessi)', () => {
    expect(normalizeStoredPermissions(UserRole.clerk, [])).toEqual([]);
    expect(normalizeStoredPermissions(UserRole.manager, [])).toEqual([]);
  });

  it('normalizeStoredPermissions per il titolare restituisce sempre array vuoto', () => {
    expect(
      normalizeStoredPermissions(UserRole.owner, [TenantPermission.SectionReports]),
    ).toEqual([]);
  });

  it('normalizeStoredPermissions filtra chiavi obsolete prima del salvataggio', () => {
    const normalized = normalizeStoredPermissions(UserRole.clerk, [
      'settings.integrations',
      TenantPermission.SectionReports,
      TenantPermission.SectionReports,
    ]);

    expect(normalized).not.toContain('settings.integrations');
    expect(normalized).toEqual([TenantPermission.SectionReports]);
  });

  it('hasAnyTenantPermission richiede almeno un permesso del gruppo', () => {
    const user = {
      role: UserRole.clerk,
      permissions: [TenantPermission.SectionCustomers],
    };
    expect(
      hasAnyTenantPermission(user, [
        TenantPermission.SectionReports,
        TenantPermission.SectionCustomers,
      ]),
    ).toBe(true);
    expect(
      hasAnyTenantPermission(user, [
        TenantPermission.SectionReports,
        TenantPermission.InventoryManage,
      ]),
    ).toBe(false);
  });
});
