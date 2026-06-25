import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';

export type LicensedLocationScope = readonly string[];

type LocationReader = Pick<PrismaService, 'location'>;

const licensedOperationalWhere = (tenantId: string) =>
  ({
    tenantId,
    licensedInVf: true,
    isActive: true,
  }) as const;

/**
 * Sedi operative incluse nel piano. Con locationId singolo verifica che sia licenziata.
 * @returns null se nessuna sede in scope (risultato vuoto).
 */
export async function resolveLicensedLocationScope(
  db: LocationReader,
  tenantId: string,
  locationId?: string,
): Promise<LicensedLocationScope | null> {
  if (locationId) {
    const location = await db.location.findFirst({
      where: { ...licensedOperationalWhere(tenantId), id: locationId },
      select: { id: true },
    });
    return location ? [locationId] : null;
  }

  const locations = await db.location.findMany({
    where: licensedOperationalWhere(tenantId),
    select: { id: true },
    orderBy: { name: 'asc' },
  });

  return locations.length > 0 ? locations.map((row) => row.id) : null;
}

export function locationScopeToInventoryLevelFilter(
  scope: LicensedLocationScope,
): Pick<Prisma.InventoryLevelWhereInput, 'locationId'> {
  if (scope.length === 1) {
    return { locationId: scope[0]! };
  }
  return { locationId: { in: [...scope] } };
}

export function locationScopeToMovementFilter(
  scope: LicensedLocationScope,
): Pick<Prisma.StockMovementWhereInput, 'locationId'> {
  if (scope.length === 1) {
    return { locationId: scope[0]! };
  }
  return { locationId: { in: [...scope] } };
}

export function locationScopeToCountSessionFilter(
  scope: LicensedLocationScope,
): Pick<Prisma.InventoryCountSessionWhereInput, 'locationId'> {
  if (scope.length === 1) {
    return { locationId: scope[0]! };
  }
  return { locationId: { in: [...scope] } };
}
