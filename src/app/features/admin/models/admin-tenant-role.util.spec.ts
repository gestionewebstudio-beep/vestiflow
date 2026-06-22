import { describe, expect, it } from 'vitest';

import { TENANT_USER_ROLE_LABELS } from '@core/models/user-role-labels.util';
import { UserRole } from '@core/models/user.model';

import { TENANT_ROLE_LABELS, TENANT_ROLE_OPTIONS, tenantRoleLabel } from './admin-tenant-role.util';

describe('admin-tenant-role.util', () => {
  it('re-esporta etichette ruolo tenant', () => {
    expect(TENANT_ROLE_LABELS).toBe(TENANT_USER_ROLE_LABELS);
    for (const role of Object.values(UserRole)) {
      expect(tenantRoleLabel(role)).toBe(TENANT_USER_ROLE_LABELS[role]);
    }
  });

  it('TENANT_ROLE_OPTIONS copre tutti i ruoli con label', () => {
    expect(TENANT_ROLE_OPTIONS).toHaveLength(Object.values(UserRole).length);
    for (const option of TENANT_ROLE_OPTIONS) {
      expect(option.label).toBe(TENANT_USER_ROLE_LABELS[option.value]);
    }
  });
});
