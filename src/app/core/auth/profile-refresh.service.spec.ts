import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { APP_CONFIG } from '@core/config/app-config.token';

import { AuthService } from './auth.service';
import { ProfileRefreshService } from './profile-refresh.service';

/**
 * Il difetto che questo servizio chiude: i permessi entrano solo da
 * `GET /auth/me`, che partiva al bootstrap e al login. Una scheda aperta
 * mostrava per giorni i permessi di quando era stata aperta, e un permesso
 * revocato non arrivava mai a chi stava lavorando.
 */

const API_BASE = 'https://api.test';
const INTERVALLO_MS = 3 * 60 * 1000;

function profiloApi(permissions: readonly string[]) {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'commesso@test.it',
    displayName: 'Commesso',
    role: 'clerk',
    isActive: true,
    permissions: [...permissions],
    storeIds: [],
    hasAllLocationsAccess: true,
    assignedLocations: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('ProfileRefreshService', () => {
  let http: HttpTestingController;
  let autenticato: ReturnType<typeof signal<boolean>>;
  let setCurrentUser: ReturnType<typeof vi.fn>;
  let listeners: Map<string, () => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    autenticato = signal(true);
    setCurrentUser = vi.fn();
    listeners = new Map();

    const documentFinto = {
      visibilityState: 'visible',
      addEventListener: (tipo: string, cb: () => void) => listeners.set(tipo, cb),
      removeEventListener: (tipo: string) => listeners.delete(tipo),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
        { provide: DOCUMENT, useValue: documentFinto },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: autenticato,
            getToken: () => of('token-valido'),
            setCurrentUser,
          },
        },
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Il servizio parte dal costruttore: iniettarlo è avviarlo. */
  function avvia(): void {
    TestBed.inject(ProfileRefreshService);
    TestBed.tick();
  }

  it('rilegge il profilo allo scadere dell’intervallo e aggiorna l’utente', () => {
    avvia();
    vi.advanceTimersByTime(INTERVALLO_MS);

    const req = http.expectOne(`${API_BASE}/auth/me`);
    req.flush(profiloApi(['section.documents']));

    expect(setCurrentUser).toHaveBeenCalledTimes(1);
    expect(setCurrentUser.mock.calls[0]?.[0]).toMatchObject({
      permissions: ['section.documents'],
    });
  });

  it('rilegge quando la scheda torna in primo piano', () => {
    avvia();
    vi.advanceTimersByTime(INTERVALLO_MS + 1000);
    http.expectOne(`${API_BASE}/auth/me`).flush(profiloApi([]));

    // Oltre la distanza minima fra due riletture.
    vi.advanceTimersByTime(60 * 1000);
    listeners.get('visibilitychange')?.();

    http.expectOne(`${API_BASE}/auth/me`).flush(profiloApi(['section.sales']));
    expect(setCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('non fa una raffica di chiamate se la scheda rimbalza avanti e indietro', () => {
    avvia();
    listeners.get('visibilitychange')?.();
    http.expectOne(`${API_BASE}/auth/me`).flush(profiloApi([]));

    listeners.get('visibilitychange')?.();
    listeners.get('visibilitychange')?.();

    // La distanza minima non è passata: nessuna seconda chiamata.
    http.expectNone(`${API_BASE}/auth/me`);
  });

  // Una rete che cade non è una sessione scaduta: buttare fuori l'operatore a
  // metà di un documento sarebbe peggio del permesso stantio da correggere.
  it('ingoia l’errore e riprova al giro dopo', () => {
    avvia();
    vi.advanceTimersByTime(INTERVALLO_MS);
    http.expectOne(`${API_BASE}/auth/me`).error(new ProgressEvent('errore di rete'), { status: 0 });

    expect(setCurrentUser).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INTERVALLO_MS);
    http.expectOne(`${API_BASE}/auth/me`).flush(profiloApi(['section.products']));
    expect(setCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('smette di interrogare quando la sessione si chiude', () => {
    avvia();
    autenticato.set(false);
    TestBed.tick();

    vi.advanceTimersByTime(INTERVALLO_MS * 3);

    http.expectNone(`${API_BASE}/auth/me`);
  });
});
