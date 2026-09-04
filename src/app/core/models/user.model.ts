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
  /** Admin con accesso a tutte le sedi (titolare: sempre pieno, ignora questo campo). */
  readonly hasAllLocationsAccess: boolean;
  /** Sedi operative assegnate (manager/commesso, o admin senza hasAllLocationsAccess). Vuoto = nessun accesso operativo. */
  readonly assignedLocationIds: readonly EntityId[];
  readonly assignedLocations: readonly { readonly id: EntityId; readonly name: string }[];
  /** Sede predefinita: SUGGERIMENTO nei form (mai fallback automatico); null se non impostata. */
  readonly defaultLocationId: EntityId | null;
  readonly defaultLocation: { readonly id: EntityId; readonly name: string } | null;
  /** Permessi granulari (titolare: ignorati, accesso pieno). */
  readonly permissions: readonly string[];
  readonly isActive: boolean;
  /** Password iniziale impostata da chi ha creato l'account: l'app chiede di cambiarla al primo accesso. */
  readonly mustChangePassword?: boolean;
  /** Admin Vestiflow: provisioning clienti (da PLATFORM_ADMIN_EMAILS). */
  readonly isPlatformAdmin: boolean;
  /** Sessione assistenza attiva (operatore nel gestionale cliente). */
  readonly supportSession?: SupportSession;
  /**
   * Se la **Vendita manuale** è operativa per questa azienda.
   *
   * ⚠️ Viaggia sul profilo e non su `/tenant/feature-settings`: quell’endpoint
   * chiede `settings.company`, che manager e commesso non hanno, e i
   * consumatori assorbono il 403 con `catchError(() => of(null))`. Un flag
   * letto per quella strada resterebbe **acceso proprio per chi lo si vuole
   * spegnere**.
   */
  readonly manualUnloadEnabled: boolean;
  /** Canale ecommerce abilitato per il tenant (scelto in «Nuovo cliente»). */
  readonly tenantChannelProfile: TenantChannelProfile;
  /** Nome commerciale del tenant (registrato in admin, non è una sede Shopify). */
  readonly tenantName: string;
}
