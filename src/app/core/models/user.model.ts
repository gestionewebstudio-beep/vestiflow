import type { EntityId, TenantScoped, Timestamped } from './common.model';

// Ruoli minimi previsti (regole-gestionale). I controlli reali sono server-side;
// la UI usa il ruolo solo per il rendering condizionale delle azioni.
export const UserRole = {
  Owner: 'owner',
  Admin: 'admin',
  Manager: 'manager',
  Clerk: 'clerk',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/** Utente applicativo appartenente a un tenant. */
export interface User extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  /** Negozi a cui l'utente ha accesso. */
  readonly storeIds: readonly EntityId[];
  readonly isActive: boolean;
  /** Operatore VestiFlow abilitato al provisioning clienti (da PLATFORM_ADMIN_EMAILS). */
  readonly isPlatformAdmin: boolean;
}
