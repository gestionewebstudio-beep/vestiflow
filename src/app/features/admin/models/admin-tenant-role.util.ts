import { UserRole } from '@core/models/user.model';
import type { UserRole as UserRoleType } from '@core/models/user.model';
import { TENANT_USER_ROLE_LABELS, tenantUserRoleLabel } from '@core/models/user-role-labels.util';

export const TENANT_ROLE_LABELS = TENANT_USER_ROLE_LABELS;

export const TENANT_ROLE_OPTIONS: readonly {
  readonly value: UserRoleType;
  readonly label: string;
}[] = [
  { value: UserRole.Owner, label: TENANT_USER_ROLE_LABELS[UserRole.Owner] },
  { value: UserRole.Admin, label: TENANT_USER_ROLE_LABELS[UserRole.Admin] },
  { value: UserRole.Manager, label: TENANT_USER_ROLE_LABELS[UserRole.Manager] },
  { value: UserRole.Clerk, label: TENANT_USER_ROLE_LABELS[UserRole.Clerk] },
];

export const tenantRoleLabel = tenantUserRoleLabel;
