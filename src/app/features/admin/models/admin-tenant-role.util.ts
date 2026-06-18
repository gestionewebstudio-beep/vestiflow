import { UserRole } from '@core/models/user.model';
import type { UserRole as UserRoleType } from '@core/models/user.model';

export const TENANT_ROLE_LABELS: Record<UserRoleType, string> = {
  [UserRole.Owner]: 'Titolare',
  [UserRole.Admin]: 'Amministratore',
  [UserRole.Manager]: 'Manager',
  [UserRole.Clerk]: 'Commesso/a',
};

export const TENANT_ROLE_OPTIONS: readonly {
  readonly value: UserRoleType;
  readonly label: string;
}[] = [
  { value: UserRole.Owner, label: TENANT_ROLE_LABELS[UserRole.Owner] },
  { value: UserRole.Admin, label: TENANT_ROLE_LABELS[UserRole.Admin] },
  { value: UserRole.Manager, label: TENANT_ROLE_LABELS[UserRole.Manager] },
  { value: UserRole.Clerk, label: TENANT_ROLE_LABELS[UserRole.Clerk] },
];

export function tenantRoleLabel(role: UserRoleType | null | undefined): string {
  if (!role) {
    return '—';
  }
  return TENANT_ROLE_LABELS[role] ?? role;
}
