import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { TenantUsersService } from '@domain/users/services/tenant-users.service';

import { UsersPageComponent } from './users-page.component';

/**
 * Il difetto che questi test fissano: il form usciva in silenzio quando era
 * invalido — `markAllAsTouched()` e poi `return`, senza che il template
 * mostrasse un solo messaggio. Chi sbagliava la password premeva «Crea utente»
 * e non vedeva accadere nulla: un pulsante che sembra rotto.
 */

const titolare: User = {
  id: 'owner-1',
  tenantId: 't1',
  email: 'titolare@test.it',
  displayName: 'Titolare',
  avatarUrl: null,
  role: UserRole.Owner,
  storeIds: [],
  isActive: true,
  isPlatformAdmin: false,
  tenantChannelProfile: TenantChannelProfile.Shopify,
  tenantName: 'Negozio test',
  hasAllLocationsAccess: true,
  assignedLocationIds: [],
  assignedLocations: [],
  defaultLocationId: null,
  defaultLocation: null,
  permissions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function apri(createUser = vi.fn()) {
  const view = await render(UsersPageComponent, {
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: () => titolare } },
      {
        provide: TenantUsersService,
        useValue: {
          listUsers: () => of([]),
          createUser,
          updateUser: vi.fn(),
          deleteUser: vi.fn(),
        },
      },
      {
        // Il pulsante «Nuovo utente» è disabilitato senza sedi licenziate:
        // senza questa, il form non si apre nemmeno.
        provide: OperationalLocationsService,
        useValue: {
          allTenantLocations: () => [
            { id: 'loc-1', name: 'Negozio test', isActive: true, licensedInVf: true },
          ],
          locations: () => [],
          reload: vi.fn(),
        },
      },
    ],
  });
  await userEvent.click(screen.getByRole('button', { name: /nuovo utente/i }));
  return view;
}

describe('UsersPageComponent — il form di creazione dice perché non parte', () => {
  it('con i campi vuoti mostra un errore per ciascuno invece di non fare nulla', async () => {
    const createUser = vi.fn();
    await apri(createUser);

    await userEvent.click(screen.getByRole('button', { name: /crea utente/i }));

    expect(screen.getByText(/almeno 2 caratteri/i)).toBeTruthy();
    expect(screen.getByText(/indirizzo email valido/i)).toBeTruthy();
    expect(screen.getByText(/almeno 8 caratteri/i)).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });

  it('la password corta è segnalata sul campo, non ignorata in silenzio', async () => {
    const createUser = vi.fn();
    await apri(createUser);

    await userEvent.type(screen.getByLabelText(/nome visualizzato/i), 'Commesso Uno');
    await userEvent.type(screen.getByLabelText(/email/i), 'commesso@test.it');
    await userEvent.type(screen.getByLabelText(/password iniziale/i), 'corta');

    await userEvent.click(screen.getByRole('button', { name: /crea utente/i }));

    expect(screen.getByText(/almeno 8 caratteri/i)).toBeTruthy();
    expect(screen.queryByText(/almeno 2 caratteri/i)).toBeNull();
    expect(createUser).not.toHaveBeenCalled();
  });

  // Con i campi a posto la validazione passa e il form arriva al controllo
  // successivo: un commesso vuole almeno una sede operativa. Anche quel rifiuto
  // deve essere detto — è la stessa regola, applicata al passo dopo.
  it('superata la validazione dei campi, dice che manca la sede invece di tacere', async () => {
    const createUser = vi.fn();
    await apri(createUser);

    await userEvent.type(screen.getByLabelText(/nome visualizzato/i), 'Commesso Uno');
    await userEvent.type(screen.getByLabelText(/email/i), 'commesso@test.it');
    await userEvent.type(screen.getByLabelText(/password iniziale/i), 'password-lunga');

    await userEvent.click(screen.getByRole('button', { name: /crea utente/i }));

    expect(screen.queryByText(/almeno 2 caratteri/i)).toBeNull();
    expect(screen.queryByText(/indirizzo email valido/i)).toBeNull();
    expect(screen.queryByText(/almeno 8 caratteri/i)).toBeNull();
    expect(screen.getByText(/almeno una sede operativa/i)).toBeTruthy();
    expect(createUser).not.toHaveBeenCalled();
  });
});
