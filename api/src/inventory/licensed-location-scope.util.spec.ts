import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import {
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  resolveLicensedLocationScope,
} from './licensed-location-scope.util';

describe('licensed-location-scope.util', () => {
  const tenantId = 'tenant-1';

  it('resolveLicensedLocationScope senza filtro restituisce solo sedi licenziate attive', async () => {
    const db = {
      location: {
        findMany: vi.fn().mockResolvedValue([{ id: 'loc-1' }, { id: 'loc-2' }]),
        findFirst: vi.fn(),
      },
    };

    const scope = await resolveLicensedLocationScope(db as unknown as PrismaService, tenantId);

    expect(scope).toEqual(['loc-1', 'loc-2']);
    expect(db.location.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          licensedInVf: true,
          isActive: true,
        }),
      }),
    );
  });

  it('resolveLicensedLocationScope con locationId non licenziata restituisce null', async () => {
    const db = {
      location: {
        findMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const scope = await resolveLicensedLocationScope(
      db as unknown as PrismaService,
      tenantId,
      'loc-unlicensed',
    );

    expect(scope).toBeNull();
    expect(db.location.findMany).not.toHaveBeenCalled();
  });

  it('resolveLicensedLocationScope senza sedi licenziate restituisce null', async () => {
    const db = {
      location: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
      },
    };

    const scope = await resolveLicensedLocationScope(db as unknown as PrismaService, tenantId);

    expect(scope).toBeNull();
  });

  it('resolveLicensedLocationScope con locationId licenziata restituisce scope singolo', async () => {
    const db = {
      location: {
        findMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: 'loc-1' }),
      },
    };

    const scope = await resolveLicensedLocationScope(
      db as unknown as PrismaService,
      tenantId,
      'loc-1',
    );

    expect(scope).toEqual(['loc-1']);
  });

  it('locationScopeToInventoryLevelFilter usa IN per più sedi', () => {
    expect(locationScopeToInventoryLevelFilter(['loc-1', 'loc-2'])).toEqual({
      locationId: { in: ['loc-1', 'loc-2'] },
    });
  });

  it('locationScopeToMovementFilter usa locationId singolo per una sede', () => {
    expect(locationScopeToMovementFilter(['loc-1'])).toEqual({
      locationId: 'loc-1',
    });
  });
});
