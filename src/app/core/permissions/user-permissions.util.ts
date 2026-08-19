import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import {
  ALL_TENANT_PERMISSIONS,
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

/**
 * Permessi effettivi (specchio della regola API): titolare = tutti; per gli
 * altri ruoli l'array salvato È la verità, anche vuoto. I default di ruolo
 * servono solo come preset negli editor, mai come fallback a runtime.
 */
export function resolveEffectivePermissions(
  user: PermissionUser | null | undefined,
): readonly TenantPermissionKey[] {
  if (!user) {
    return [];
  }
  if (hasFullTenantAccess(user)) {
    return ALL_TENANT_PERMISSIONS;
  }
  return withImpliedDocumentViews((user.permissions ?? []).filter(isTenantPermissionKey));
}

/**
 * «Gestisci» implica «Consulta» (specchio della regola API): l'implicazione si
 * applica una volta sola qui, così ogni `can*` la eredita.
 */
function withImpliedDocumentViews(
  permissions: readonly TenantPermissionKey[],
): readonly TenantPermissionKey[] {
  const result = new Set<TenantPermissionKey>(permissions);
  for (const permission of permissions) {
    const family =
      permission.startsWith('doc.') && permission.endsWith('.manage')
        ? permission.slice('doc.'.length, -'.manage'.length)
        : null;
    if (family) {
      result.add(`doc.${family}.view` as TenantPermissionKey);
    }
  }
  return [...result];
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
