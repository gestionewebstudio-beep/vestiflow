import { describe, expect, it } from 'vitest';

import {
  diffTenantUserSnapshots,
  tenantUserCreationDetails,
  type TenantUserAuditSnapshot,
} from './tenant-user-audit.util';

const base: TenantUserAuditSnapshot = {
  displayName: 'Commesso',
  role: 'clerk',
  isActive: true,
  hasAllLocationsAccess: false,
  assignedLocationIds: ['loc-rome', 'loc-nap'],
  defaultLocationId: 'loc-rome',
  permissions: ['inventory.manage', 'retail.register'],
};

describe('tenant-user-audit.util', () => {
  it('nessuna differenza => diff vuoto', () => {
    expect(diffTenantUserSnapshots(base, { ...base })).toEqual({});
  });

  it('array con gli stessi elementi in ordine diverso non sono una modifica', () => {
    const after: TenantUserAuditSnapshot = {
      ...base,
      assignedLocationIds: ['loc-nap', 'loc-rome'],
      permissions: ['retail.register', 'inventory.manage'],
    };
    expect(diffTenantUserSnapshots(base, after)).toEqual({});
  });

  it('registra prima/dopo dei soli campi cambiati', () => {
    const after: TenantUserAuditSnapshot = {
      ...base,
      role: 'manager',
      isActive: false,
    };
    expect(diffTenantUserSnapshots(base, after)).toEqual({
      role: { before: 'clerk', after: 'manager' },
      isActive: { before: true, after: false },
    });
  });

  it('registra i cambi di array con elenchi ordinati', () => {
    const after: TenantUserAuditSnapshot = {
      ...base,
      permissions: ['inventory.manage'],
    };
    expect(diffTenantUserSnapshots(base, after)).toEqual({
      permissions: {
        before: ['inventory.manage', 'retail.register'],
        after: ['inventory.manage'],
      },
    });
  });

  it('registra il cambio di sede predefinita (scalare nullable)', () => {
    const after: TenantUserAuditSnapshot = { ...base, defaultLocationId: null };
    expect(diffTenantUserSnapshots(base, after)).toEqual({
      defaultLocationId: { before: 'loc-rome', after: null },
    });
  });

  it('tenantUserCreationDetails fotografa lo stato iniziale completo', () => {
    const details = tenantUserCreationDetails(base);
    expect(details['role']).toEqual({ before: null, after: 'clerk' });
    expect(details['assignedLocationIds']).toEqual({
      before: null,
      after: ['loc-nap', 'loc-rome'],
    });
    expect(Object.keys(details)).toHaveLength(7);
  });
});
