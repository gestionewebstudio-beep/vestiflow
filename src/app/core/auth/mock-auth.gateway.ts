import { Injectable } from '@angular/core';
import { type Observable, delay, map, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId, IsoDateString } from '@core/models/common.model';
import { UserRole } from '@core/models/user.model';
import type { User } from '@core/models/user.model';

import type { AuthGateway } from './auth-gateway';
import type { AuthSession } from './models/auth-session.model';
import type { LoginCredentials } from './models/login-credentials.model';

const TENANT_ID: EntityId = 'tenant-demo';
const SEED_DATE: IsoDateString = '2026-01-01T00:00:00.000Z';

const LOGIN_LATENCY_MS = 700;
const SHORT_LATENCY_MS = 200;

/** Credenziale mock: utente + password in chiaro SOLO per sviluppo. */
interface MockCredential {
  readonly user: User;
  // REASON: credenziali fittizie di sviluppo, nessun segreto reale. Mai usate in prod.
  readonly password: string;
}

const MOCK_USERS: readonly MockCredential[] = [
  {
    password: 'owner123',
    user: {
      id: 'user-owner',
      tenantId: TENANT_ID,
      email: 'owner@vestiflow.test',
      displayName: 'Olivia Bianchi',
      role: UserRole.Owner,
      storeIds: ['store-milano', 'store-napoli'],
      isActive: true,
      isPlatformAdmin: true,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  },
  {
    password: 'manager123',
    user: {
      id: 'user-manager',
      tenantId: TENANT_ID,
      email: 'manager@vestiflow.test',
      displayName: 'Marco Conti',
      role: UserRole.Manager,
      storeIds: ['store-milano'],
      isActive: true,
      isPlatformAdmin: false,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  },
  {
    password: 'clerk123',
    user: {
      id: 'user-clerk',
      tenantId: TENANT_ID,
      email: 'clerk@vestiflow.test',
      displayName: 'Carla Russo',
      role: UserRole.Clerk,
      storeIds: ['store-napoli'],
      isActive: true,
      isPlatformAdmin: false,
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  },
];

/**
 * Implementazione mock del gateway auth. Mantiene la sessione SOLO in memoria
 * (persa al refresh) e simula latenza ed errori realistici.
 */
@Injectable()
export class MockAuthGateway implements AuthGateway {
  private currentUser: User | null = null;

  login(credentials: LoginCredentials): Observable<AuthSession> {
    const email = credentials.email.trim().toLowerCase();

    return of(null).pipe(
      delay(LOGIN_LATENCY_MS),
      switchMap(() => {
        const match = MOCK_USERS.find((candidate) => candidate.user.email === email);
        if (!match || match.password !== credentials.password) {
          return throwError(() => this.invalidCredentialsError());
        }
        if (!match.user.isActive) {
          return throwError(() => this.accountDisabledError());
        }
        this.currentUser = match.user;
        return of<AuthSession>({ user: match.user });
      }),
    );
  }

  logout(): Observable<void> {
    return of(undefined).pipe(
      delay(SHORT_LATENCY_MS),
      map(() => {
        this.currentUser = null;
      }),
    );
  }

  restoreSession(): Observable<AuthSession | null> {
    // Nessuna persistenza: all'avvio non c'e' sessione da ripristinare.
    return of(this.currentUser ? { user: this.currentUser } : null).pipe(delay(SHORT_LATENCY_MS));
  }

  getToken(): Observable<string | null> {
    // Token effimero, in memoria, non persistito.
    return of(this.currentUser ? `mock-token-${this.currentUser.id}` : null);
  }

  private invalidCredentialsError(): AppError {
    return {
      kind: AppErrorKind.Unauthorized,
      message: 'Email o password non corretti.',
      status: 401,
    };
  }

  private accountDisabledError(): AppError {
    return {
      kind: AppErrorKind.Forbidden,
      message: 'Account disabilitato. Contatta un amministratore.',
      status: 403,
    };
  }
}
