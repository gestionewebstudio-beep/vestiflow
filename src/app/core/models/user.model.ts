import type { EntityId, TenantScoped, Timestamped } from './common.model';
import type { TenantChannelProfile } from './tenant-channel-profile.model';

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
export interface SupportSession {
  readonly sessionId: string;
  readonly targetTenantId: string;
  readonly targetTenantName: string;
  readonly expiresAt: string;
}

/** Utente applicativo appartenente a un tenant. */
export interface User extends TenantScoped, Timestamped {
  readonly id: EntityId;
  readonly email: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly role: UserRole;
  /** Negozi a cui l'utente ha accesso. */
  readonly storeIds: readonly EntityId[];
  /** Sede operativa fissa (manager/commesso). Null = tutte le sedi attive. */
  readonly assignedLocationId: EntityId | null;
  readonly assignedLocationName: string | null;
  /** Permessi granulari (titolare: ignorati, accesso pieno). */
  readonly permissions: readonly string[];
  readonly isActive: boolean;
  /** Admin Vestiflow: provisioning clienti (da PLATFORM_ADMIN_EMAILS). */
  readonly isPlatformAdmin: boolean;
  /** Sessione assistenza attiva (operatore nel gestionale cliente). */
  readonly supportSession?: SupportSession;
  /** Canale ecommerce abilitato per il tenant (scelto in «Nuovo cliente»). */
  readonly tenantChannelProfile: TenantChannelProfile;
  /** Nome commerciale del tenant (registrato in admin, non è una sede Shopify). */
  readonly tenantName: string;
}
