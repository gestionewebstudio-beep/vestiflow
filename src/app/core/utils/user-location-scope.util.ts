import type { Location } from '@core/models/location.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { TenantPermission } from '@core/models/tenant-permission.model';

import { hasActiveSupportSession } from '@core/permissions/platform-operator.util';
import { hasFullTenantAccess, hasTenantPermission } from '@core/permissions/user-permissions.util';

/** Consultazione giacenze/movimenti su tutte le sedi licenziate del tenant. */
export function canViewAllOperationalLocations(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }
  if (hasFullTenantAccess(user) || hasActiveSupportSession(user)) {
    return true;
  }
  return hasTenantPermission(user, TenantPermission.InventoryViewAllLocations);
}

/** Titolare, admin illimitato o permesso view_all: selettore location in topbar e filtri giacenze. */
export function canSwitchOperationalLocation(user: User | null | undefined): boolean {
  if (canViewAllOperationalLocations(user)) {
    return true;
  }
  return hasUnrestrictedWriteAccess(user);
}

export function requiresAssignedOperationalLocation(user: User | null | undefined): boolean {
  if (!user || hasActiveSupportSession(user)) {
    return false;
  }
  return user.role === UserRole.Manager || user.role === UserRole.Clerk;
}

/**
 * Cambio INTENZIONALE di comportamento: prima QUALSIASI admin era illimitato.
 * Ora un admin è illimitato solo con hasAllLocationsAccess === true, per restare
 * coerente con la policy server (un admin scoped non può scrivere fuori dalle
 * sedi assegnate, quindi la UI non deve lasciarlo "switchare" liberamente).
 * Il titolare resta sempre illimitato incondizionatamente.
 */
function hasUnrestrictedWriteAccess(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }
  if (hasActiveSupportSession(user)) {
    return true;
  }
  if (user.role === UserRole.Owner) {
    return true;
  }
  return user.role === UserRole.Admin && user.hasAllLocationsAccess === true;
}

/** Location visibili in consultazione (liste, filtri, report). */
export function filterLocationsForRead(
  locations: readonly Location[],
  user: User | null | undefined,
): readonly Location[] {
  if (!user) {
    return [];
  }
  if (
    hasFullTenantAccess(user) ||
    hasTenantPermission(user, TenantPermission.InventoryViewAllLocations)
  ) {
    return locations;
  }
  return filterLocationsByAssignment(locations, user);
}

/** Location su cui l'utente può agire (form movimenti, inventario, vendite al banco). */
export function filterLocationsByUserAssignment(
  locations: readonly Location[],
  user: User | null | undefined,
): readonly Location[] {
  if (!user || hasUnrestrictedWriteAccess(user)) {
    return locations;
  }
  return filterLocationsByAssignment(locations, user);
}

function filterLocationsByAssignment(
  locations: readonly Location[],
  user: User,
): readonly Location[] {
  const assignedIds = user.assignedLocationIds;
  if (assignedIds.length === 0) {
    return [];
  }
  return locations.filter((location) => assignedIds.includes(location.id));
}

/**
 * Sede fissa (nessuna scelta possibile): illimitato -> null; esattamente 1 sede
 * assegnata -> quell'id; 0 sedi (nessun accesso) o 2+ sedi (l'utente deve
 * scegliere tra un sottoinsieme) -> null.
 */
export function resolveFixedOperationalLocationId(user: User | null | undefined): string | null {
  if (!user || hasUnrestrictedWriteAccess(user)) {
    return null;
  }
  return user.assignedLocationIds.length === 1 ? (user.assignedLocationIds[0] ?? null) : null;
}

/** Utente vincolato a una sola sede operativa (manager/commesso con sede assegnata). */
export function isFixedSingleStoreUser(user: User | null | undefined): boolean {
  return resolveFixedOperationalLocationId(user) !== null;
}
