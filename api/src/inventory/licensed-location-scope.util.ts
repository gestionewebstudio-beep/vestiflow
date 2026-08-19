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

/** Una sede proponibile in una tendina: l'identità e il nome, niente altro. */
export interface ScopedLocationDto {
  readonly id: string;
  readonly name: string;
}

/**
 * Le sedi che l'utente può **consultare** o su cui può **operare**, con i nomi.
 *
 * Esiste perché ogni tendina Sede faceva da sé la stessa cosa in modo un po'
 * diverso — chi filtrava per licenza e chi no, chi passava dallo scope centrale
 * e chi rifaceva il controllo a mano con un `try/catch` attorno a un `assert`.
 * Il risultato erano elenchi che differivano per motivi che il modello centrale
 * non conosceva.
 *
 * ⚠️ **Il `mode` è l'unica differenza ammessa fra un elenco e l'altro**, e non
 * è una differenza di questa funzione: è quella del modello centrale, dove la
 * lettura ammette anche `inventory.view_all_locations` e la scrittura no.
 * Chi ha bisogno di un insieme diverso da questi due sta introducendo una
 * policy nuova, e va discussa prima di scriverla.
 */
export async function listLocationsInScope(
  db: LocationReader,
  tenantId: string,
  user: UserProfileDto | undefined,
  mode: LocationScopeMode,
): Promise<ScopedLocationDto[]> {
  const scope = await resolveOperationalLocationScope(db, tenantId, user, undefined, mode);
  if (!scope || scope.length === 0) {
    return [];
  }
  return db.location.findMany({
    where: { tenantId, id: { in: [...scope] } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
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
