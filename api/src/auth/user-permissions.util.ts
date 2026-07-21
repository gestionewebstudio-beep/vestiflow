import { UserRole } from '@prisma/client';

import type { UserProfileDto } from './dto/user-profile.dto';
import {
  ALL_TENANT_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  TenantPermission,
  type TenantPermissionKey,
  isTenantPermissionKey,
} from './tenant-permission.constants';

type PermissionUser = Pick<UserProfileDto, 'role' | 'permissions' | 'supportSession'>;

export function hasFullTenantAccess(user: PermissionUser | null | undefined): boolean {
  if (!user) {
    return false;
  }
  if (user.supportSession) {
    return true;
  }
  return user.role === UserRole.owner;
}

/** Permessi effettivi: titolare = tutti; altrimenti salvati o default di ruolo. */
export function resolveEffectivePermissions(
  user: PermissionUser | null | undefined,
): readonly TenantPermissionKey[] {
  if (!user) {
    return [];
  }
  if (hasFullTenantAccess(user)) {
    return ALL_TENANT_PERMISSIONS;
  }
  const stored = user.permissions ?? [];
  if (stored.length > 0) {
    return stored.filter(isTenantPermissionKey);
  }
  return ROLE_DEFAULT_PERMISSIONS[user.role] ?? [];
}

export function hasTenantPermission(
  user: PermissionUser | null | undefined,
  permission: TenantPermissionKey,
): boolean {
  return resolveEffectivePermissions(user).includes(permission);
}

/**
 * Costo d'acquisto (dato sensibile §permessi): stessa regola del frontend
 * (`canViewPurchaseCosts`), applicata però alla RISPOSTA dell'API — nascondere
 * il campo solo nella UI lo lascerebbe leggibile nel traffico di rete.
 */
export function canViewPurchaseCosts(user: PermissionUser | null | undefined): boolean {
  if (hasFullTenantAccess(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.CatalogViewPurchaseCosts);
}

export function hasAnyTenantPermission(
  user: PermissionUser | null | undefined,
  permissions: readonly TenantPermissionKey[],
): boolean {
  if (permissions.length === 0) {
    return false;
  }
  const effective = resolveEffectivePermissions(user);
  return permissions.some((permission) => effective.includes(permission));
}

export function hasAllTenantPermissions(
  user: PermissionUser | null | undefined,
  permissions: readonly TenantPermissionKey[],
): boolean {
  if (permissions.length === 0) {
    return false;
  }
  const effective = resolveEffectivePermissions(user);
  return permissions.every((permission) => effective.includes(permission));
}

export function normalizeStoredPermissions(
  role: UserRole,
  permissions: readonly string[] | undefined,
): TenantPermissionKey[] {
  if (role === UserRole.owner) {
    return [];
  }
  if (!permissions?.length) {
    return [...ROLE_DEFAULT_PERMISSIONS[role]];
  }
  const unique = [...new Set(permissions.filter(isTenantPermissionKey))];
  return unique.length > 0 ? unique : [...ROLE_DEFAULT_PERMISSIONS[role]];
}
