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

export function testClerkUser(overrides: Partial<UserProfileDto> = {}): UserProfileDto {
  return testOwnerUser({
    id: 'user-clerk',
    email: 'clerk@test.it',
    displayName: 'Clerk Test',
    role: UserRole.clerk,
    assignedLocationId: 'loc-1',
    assignedLocationName: 'Negozio',
    ...overrides,
  });
}
