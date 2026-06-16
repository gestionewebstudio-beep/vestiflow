import { Injectable, computed, inject, signal } from '@angular/core';
import { type Observable, catchError, map, of, tap } from 'rxjs';

import type { User } from '@core/models/user.model';

import { AUTH_GATEWAY } from './auth-gateway';
import type { AuthSession } from './models/auth-session.model';
import type { AuthStatus } from './models/auth-status.model';
import type { LoginCredentials } from './models/login-credentials.model';

/**
 * Stato applicativo dell'autenticazione (signal-based, solo in memoria).
 * Delega le operazioni al gateway astratto; nessuna persistenza di token o
 * sessione. La vera autorizzazione resta server-side: qui c'e' solo stato UX.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly gateway = inject(AUTH_GATEWAY);

  private readonly _status = signal<AuthStatus>('unknown');
  /** Stato corrente della sessione. */
  readonly status = this._status.asReadonly();

  private readonly _currentUser = signal<User | null>(null);
  /** Utente loggato, o `null` se non autenticato. */
  readonly currentUser = this._currentUser.asReadonly();

  /** `true` solo a stato risolto e con utente attivo. */
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  /**
   * Risolve lo stato iniziale al bootstrap (collegato a provideAppInitializer).
   * In mock risolve sempre `unauthenticated`; in futuro attendera' il provider.
   */
  initialize(): Observable<void> {
    return this.gateway.restoreSession().pipe(
      tap((session) => this.applySession(session)),
      map(() => undefined),
      catchError(() => {
        this.applySession(null);
        return of(undefined);
      }),
    );
  }

  /** Autentica e aggiorna lo stato. Gli errori vengono propagati alla UI. */
  login(credentials: LoginCredentials): Observable<User> {
    return this.gateway.login(credentials).pipe(
      tap((session) => this.applySession(session)),
      map((session) => session.user),
    );
  }

  /** Completa l'accesso con codice TOTP dopo login password. */
  verifyMfa(code: string): Observable<User> {
    return this.gateway.verifyMfa(code).pipe(
      tap((session) => this.applySession(session)),
      map((session) => session.user),
    );
  }

  /** Termina la sessione e azzera lo stato. */
  logout(): Observable<void> {
    return this.gateway.logout().pipe(tap(() => this.applySession(null)));
  }

  /**
   * Token effimero per le chiamate verso origini fidate. Ottenuto on-demand dal
   * gateway, mai persistito. `null` se non autenticato.
   */
  getToken(): Observable<string | null> {
    return this.gateway.getToken();
  }

  private applySession(session: AuthSession | null): void {
    this._currentUser.set(session?.user ?? null);
    this._status.set(session ? 'authenticated' : 'unauthenticated');
  }
}
