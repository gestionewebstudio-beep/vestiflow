import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AuthError } from '@supabase/supabase-js';
import { catchError, from, map, of, type Observable, switchMap, throwError } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';

import type { AuthGateway } from './auth-gateway';
import { fetchUserProfile } from './fetch-user-profile.util';
import type { AuthSession } from './models/auth-session.model';
import type { LoginCredentials } from './models/login-credentials.model';
import { SupabaseClientService } from './supabase-client.service';
import { sessionNeedsMfaVerification, verifyMfaChallenge } from './supabase-mfa.util';

/**
 * Gateway auth via Supabase (email/password + MFA TOTP). La sessione JWT è gestita
 * dall'SDK (persistenza locale); il profilo applicativo (tenant, ruolo)
 * arriva dall'API `GET /auth/me`.
 */
@Injectable()
export class SupabaseAuthGateway implements AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly supabase = inject(SupabaseClientService).client;

  login(credentials: LoginCredentials): Observable<AuthSession> {
    return from(
      this.supabase.auth.signInWithPassword({
        email: credentials.email.trim(),
        password: credentials.password,
      }),
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.session) {
          return throwError(() => this.mapAuthError(error));
        }

        return from(sessionNeedsMfaVerification(this.supabase)).pipe(
          switchMap((needsMfa) => {
            if (needsMfa) {
              return throwError(() => this.mfaRequiredError());
            }
            return this.buildSession(data.session.access_token);
          }),
        );
      }),
    );
  }

  verifyMfa(code: string): Observable<AuthSession> {
    return from(verifyMfaChallenge(this.supabase, code)).pipe(
      catchError((err: unknown) => throwError(() => this.mapMfaError(err))),
      switchMap(({ accessToken }) => this.buildSession(accessToken)),
    );
  }

  logout(): Observable<void> {
    return from(this.supabase.auth.signOut()).pipe(map(() => undefined));
  }

  restoreSession(): Observable<AuthSession | null> {
    return from(this.supabase.auth.getSession()).pipe(
      switchMap(({ data, error }) => {
        if (error) {
          return throwError(() => this.mapAuthError(error));
        }

        const token = data.session?.access_token;
        if (!token) {
          return of(null);
        }

        return from(sessionNeedsMfaVerification(this.supabase)).pipe(
          switchMap((needsMfa) => {
            if (needsMfa) {
              return from(this.supabase.auth.signOut()).pipe(switchMap(() => of(null)));
            }
            return this.buildSession(token);
          }),
        );
      }),
    );
  }

  getToken(): Observable<string | null> {
    return from(this.supabase.auth.getSession()).pipe(
      map(({ data }) => data.session?.access_token ?? null),
    );
  }

  requestPasswordReset(email: string): Observable<void> {
    return from(
      this.supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: this.buildPasswordResetRedirectUrl(),
      }),
    ).pipe(
      switchMap(({ error }) => {
        if (error) {
          return throwError(() => this.mapAuthError(error));
        }
        return of(undefined);
      }),
    );
  }

  updatePassword(newPassword: string): Observable<void> {
    return from(this.supabase.auth.updateUser({ password: newPassword })).pipe(
      switchMap(({ error }) => {
        if (error) {
          return throwError(() => this.mapAuthError(error));
        }
        return from(this.supabase.auth.signOut()).pipe(map(() => undefined));
      }),
    );
  }

  private buildPasswordResetRedirectUrl(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:4200/login/reset-password';
    }
    return `${window.location.origin}/login/reset-password`;
  }

  private buildSession(accessToken: string): Observable<AuthSession> {
    return fetchUserProfile(this.http, this.config.apiBaseUrl, accessToken).pipe(
      map((user) => ({ user, accessToken })),
    );
  }

  private mfaRequiredError(): AppError {
    return {
      kind: AppErrorKind.MfaRequired,
      message: 'Inserisci il codice a 6 cifre dalla tua app di autenticazione.',
    };
  }

  private mapAuthError(error: AuthError | null): AppError {
    if (error?.message?.toLowerCase().includes('invalid')) {
      return {
        kind: AppErrorKind.Unauthorized,
        message: 'Email o password non corretti.',
        status: 401,
      };
    }
    return {
      kind: AppErrorKind.Unknown,
      message: error?.message ?? 'Accesso non riuscito. Riprova.',
    };
  }

  private mapMfaError(error: unknown): AppError {
    const message = this.readErrorMessage(error);
    if (message) {
      const normalized = message.toLowerCase();
      if (normalized.includes('invalid') || normalized.includes('expired')) {
        return {
          kind: AppErrorKind.Unauthorized,
          message: 'Codice non valido o scaduto. Riprova.',
          status: 401,
        };
      }
      return { kind: AppErrorKind.Unknown, message };
    }
    return { kind: AppErrorKind.Unknown, message: 'Verifica a due fattori non riuscita.' };
  }

  private readErrorMessage(error: unknown): string | null {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const candidate = (error as { message?: unknown }).message;
      return typeof candidate === 'string' ? candidate : null;
    }
    return null;
  }
}
