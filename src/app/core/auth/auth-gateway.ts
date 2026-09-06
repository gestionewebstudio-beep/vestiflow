import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';

import type { AuthSession } from './models/auth-session.model';
import type { LoginCredentials } from './models/login-credentials.model';

/**
 * Contratto del provider di autenticazione. Punto unico di integrazione:
 * oggi `MockAuthGateway`, domani un `FirebaseAuthGateway` senza toccare
 * AuthService, guard o UI.
 *
 * Il gateway e' la fonte di verita' della sessione del provider (come l'SDK
 * Firebase): AuthService ne specchia lo stato in signal.
 */
export interface AuthGateway {
  /** Autentica con le credenziali. Emette la sessione o lancia un AppError. */
  login(credentials: LoginCredentials): Observable<AuthSession>;

  /** Completa l'accesso con codice TOTP dopo login password (sessione AAL1). */
  verifyMfa(code: string): Observable<AuthSession>;

  /** Termina la sessione corrente. */
  logout(): Observable<void>;

  /**
   * Recupera la sessione gia' attiva all'avvio (Firebase: onAuthStateChanged).
   * In mock: nessuna persistenza, quindi `null` dopo un refresh.
   */
  restoreSession(): Observable<AuthSession | null>;

  /** Token effimero da allegare alle chiamate verso origini fidate. */
  getToken(): Observable<string | null>;

  /** Invia email di recupero password (Supabase resetPasswordForEmail). */
  requestPasswordReset(email: string): Observable<void>;

  /**
   * Imposta una nuova password.
   *
   * `keepSession` distingue i due flussi, e la differenza non è un dettaglio:
   * dal link ricevuto via email la sessione va chiusa e si rientra con la
   * password nuova, mentre al primo accesso l'operatore deve proseguire verso
   * la dashboard — e prima ancora serve il token per dire all'API che il
   * promemoria non gli va più mostrato.
   */
  updatePassword(newPassword: string, keepSession?: boolean): Observable<void>;
}

/** DI token per il provider auth (sostituibile per ambiente). */
export const AUTH_GATEWAY = new InjectionToken<AuthGateway>('AUTH_GATEWAY');
