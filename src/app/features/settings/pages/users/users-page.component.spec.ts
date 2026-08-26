import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Subject, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { defaultPermissionsForRole } from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import type { TenantUser } from '@domain/users/models/tenant-user.model';
import { TenantUsersService } from '@domain/users/services/tenant-users.service';

import { UsersPageComponent } from './users-page.component';

// jsdom non implementa il <dialog> nativo: senza questo, ogni conferma esplode
// con «showModal is not a function». È un limite dell'ambiente di prova.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.open = false;
  });
});

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
  manualUnloadEnabled: true,
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

const commesso: TenantUser = {
  id: 'user-2',
  email: 'commesso@test.it',
  displayName: 'Commesso Uno',
  role: UserRole.Clerk,
  hasAllLocationsAccess: false,
  assignedLocationIds: ['loc-1'],
  assignedLocations: [{ id: 'loc-1', name: 'Negozio test' }],
  defaultLocationId: null,
  permissions: [...defaultPermissionsForRole(UserRole.Clerk)],
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Tabella con un commesso modificabile: il titolare non può modificare se stesso. */
async function apriTabella(updateUser: unknown = vi.fn()) {
  return render(UsersPageComponent, {
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: () => titolare } },
      {
        provide: TenantUsersService,
        useValue: {
          listUsers: () => of([commesso]),
          createUser: vi.fn(),
          updateUser,
          deleteUser: vi.fn(),
        },
      },
      {
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
}

/** Risposte pilotate a mano: servono per fermare il salvataggio a metà strada. */
function updateUserSospeso(): {
  readonly spy: ReturnType<typeof vi.fn>;
  readonly risposte: Subject<TenantUser>[];
} {
  const risposte: Subject<TenantUser>[] = [];
  const spy = vi.fn(() => {
    const risposta = new Subject<TenantUser>();
    risposte.push(risposta);
    return risposta.asObservable();
  });
  return { spy, risposte };
}

describe('UsersPageComponent — nessuna spunta si perde in silenzio', () => {
  it('mentre il salvataggio è in volo le caselle sono spente e lo dice a schermo', async () => {
    const { spy } = updateUserSospeso();
    await apriTabella(spy);

    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Consulta Preventivo' }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: 'Consulta DDT di vendita' })).toBeDisabled();
    expect(
      screen.getByRole('checkbox', { name: 'Account attivo per Commesso Uno' }),
    ).toBeDisabled();
    expect(screen.getByText(/salvataggio/i)).toBeInTheDocument();
  });

  it('la modifica che passa comunque durante il salvataggio parte dopo, non sparisce', async () => {
    const { spy, risposte } = updateUserSospeso();
    await apriTabella(spy);

    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Consulta Preventivo' }));
    expect(spy).toHaveBeenCalledTimes(1);

    // La riga è inerte, ma un evento può ancora arrivarci (tastiera, doppio
    // clic): prima veniva scartato in silenzio, ora aspetta il suo turno.
    const attivo = screen.getByRole('checkbox', { name: 'Account attivo per Commesso Uno' });
    (attivo as HTMLInputElement).checked = false;
    attivo.dispatchEvent(new Event('change'));
    expect(spy).toHaveBeenCalledTimes(1);

    risposte[0]?.next({ ...commesso });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('user-2', { isActive: false });
  });
});

describe('UsersPageComponent — le azioni che cancellano i permessi chiedono conferma', () => {
  it('il cambio ruolo in riga non salva finché non si conferma', async () => {
    const { spy } = updateUserSospeso();
    await apriTabella(spy);

    await userEvent.click(screen.getByRole('button', { name: 'Ruolo utente' }));
    await userEvent.click(screen.getByRole('option', { name: 'Manager' }));

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(/passa da Commesso\/a a Manager/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cambia ruolo' }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('annullando la conferma il ruolo resta quello di prima', async () => {
    const { spy } = updateUserSospeso();
    await apriTabella(spy);

    await userEvent.click(screen.getByRole('button', { name: 'Ruolo utente' }));
    await userEvent.click(screen.getByRole('option', { name: 'Manager' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ruolo utente' })).toHaveTextContent('Commesso/a');
  });

  it('«Ripristina preset ruolo» non butta via le personalizzazioni senza conferma', async () => {
    const { spy } = updateUserSospeso();
    await apriTabella(spy);

    await userEvent.click(screen.getByRole('button', { name: 'Personalizza' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ripristina preset ruolo' }));

    expect(spy).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Ripristina preset' }));

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('UsersPageComponent — matrice documenti leggibile con lo screen reader', () => {
  // L'editor del pannello «Nuovo utente» è già nella pagina: basta lui, e
  // aprire anche quello della riga darebbe due matrici identiche da distinguere.
  it('la cella «Gestisci» delle famiglie di sola consultazione dice perché è vuota', async () => {
    await apriTabella();

    expect(
      screen.getByText(/Gestisci Vendite online e corrispettivi: non disponibile/i),
    ).toBeInTheDocument();
  });
});
