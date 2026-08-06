import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../prisma/prisma.service';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  applyReadLocationScope,
  applyWriteLocationScope,
  hasUnrestrictedReadLocationAccess,
} from './user-location-scope.util';

export type LicensedLocationScope = readonly string[];

type LocationReader = Pick<PrismaService, 'location'>;

const licensedOperationalWhere = (tenantId: string) =>
  ({
    tenantId,
    licensedInVf: true,
    isActive: true,
  }) as const;

export type LocationScopeMode = 'read' | 'write';

/** Scope consultazione (liste giacenze/movimenti). */
export const INVENTORY_VIEW_SCOPE_MODE: LocationScopeMode = 'read';

/** Scope azioni (export, registrazione movimenti, inventario fisico). */
export const INVENTORY_ACTION_SCOPE_MODE: LocationScopeMode = 'write';

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

/** Scope licenziato tenant ∩ permessi/sede utente. */
export async function resolveOperationalLocationScope(
  db: LocationReader,
  tenantId: string,
  user: UserProfileDto | undefined,
  locationId?: string,
  mode: LocationScopeMode = 'read',
): Promise<LicensedLocationScope | null> {
  const licensed = await resolveLicensedLocationScope(db, tenantId, locationId);
  if (!licensed) {
    return null;
  }
  if (!user) {
    return licensed;
  }
  return mode === 'write'
    ? applyWriteLocationScope(licensed, user)
    : applyReadLocationScope(licensed, user);
}

/**
 * Scope location per le LISTE di risorse legate a una sede (documenti, ordini
 * fornitore): 'unrestricted' = nessun filtro da applicare (nessun utente,
 * titolare, hasAllLocationsAccess o permesso view_all_locations); un array =
 * solo quelle sedi (intersezione sedi assegnate ∩ licenziate); null = nessuna
 * sede in scope, lista vuota.
 */
export async function resolveReadableListLocationScope(
  db: LocationReader,
  tenantId: string,
  user: UserProfileDto | undefined,
): Promise<LicensedLocationScope | 'unrestricted' | null> {
  if (!user || hasUnrestrictedReadLocationAccess(user)) {
    return 'unrestricted';
  }
  const licensed = await resolveLicensedLocationScope(db, tenantId);
  if (!licensed) {
    return null;
  }
  return applyReadLocationScope(licensed, user);
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
