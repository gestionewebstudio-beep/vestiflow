import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { Location } from '@core/models/location.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { InventoryService } from '@features/inventory/services/inventory.service';
import { ShopifyConnectionService } from '@features/integrations/shopify/services/shopify-connection.service';
import { ShopifySyncWatchService } from '@features/integrations/shopify/services/shopify-sync-watch.service';

import { OperationalLocationsService } from './operational-locations.service';

function testLocation(id: string, name: string): Location {
  return {
    id,
    name,
    tenantId: 'tenant-1',
    isActive: true,
    licensedInVf: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function testUser(overrides: Partial<User>): User {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'clerk@test.it',
    displayName: 'Commesso',
    avatarUrl: null,
    role: UserRole.Clerk,
    storeIds: [],
    hasAllLocationsAccess: false,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Gestionale,
    tenantName: 'Negozio Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup(user: User, locations: readonly Location[]): OperationalLocationsService {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { currentUser: signal<User | null>(user) } },
      {
        provide: InventoryService,
        useValue: {
          // Emissione sincrona: alimenta subito il toSignal delle location.
          watchLocationsInvalidated: () => of('locations'),
          getLocations: () => of(locations),
          invalidateLocationsCache: vi.fn(),
        },
      },
      {
        provide: ShopifySyncWatchService,
        useValue: {
          watchSyncCompleted: () => EMPTY,
          watchConnectionInvalidated: () => EMPTY,
        },
      },
      { provide: ShopifyConnectionService, useValue: { getConnection: () => of(null) } },
    ],
  });
  return TestBed.inject(OperationalLocationsService);
}

describe('OperationalLocationsService — sede predefinita', () => {
  const milano = testLocation('loc-milano', 'Milano');
  const roma = testLocation('loc-roma', 'Roma');

  it('defaultLocation() restituisce la predefinita quando è tra le sedi scrivibili', () => {
    const service = setup(
      testUser({
        assignedLocationIds: ['loc-milano', 'loc-roma'],
        assignedLocations: [
          { id: 'loc-milano', name: 'Milano' },
          { id: 'loc-roma', name: 'Roma' },
        ],
        defaultLocationId: 'loc-roma',
        defaultLocation: { id: 'loc-roma', name: 'Roma' },
      }),
      [milano, roma],
    );

    expect(service.defaultLocation()?.id).toBe('loc-roma');
  });

  it('defaultLocation() è null se la predefinita non è tra le sedi autorizzate', () => {
    const service = setup(
      testUser({
        assignedLocationIds: ['loc-milano'],
        assignedLocations: [{ id: 'loc-milano', name: 'Milano' }],
        defaultLocationId: 'loc-roma',
        defaultLocation: { id: 'loc-roma', name: 'Roma' },
      }),
      [milano, roma],
    );

    expect(service.defaultLocation()).toBeNull();
  });

  it('defaultLocation() è null senza predefinita impostata', () => {
    const service = setup(
      testUser({
        assignedLocationIds: ['loc-milano', 'loc-roma'],
        assignedLocations: [
          { id: 'loc-milano', name: 'Milano' },
          { id: 'loc-roma', name: 'Roma' },
        ],
      }),
      [milano, roma],
    );

    expect(service.defaultLocation()).toBeNull();
  });

  it('suggestedWriteLocation() propone la predefinita, o la sede unica in mono-location', () => {
    const monoLocation = setup(
      testUser({
        assignedLocationIds: ['loc-milano'],
        assignedLocations: [{ id: 'loc-milano', name: 'Milano' }],
      }),
      [milano, roma],
    );

    // Nessuna predefinita ma una sola sede scrivibile: suggerita quella.
    expect(monoLocation.suggestedWriteLocation()?.id).toBe('loc-milano');
  });

  it('suggestedWriteLocation() è null con più sedi e nessuna predefinita', () => {
    const service = setup(
      testUser({
        assignedLocationIds: ['loc-milano', 'loc-roma'],
        assignedLocations: [
          { id: 'loc-milano', name: 'Milano' },
          { id: 'loc-roma', name: 'Roma' },
        ],
      }),
      [milano, roma],
    );

    expect(service.suggestedWriteLocation()).toBeNull();
  });

  it('mono-sede vincolato: scrittura limitata alla sede assegnata, destinazioni trasferimento complete', () => {
    const service = setup(
      testUser({
        assignedLocationIds: ['loc-milano'],
        assignedLocations: [{ id: 'loc-milano', name: 'Milano' }],
      }),
      [milano, roma],
    );

    expect(service.writeLocations().map((location) => location.id)).toEqual(['loc-milano']);
    expect(service.transferTargetLocations().map((location) => location.id)).toEqual([
      'loc-milano',
      'loc-roma',
    ]);
    expect(service.isFixedSingleStore()).toBe(true);
    expect(service.fixedSingleStoreLocationId()).toBe('loc-milano');
    expect(service.fixedSingleStoreLabel()).toBe('Milano');
    expect(service.allTenantLocations().length).toBe(2);
  });

  it('operatore piattaforma: nessuna location operativa né predefinita', () => {
    const service = setup(testUser({ isPlatformAdmin: true, defaultLocationId: 'loc-milano' }), [
      milano,
      roma,
    ]);

    expect(service.locations()).toEqual([]);
    expect(service.writeLocations()).toEqual([]);
    expect(service.defaultLocation()).toBeNull();
  });
});
