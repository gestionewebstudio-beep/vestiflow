import { UserRole } from '@prisma/client';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';

export function testOwnerUser(overrides: Partial<UserProfileDto> = {}): UserProfileDto {
  return {
    id: 'user-owner',
    tenantId: 'tenant-1',
    tenantName: 'Test Tenant',
    tenantChannelProfile: 'gestionale',
    email: 'owner@test.it',
    displayName: 'Owner Test',
    avatarUrl: null,
    role: UserRole.owner,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    assignedLocationId: null,
    assignedLocationName: null,
    permissions: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}
