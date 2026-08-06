import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import {
  ALL_TENANT_PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type TenantPermissionKey,
  isTenantPermissionKey,
} from '@core/models/tenant-permission.model';

import { hasActiveSupportSession } from './platform-operator.util';

type PermissionUser = Pick<User, 'role' | 'permissions' | 'supportSession'>;

export function hasFullTenantAccess(user: PermissionUser | null | undefined): boolean {
  if (!user) {
    return false;
  }
  if (hasActiveSupportSession(user as User)) {
    return true;
  }
  return user.role === UserRole.Owner;
}

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
