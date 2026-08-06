import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { type Observable, map, switchMap, tap, timeout } from 'rxjs';

import { AuthService } from '@core/auth';
import { fetchUserProfile } from '@core/auth/fetch-user-profile.util';
import { APP_CONFIG } from '@core/config/app-config.token';
import { isAppError } from '@core/models/app-error.model';

import { SUPPORT_SESSION_STORAGE_KEY, type SupportSessionInfo } from './support-session.constants';

const HTTP_TIMEOUT_MS = 15000;

@Injectable({ providedIn: 'root' })
export class SupportSessionService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  private readonly _session = signal<SupportSessionInfo | null>(null);
  readonly session = this._session.asReadonly();

  readonly sessionId = computed(() => this._session()?.sessionId ?? null);
  readonly isActive = computed(() => this._session() != null);

  restoreFromStorage(): void {
    const sessionId = this.readStoredSessionId();
    if (!sessionId) {
      return;
    }
    this._session.set({
      sessionId,
      targetTenantId: '',
      targetTenantName: '',
      expiresAt: '',
    });
  }

  startSession(tenantId: string): Observable<SupportSessionInfo> {
    return this.http
      .post<SupportSessionInfo>(
        `${this.config.apiBaseUrl}/admin/tenants/${tenantId}/support-session`,
        {},
      )
      .pipe(
        timeout(HTTP_TIMEOUT_MS),
        tap((session) => this.persistSession(session)),
        switchMap((session) => this.refreshProfile().pipe(map(() => session))),
      );
  }

  endSession(): Observable<void> {
    return this.http.delete<void>(`${this.config.apiBaseUrl}/admin/support-sessions/current`).pipe(
      timeout(HTTP_TIMEOUT_MS),
      tap(() => this.clearSession()),
      switchMap(() => this.refreshProfile().pipe(map(() => undefined))),
    );
  }

  clearSession(): void {
    this._session.set(null);
    try {
      this.document.defaultView?.sessionStorage.removeItem(SUPPORT_SESSION_STORAGE_KEY);
    } catch {
      // sessionStorage non disponibile.
    }
  }

  syncFromProfile(session: SupportSessionInfo): void {
    this.persistSession(session);
  }

  private persistSession(session: SupportSessionInfo): void {
    this._session.set(session);
    try {
      this.document.defaultView?.sessionStorage.setItem(
        SUPPORT_SESSION_STORAGE_KEY,
        session.sessionId,
      );
    } catch {
      // sessionStorage non disponibile.
    }
  }

  private readStoredSessionId(): string | null {
    try {
      return this.document.defaultView?.sessionStorage.getItem(SUPPORT_SESSION_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private refreshProfile(): Observable<void> {
    return this.auth.getToken().pipe(
      switchMap((token) => {
        if (!token) {
          this.clearSession();
          return this.router.navigateByUrl('/login').then(() => undefined);
        }
        return fetchUserProfile(this.http, this.config.apiBaseUrl, token).pipe(
          tap((user) => {
            if (user.supportSession) {
              this._session.set(user.supportSession);
              this.persistSession(user.supportSession);
            } else {
              this.clearSession();
            }
            this.auth.setCurrentUser(user);
          }),
          map(() => undefined),
        );
      }),
    );
  }

  /** Naviga al gestionale cliente dopo avvio sessione assistenza. */
  enterTenantWorkspace(): void {
    void this.router.navigateByUrl('/app/dashboard');
  }

  /** Torna all'area admin dopo chiusura sessione assistenza. */
  exitTenantWorkspace(): void {
    void this.router.navigateByUrl('/app/admin/clients');
  }

  mapStartError(err: unknown): string {
    if (isAppError(err)) {
      return err.message;
    }
    return 'Impossibile aprire la sessione assistenza. Riprova.';
  }
}
