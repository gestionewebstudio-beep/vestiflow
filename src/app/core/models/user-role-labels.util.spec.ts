import { describe, expect, it } from 'vitest';

import {
  PLATFORM_OPERATOR_ROLE_LABEL,
  TENANT_USER_ROLE_LABELS,
  resolveUserAccessLabel,
  tenantUserRoleLabel,
} from './user-role-labels.util';
import { UserRole } from './user.model';

describe('user-role-labels.util', () => {
  it('etichetta ogni ruolo tenant', () => {
    for (const role of Object.values(UserRole)) {
      expect(tenantUserRoleLabel(role)).toBe(TENANT_USER_ROLE_LABELS[role]);
    }
    expect(tenantUserRoleLabel(null)).toBe('—');
  });

  it('resolveUserAccessLabel distingue platform admin', () => {
    expect(
      resolveUserAccessLabel({
        role: UserRole.Clerk,
        isPlatformAdmin: true,
      }),
    ).toBe(PLATFORM_OPERATOR_ROLE_LABEL);
    expect(
      resolveUserAccessLabel({
        role: UserRole.Manager,
        isPlatformAdmin: false,
      }),
    ).toBe('Manager');
    expect(resolveUserAccessLabel(null)).toBe('—');
  });
});
