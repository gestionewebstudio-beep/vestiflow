/** Durata sessione assistenza (allineata al backend). */
export const SUPPORT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Header HTTP per impersonation controllata operatore → tenant cliente. */
export const SUPPORT_SESSION_HEADER = 'X-Vestiflow-Support-Session';

/** Chiave sessionStorage per il session id lato client. */
export const SUPPORT_SESSION_STORAGE_KEY = 'vestiflow-support-session-id';

export interface SupportSessionInfo {
  readonly sessionId: string;
  readonly targetTenantId: string;
  readonly targetTenantName: string;
  readonly expiresAt: string;
}
