import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { PaymentMethodCode, PaymentOption } from '@core/models/payment-option.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';

import { PaymentOptionsPageComponent } from './payment-options-page.component';

/**
 * La sezione Impostazioni apre questa pagina, ma le scritture sulle voci
 * pagamento le riserva `settings.company`: senza quel permesso l'API risponde
 * 403, quindi i comandi non devono nemmeno comparire.
 */
const CONTANTI: PaymentOption = {
  id: 'po-1',
  tenantId: 't1',
  kind: 'method',
  name: 'Contanti',
  sortOrder: 1,
  isSystem: true,
  isActive: true,
  // Nessuna Modalità normativa: e' lo stato di partenza di ogni voce
  // finche' il titolare non ne assegna una (`docs/25` §7).
  methodCodeId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function utente(permissions: readonly TenantPermissionKey[]): User {
  return {
    id: 'u1',
    tenantId: 't1',
    email: 'magazziniere@example.com',
    displayName: 'Magazziniere',
    avatarUrl: null,
    role: UserRole.Manager,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    manualUnloadEnabled: true,
    tenantName: 'Cliente test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [...permissions],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function apri(permissions: readonly TenantPermissionKey[]): Promise<void> {
  await render(PaymentOptionsPageComponent, {
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: () => utente(permissions) } },
      {
        provide: PaymentOptionsService,
        useValue: { list: () => of([CONTANTI]), listMethodCodes: () => of([]) },
      },
    ],
  });
}

describe('PaymentOptionsPageComponent — comandi riservati a «Impostazioni azienda»', () => {
  it('con la sola sezione Impostazioni mostra l’elenco senza comandi di scrittura', async () => {
    await apri([TenantPermission.SectionSettings]);

    expect(screen.getByText('Contanti')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aggiungi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rinomina' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disattiva' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull();
  });

  it('con «Impostazioni azienda» i comandi tornano', async () => {
    await apri([TenantPermission.SectionSettings, TenantPermission.SettingsCompany]);

    expect(screen.getAllByRole('button', { name: 'Aggiungi' }).length).toBe(2);
    expect(screen.getByRole('button', { name: 'Rinomina' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disattiva' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeTruthy();
  });

  it('al titolare i comandi restano anche senza permessi espliciti', async () => {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ ...utente([]), role: UserRole.Owner }) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([CONTANTI]), listMethodCodes: () => of([]) },
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'Rinomina' })).toBeTruthy();
  });

  it('l’elenco vuoto non invita ad aggiungere chi non può', async () => {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => utente([TenantPermission.SectionSettings]) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([]), listMethodCodes: () => of([]) },
        },
      ],
    });

    expect(screen.queryByText('Nessuna voce: aggiungine una qui sopra.')).toBeNull();
    expect(screen.getAllByText('Nessuna voce configurata.').length).toBe(2);
  });
});

/**
 * La tendina della Modalità normativa (C2A, `docs/25` §7).
 *
 * ⛔ Ciò che questi test falsificano: una tendina che compare anche sulle
 *    CONDIZIONI, un cambio che non arriva all'API, una scelta «nessuna» che
 *    invia `undefined` invece di `null` — e soprattutto un catalogo che
 *    fallisce SPARENDO, indistinguibile da un catalogo vuoto.
 */
const MP05: PaymentMethodCode = {
  id: 'mc-5',
  code: 'MP05',
  label: 'Bonifico',
  sortOrder: 5,
  isActive: true,
};

const BONIFICO: PaymentOption = {
  ...CONTANTI,
  id: 'po-2',
  name: 'Bonifico 60 gg',
  methodCodeId: 'mc-5',
};

const CONDIZIONE: PaymentOption = {
  ...CONTANTI,
  id: 'po-3',
  kind: 'terms',
  name: '60 gg f.m.',
  methodCodeId: null,
};

describe('PaymentOptionsPageComponent — modalità normativa', () => {
  function serviceMock(overrides: Record<string, unknown> = {}) {
    return {
      list: () => of([CONTANTI, BONIFICO, CONDIZIONE]),
      listMethodCodes: () => of([MP05]),
      update: vi.fn().mockReturnValue(of(BONIFICO)),
      ...overrides,
    };
  }

  async function apriConCatalogo(mock: Record<string, unknown>): Promise<void> {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () =>
              utente([TenantPermission.SectionSettings, TenantPermission.SettingsCompany]),
          },
        },
        { provide: PaymentOptionsService, useValue: mock },
      ],
    });
  }

  it('mostra la tendina sui Tipi di pagamento e NON sulle condizioni', async () => {
    await apriConCatalogo(serviceMock());

    // Due voci `method`, nessuna sulla condizione.
    expect(screen.getAllByLabelText(/^Modalità normativa di/)).toHaveLength(2);
    expect(screen.queryByLabelText('Modalità normativa di 60 gg f.m.')).toBeNull();
  });

  it('presenta selezionata la modalità già collegata', async () => {
    await apriConCatalogo(serviceMock());

    const tendina = screen.getByLabelText<HTMLSelectElement>(
      'Modalità normativa di Bonifico 60 gg',
    );
    expect(tendina.value).toBe('mc-5');
  });

  it('associare una modalità la manda all_API', async () => {
    const mock = serviceMock();
    await apriConCatalogo(mock);

    const tendina = screen.getByLabelText('Modalità normativa di Contanti');
    fireEvent.change(tendina, { target: { value: 'mc-5' } });

    expect(mock.update).toHaveBeenCalledWith('po-1', { methodCodeId: 'mc-5' });
  });

  it('scegliere «nessuna» invia null, non undefined', async () => {
    const mock = serviceMock();
    await apriConCatalogo(mock);

    const tendina = screen.getByLabelText<HTMLSelectElement>(
      'Modalità normativa di Bonifico 60 gg',
    );
    fireEvent.change(tendina, { target: { value: '' } });

    expect(mock.update).toHaveBeenCalledWith('po-2', { methodCodeId: null });
  });

  it('a chi non può scrivere la tendina resta visibile ma disabilitata', async () => {
    await render(PaymentOptionsPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => utente([TenantPermission.SectionSettings]) },
        },
        { provide: PaymentOptionsService, useValue: serviceMock() },
      ],
    });

    const tendina = screen.getByLabelText<HTMLSelectElement>(
      'Modalità normativa di Bonifico 60 gg',
    );
    expect(tendina.value).toBe('mc-5');
    expect(tendina.disabled).toBe(true);
  });

  /**
   * ⭐ I DUE LIVELLI devono leggersi come due cose diverse.
   *
   * Le righe del tenant sono TIPI pagamento — i preset aziendali — e la
   * MODALITÀ è il codice normativo del catalogo globale a cui puntano.
   * Chiamarli entrambi «modalità» rimetterebbe insieme ciò che C2A separa.
   */
  it('distingue «Tipi pagamento» dalla «Modalità normativa»', async () => {
    await apriConCatalogo(serviceMock());

    expect(screen.getByText('Tipi pagamento')).toBeTruthy();
    expect(screen.getByText('Condizioni di pagamento')).toBeTruthy();
    expect(screen.queryByText('Modalità di pagamento')).toBeNull();
    expect(screen.getAllByLabelText(/^Modalità normativa di/).length).toBeGreaterThan(0);
  });

  it('se il catalogo FALLISCE la pagina lo dice, non sparisce in silenzio', async () => {
    await apriConCatalogo(
      serviceMock({ listMethodCodes: () => throwError(() => new Error('rete')) }),
    );

    // Lo stato d'errore della pagina, non una tendina mancante senza spiegazione.
    expect(screen.queryByLabelText(/^Modalità normativa di/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeTruthy();
  });
});
