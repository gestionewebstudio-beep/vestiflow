import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthService } from '@core/auth';
import type { PaymentOption } from '@core/models/payment-option.model';
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
      { provide: PaymentOptionsService, useValue: { list: () => of([CONTANTI]) } },
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
        { provide: PaymentOptionsService, useValue: { list: () => of([CONTANTI]) } },
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
        { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
      ],
    });

    expect(screen.queryByText('Nessuna voce: aggiungine una qui sopra.')).toBeNull();
    expect(screen.getAllByText('Nessuna voce configurata.').length).toBe(2);
  });
});
