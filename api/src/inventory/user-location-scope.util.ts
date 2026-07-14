import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { TenantPermission } from '../auth/tenant-permission.constants';
import { hasFullTenantAccess, hasTenantPermission } from '../auth/user-permissions.util';

import type { LicensedLocationScope } from './licensed-location-scope.util';

type LocationAccessUser = Pick<
  UserProfileDto,
  'role' | 'supportSession' | 'hasAllLocationsAccess' | 'assignedLocationIds' | 'permissions'
>;

/** Titolare, o utente con accesso esplicito a tutte le sedi, operano su qualunque sede. */
export function hasUnrestrictedLocationAccess(
  user: Pick<UserProfileDto, 'role' | 'supportSession' | 'hasAllLocationsAccess'>,
): boolean {
  if (user.supportSession) {
    return true;
  }
  return user.role === UserRole.owner || user.hasAllLocationsAccess === true;
}

export function requiresAssignedLocation(
  user: Pick<UserProfileDto, 'role' | 'supportSession' | 'hasAllLocationsAccess'>,
): boolean {
  return !hasUnrestrictedLocationAccess(user);
}

/**
 * Accesso di LETTURA senza vincolo di sede: titolare/supporto, accesso esplicito
 * a tutte le sedi, o permesso `inventory.view_all_locations`.
 */
export function hasUnrestrictedReadLocationAccess(user: LocationAccessUser): boolean {
  return (
    hasFullTenantAccess(user) ||
    hasUnrestrictedLocationAccess(user) ||
    hasTenantPermission(user, TenantPermission.InventoryViewAllLocations)
  );
}

/**
 * Verifica di lettura per l'apertura diretta di una risorsa per id (documento,
 * ordine fornitore, ...): se la risorsa ha una sede e l'utente non ha accesso
 * illimitato in lettura né la sede tra quelle assegnate, nega l'accesso senza
 * rivelare altri dettagli. Passa sempre quando user o locationId sono assenti
 * (risorse senza sede: fatture, corrispettivi, ecc.).
 */
export function assertLocationReadableInUserScope(
  user: LocationAccessUser | null | undefined,
  locationId: string | null | undefined,
  message = 'Non sei autorizzato ad accedere a questa risorsa.',
): void {
  if (!user || !locationId) {
    return;
  }
  if (hasUnrestrictedReadLocationAccess(user)) {
    return;
  }
  if (!user.assignedLocationIds.includes(locationId)) {
    throw new ForbiddenException(message);
  }
}

/** Scope di lettura: tutte le sedi se permesso view_all o accesso pieno, altrimenti sedi assegnate. */
export function applyReadLocationScope(
  licensedScope: LicensedLocationScope,
  user: LocationAccessUser,
): LicensedLocationScope | null {
  if (hasFullTenantAccess(user)) {
    return licensedScope;
  }
  if (hasTenantPermission(user, TenantPermission.InventoryViewAllLocations)) {
    return licensedScope;
  }
  if (hasUnrestrictedLocationAccess(user)) {
    return licensedScope;
  }
  return applyAssignedLocationScope(licensedScope, user);
}

/** Scope operativo scrittura: accesso pieno = tutte; altrimenti sedi assegnate. */
export function applyWriteLocationScope(
  licensedScope: LicensedLocationScope,
  user: LocationAccessUser,
): LicensedLocationScope | null {
  if (hasFullTenantAccess(user) || hasUnrestrictedLocationAccess(user)) {
    return licensedScope;
  }
  return applyAssignedLocationScope(licensedScope, user);
}

function applyAssignedLocationScope(
  licensedScope: LicensedLocationScope,
  user: Pick<UserProfileDto, 'assignedLocationIds'>,
): LicensedLocationScope | null {
  const assigned = licensedScope.filter((id) => user.assignedLocationIds.includes(id));
  return assigned.length > 0 ? assigned : null;
}

/**
 * Verifica pura di appartenenza (NESSUN controllo di permesso applicativo): la location
 * richiesta è tra quelle autorizzate per l'utente? Riusabile da qualunque modulo che gestisce
 * già da sé il controllo dei permessi tramite i propri guard di rotta (es. RequirePermissions).
 */
export function assertLocationInUserScope(
  user: LocationAccessUser,
  locationId: string,
  purpose: 'write' | 'transferDestination' = 'write',
): void {
  if (hasFullTenantAccess(user) || hasUnrestrictedLocationAccess(user)) {
    return;
  }
  if (purpose === 'transferDestination') {
    return;
  }
  if (user.assignedLocationIds.length === 0) {
    throw new ForbiddenException(
      "Nessuna sede operativa assegnata. Contatta il titolare o un amministratore dell'account.",
    );
  }
  if (!user.assignedLocationIds.includes(locationId)) {
    throw new ForbiddenException('Non sei autorizzato a operare su questo magazzino.');
  }
}

/** Variante storica usata dal modulo inventory: aggiunge il controllo del permesso inventory.manage. */
export function assertUserCanAccessLocation(
  user: UserProfileDto,
  locationId: string,
  purpose: 'write' | 'transferDestination' = 'write',
): void {
  if (hasFullTenantAccess(user)) {
    return;
  }
  if (!hasTenantPermission(user, TenantPermission.InventoryManage)) {
    throw new ForbiddenException(
      purpose === 'transferDestination'
        ? 'Non autorizzato a trasferire giacenze.'
        : 'Non autorizzato a modificare le giacenze.',
    );
  }
  assertLocationInUserScope(user, locationId, purpose);
}
