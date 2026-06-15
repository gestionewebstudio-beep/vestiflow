import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Limita un endpoint ai ruoli indicati. Senza decoratore l'endpoint resta
 * accessibile a qualsiasi utente autenticato del tenant.
 *
 * Matrice di default del gestionale (modificabile):
 *  - owner, admin   → controllo completo (incl. cancellazioni, Shopify)
 *  - manager        → gestione catalogo, fornitori, ordini, magazzino
 *  - clerk          → operativita' di magazzino (movimenti, ricezioni, letture)
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/** Scorciatoie semantiche per non ripetere gli array nei controller. */
export const ADMIN_ROLES: UserRole[] = ['owner', 'admin'];
export const MANAGER_ROLES: UserRole[] = ['owner', 'admin', 'manager'];
