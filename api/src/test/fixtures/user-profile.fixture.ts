import { UserRole } from '@prisma/client';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { ROLE_DEFAULT_PERMISSIONS } from '../../auth/tenant-permission.constants';


export function testOwnerUser(overrides: Partial<UserProfileDto> = {}): UserProfileDto {
  return {
    id: 'user-owner',
    tenantId: 'tenant-1',
    tenantName: 'Test Tenant',
    tenantChannelProfile: 'gestionale',
    // ⚠️ Nei test la Vendita manuale nasce ACCESA, al contrario della
    //   produzione (default `false`): questi fixture servono a provare la
    //   logica documentale, non l'interruttore. Chi prova l'interruttore lo
    //   dichiara, in un verso o nell’altro.
    manualUnloadEnabled: true,
    email: 'owner@test.it',
    displayName: 'Owner Test',
    avatarUrl: null,
    role: UserRole.owner,
    storeIds: [],
    isActive: true,
    mustChangePassword: false,
    isPlatformAdmin: false,
    hasAllLocationsAccess: false,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

export function testClerkUser(overrides: Partial<UserProfileDto> = {}): UserProfileDto {
  return {
    id: 'user-clerk',
    tenantId: 'tenant-1',
    tenantName: 'Test Tenant',
    tenantChannelProfile: 'gestionale',
    // ⚠️ Nei test la Vendita manuale nasce ACCESA, al contrario della
    //   produzione (default `false`): questi fixture servono a provare la
    //   logica documentale, non l'interruttore. Chi prova l'interruttore lo
    //   dichiara, in un verso o nell’altro.
    manualUnloadEnabled: true,
    email: 'clerk@test.it',
    displayName: 'Clerk Test',
    avatarUrl: null,
    role: UserRole.clerk,
    storeIds: [],
    isActive: true,
    mustChangePassword: false,
    isPlatformAdmin: false,
    hasAllLocationsAccess: false,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    // Preset clerk materializzato: la fixture rispecchia un commesso reale
    // (l'array salvato È la verità, i default vivono solo al salvataggio).
    permissions: [...ROLE_DEFAULT_PERMISSIONS[UserRole.clerk]],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}
