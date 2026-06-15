import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { createClient, type AuthError } from '@supabase/supabase-js';
import { from, map, of, type Observable, switchMap, throwError } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';

import type { AuthGateway } from './auth-gateway';
import type { AuthSession } from './models/auth-session.model';
import type { LoginCredentials } from './models/login-credentials.model';

/** Risposta `GET /auth/me` (allineata al backend NestJS). */
interface UserProfileApi {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
  readonly storeIds: readonly string[];
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Gateway auth via Supabase (email/password). La sessione JWT è gestita
 * dall'SDK (persistenza locale); il profilo applicativo (tenant, ruolo)
 * arriva dall'API `GET /auth/me`.
 */
@Injectable()
export class SupabaseAuthGateway implements AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);
  private readonly supabase;

  constructor() {
    const supabaseConfig = this.config.supabase;
    if (!supabaseConfig?.url || !supabaseConfig.anonKey) {
      throw new Error('Configurazione Supabase incompleta (url / anonKey).');
    }
    this.supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

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
        return this.fetchProfile(data.session.access_token).pipe(
          map((user) => ({ user, accessToken: data.session.access_token })),
        );
      }),
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
        return this.fetchProfile(token).pipe(map((user) => ({ user, accessToken: token })));
      }),
    );
  }

  getToken(): Observable<string | null> {
    return from(this.supabase.auth.getSession()).pipe(
      map(({ data }) => data.session?.access_token ?? null),
    );
  }

  private fetchProfile(accessToken: string): Observable<User> {
    return this.http
      .get<UserProfileApi>(`${this.config.apiBaseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      .pipe(map(mapUserProfile));
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
}

function mapUserProfile(row: UserProfileApi): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserRole,
    storeIds: row.storeIds,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
