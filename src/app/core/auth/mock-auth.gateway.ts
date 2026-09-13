import { Injectable } from '@angular/core';
import { type Observable, delay, map, of, switchMap, throwError } from 'rxjs';

import { AppErrorKind } from '@core/models/app-error.model';
import type { AppError } from '@core/models/app-error.model';
import type { EntityId, IsoDateString } from '@core/models/common.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole } from '@core/models/user.model';
import type { User } from '@core/models/user.model';

import type { AuthGateway } from './auth-gateway';
import type { AuthSession } from './models/auth-session.model';
import type { LoginCredentials } from './models/login-credentials.model';

const TENANT_ID: EntityId = 'tenant-demo';
const SEED_DATE: IsoDateString = '2026-01-01T00:00:00.000Z';
/** Chiave storage per ripristinare la sessione mock (sessionStorage + localStorage per E2E Playwright). */
const MOCK_SESSION_STORAGE_KEY = 'vestiflow-mock-user-id';

const LOGIN_LATENCY_MS = 700;
const SHORT_LATENCY_MS = 200;

/** Credenziale mock: utente + password in chiaro SOLO per sviluppo. */
interface MockCredential {
  readonly user: User;
  // REASON: credenziali fittizie di sviluppo, nessun segreto reale. Mai usate in prod.
  readonly password: string;
}

const MOCK_USERS: readonly MockCredential[] = [
  /**
   * ⭐ L’AMMINISTRATORE DI PIATTAFORMA dell’auth finta (11/09/2026): senza,
   * le pagine di amministrazione — clienti registrati, utenti di un tenant —
   * non si possono guardare in un browser senza API (`docs/26` A13, A14).
   * Stesso tenant del titolare, con il solo flag in più.
   */
  {
    password: 'admin123',
    user: {
      id: 'user-admin',
      tenantId: TENANT_ID,
      email: 'admin@vestiflow.test',
      displayName: 'Ada Amministratrice',
      avatarUrl: null,
      role: UserRole.Owner,
      storeIds: ['store-milano', 'store-napoli'],
      isActive: true,
      isPlatformAdmin: true,
      tenantChannelProfile: TenantChannelProfile.Shopify,
      manualUnloadEnabled: true,
      tenantName: 'Negozio Demo',
      hasAllLocationsAccess: true,
      assignedLocationIds: [],
      assignedLocations: [],
      defaultLocationId: null,
      defaultLocation: null,
      permissions: [],
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  },
  {
    password: 'owner123',
    user: {
      id: 'user-owner',
      tenantId: TENANT_ID,
      email: 'owner@vestiflow.test',
      displayName: 'Olivia Bianchi',
      avatarUrl: null,
      role: UserRole.Owner,
      storeIds: ['store-milano', 'store-napoli'],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Shopify,
      manualUnloadEnabled: true,
      tenantName: 'Negozio Demo',
      hasAllLocationsAccess: true,
      assignedLocationIds: [],
      assignedLocations: [],
      defaultLocationId: null,
      defaultLocation: null,
      permissions: [],
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
      avatarUrl: null,
      role: UserRole.Manager,
      storeIds: ['store-milano'],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Shopify,
      manualUnloadEnabled: true,
      tenantName: 'Negozio Demo',
      hasAllLocationsAccess: false,
      assignedLocationIds: ['loc-milano'],
      assignedLocations: [{ id: 'loc-milano', name: 'Milano' }],
      defaultLocationId: 'loc-milano',
      defaultLocation: { id: 'loc-milano', name: 'Milano' },
      permissions: [],
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
      avatarUrl: null,
      role: UserRole.Clerk,
      storeIds: ['store-napoli'],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Shopify,
      manualUnloadEnabled: true,
      tenantName: 'Negozio Demo',
      hasAllLocationsAccess: false,
      assignedLocationIds: ['loc-napoli'],
      assignedLocations: [{ id: 'loc-napoli', name: 'Napoli' }],
      defaultLocationId: null,
      defaultLocation: null,
      permissions: [],
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  },
  /**
   * ⭐ Chi ha il SOLO permesso di un comando Shopify (11/09/2026): senza
   * «Sezione Impostazioni», deve comunque raggiungere Impostazioni → Shopify
   * ed eseguire «Allinea giacenze su Shopify» — e nient’altro.
   */
  {
    password: 'sync123',
    user: {
      id: 'user-sync',
      tenantId: TENANT_ID,
      email: 'sync@vestiflow.test',
      displayName: 'Sara Sincroni',
      avatarUrl: null,
      role: UserRole.Manager,
      storeIds: ['store-milano'],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Shopify,
      manualUnloadEnabled: true,
      tenantName: 'Negozio Demo',
      hasAllLocationsAccess: true,
      assignedLocationIds: [],
      assignedLocations: [],
      defaultLocationId: null,
      defaultLocation: null,
      permissions: ['section.inventory', 'inventory.import_export'],
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  },
  /**
   * ⭐ Chi ha la combinazione dell’API per «Importa clienti» — «Esportare
   * dati» E «Gestire clienti» — e nient’altro di Shopify (11/09/2026):
   * raggiunge la pagina, vede quel solo comando, non «Importa ordini».
   */
  {
    password: 'clienti123',
    user: {
      id: 'user-clienti',
      tenantId: TENANT_ID,
      email: 'clienti@vestiflow.test',
      displayName: 'Clara Clienti',
      avatarUrl: null,
      role: UserRole.Manager,
      storeIds: ['store-milano'],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Shopify,
      manualUnloadEnabled: true,
      tenantName: 'Negozio Demo',
      hasAllLocationsAccess: true,
      assignedLocationIds: [],
      assignedLocations: [],
      defaultLocationId: null,
      defaultLocation: null,
      permissions: ['section.customers', 'customers.manage', 'reports.export'],
      createdAt: SEED_DATE,
      updatedAt: SEED_DATE,
    },
  },
  /** Il titolare di un tenant SENZA modulo Shopify: nessuna pagina Shopify da raggiungere. */
  {
    password: 'gestionale123',
    user: {
      id: 'user-gestionale',
      tenantId: 'tenant-gestionale',
      email: 'gestionale@vestiflow.test',
      displayName: 'Gino Gestionale',
      avatarUrl: null,
      role: UserRole.Owner,
      storeIds: ['store-milano'],
      isActive: true,
      isPlatformAdmin: false,
      tenantChannelProfile: TenantChannelProfile.Gestionale,
      manualUnloadEnabled: true,
      tenantName: 'Bottega senza canale',
      hasAllLocationsAccess: true,
      assignedLocationIds: [],
      assignedLocations: [],
      defaultLocationId: null,
      defaultLocation: null,
      permissions: [],
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
        this.persistSession(match.user.id);
        return of<AuthSession>({ user: match.user });
      }),
    );
  }

  verifyMfa(_code: string): Observable<AuthSession> {
    return throwError(
      () =>
        ({
          kind: AppErrorKind.Unknown,
          message: 'Verifica a due fattori non disponibile in modalità mock.',
        }) satisfies AppError,
    );
  }

  logout(): Observable<void> {
    return of(undefined).pipe(
      delay(SHORT_LATENCY_MS),
      map(() => {
        this.currentUser = null;
        this.clearPersistedSession();
      }),
    );
  }

  restoreSession(): Observable<AuthSession | null> {
    this.restoreFromStorage();
    return of(this.currentUser ? { user: this.currentUser } : null).pipe(delay(SHORT_LATENCY_MS));
  }

  getToken(): Observable<string | null> {
    // Token effimero, in memoria, non persistito.
    return of(this.currentUser ? `mock-token-${this.currentUser.id}` : null);
  }

  requestPasswordReset(_email: string): Observable<void> {
    return of(undefined).pipe(delay(SHORT_LATENCY_MS));
  }

  updatePassword(_newPassword: string, _keepSession = false): Observable<void> {
    return of(undefined).pipe(delay(SHORT_LATENCY_MS));
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

  private persistSession(userId: EntityId): void {
    try {
      sessionStorage.setItem(MOCK_SESSION_STORAGE_KEY, userId);
      localStorage.setItem(MOCK_SESSION_STORAGE_KEY, userId);
    } catch {
      // Storage non disponibile (SSR/tests): sessione solo in memoria.
    }
  }

  private clearPersistedSession(): void {
    try {
      sessionStorage.removeItem(MOCK_SESSION_STORAGE_KEY);
      localStorage.removeItem(MOCK_SESSION_STORAGE_KEY);
    } catch {
      // Ignora: nessuna persistenza disponibile.
    }
  }

  private restoreFromStorage(): void {
    if (this.currentUser) {
      return;
    }
    try {
      const userId =
        sessionStorage.getItem(MOCK_SESSION_STORAGE_KEY) ??
        localStorage.getItem(MOCK_SESSION_STORAGE_KEY);
      if (!userId) {
        return;
      }
      const match = MOCK_USERS.find((candidate) => candidate.user.id === userId);
      this.currentUser = match?.user ?? null;
      if (!match) {
        this.clearPersistedSession();
      }
    } catch {
      // Storage non disponibile.
    }
  }
}
