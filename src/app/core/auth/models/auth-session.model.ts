import type { User } from '@core/models/user.model';

/**
 * Sessione auth restituita dal gateway.
 * Wrapper volutamente estendibile: in futuro potra' includere metadati come
 * scadenza del token, senza che il token long-lived venga mai persistito.
 */
export interface AuthSession {
  readonly user: User;
  /** Token effimero per le chiamate API (non persistito da AuthService). */
  readonly accessToken?: string;
}
