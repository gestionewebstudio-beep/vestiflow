import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import type { UserRole as UserRoleType } from '@core/models/user.model';

/** Ruolo operatore piattaforma (provisioning clienti, non tenant negozio). */
export const PLATFORM_OPERATOR_ROLE_LABEL = 'Admin Vestiflow';

/** Etichette UI per i ruoli utente dentro un tenant negozio. */
export const TENANT_USER_ROLE_LABELS: Record<UserRoleType, string> = {
  [UserRole.Owner]: 'Titolare',
  [UserRole.Admin]: 'Amministratore negozio',
  [UserRole.Manager]: 'Manager',
  [UserRole.Clerk]: 'Commesso/a',
};

export function tenantUserRoleLabel(role: UserRoleType | null | undefined): string {
  if (!role) {
    return '—';
  }
  return TENANT_USER_ROLE_LABELS[role] ?? role;
}

/** Etichetta accesso in profilo: Admin Vestiflow vs ruolo negozio. */
export function resolveUserAccessLabel(
  user: Pick<User, 'role' | 'isPlatformAdmin'> | null | undefined,
): string {
  if (!user) {
    return '—';
  }
  if (user.isPlatformAdmin) {
    return PLATFORM_OPERATOR_ROLE_LABEL;
  }
  return tenantUserRoleLabel(user.role);
}
