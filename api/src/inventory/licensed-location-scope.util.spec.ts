import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service';
import {
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  scopedLocationFilter,
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


  /*
    ⛔ **La sede CHIESTA restringe, non sostituisce.**

    Il difetto che questa funzione chiude viveva in tre servizi, scritto
    uguale in tutti e tre: prima il perimetro, poi la sede del client, sulla
    stessa proprieta` — e la seconda chiave vinceva.
  */
  describe('scopedLocationFilter', () => {
    it('senza limiti e senza richiesta non filtra nulla', () => {
      expect(scopedLocationFilter('unrestricted')).toEqual({});
    });

    it('senza limiti, la sede chiesta si applica', () => {
      expect(scopedLocationFilter('unrestricted', 'loc-1')).toEqual({ locationId: 'loc-1' });
    });

    it('con un perimetro e nessuna richiesta, vale il perimetro', () => {
      expect(scopedLocationFilter(['loc-1', 'loc-2'])).toEqual({
        locationId: { in: ['loc-1', 'loc-2'] },
      });
    });

    it('⭐ la sede chiesta DENTRO il perimetro restringe', () => {
      expect(scopedLocationFilter(['loc-1', 'loc-2'], 'loc-2')).toEqual({
        locationId: 'loc-2',
      });
    });

    it('⛔ la sede chiesta FUORI dal perimetro non lo sostituisce: null', () => {
      expect(scopedLocationFilter(['loc-1'], 'loc-2')).toBeNull();
    });

    it('⛔ e un perimetro VUOTO non si fa aprire da una richiesta', () => {
      expect(scopedLocationFilter([], 'loc-1')).toBeNull();
    });
  });
});
