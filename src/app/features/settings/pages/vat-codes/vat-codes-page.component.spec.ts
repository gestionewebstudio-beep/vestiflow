import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { AuthService } from '@core/auth';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import type { User } from '@core/models/user.model';
import { UserRole } from '@core/models/user.model';
import type { VatCode, VatNature } from '@core/models/vat-code.model';
import { VatCodeService } from '@core/services/vat-code.service';

import { VatCodesPageComponent } from './vat-codes-page.component';

/**
 * La pagina si apre con la sola sezione Impostazioni, ma creare, duplicare,
 * salvare ed eliminare un Codice IVA l'API li riserva a `settings.company`:
 * quei comandi spariscono, l'elenco e la scheda restano consultabili.
 */
const NATURA: VatNature = {
  id: 'n1',
  key: 'TAXABLE',
  officialCode: null,
  label: 'Imponibile',
  description: null,
  defaultUsageScope: 'both',
  defaultCalculationMode: 'standard',
  sortOrder: 1,
};

const CODICE: VatCode = {
  id: 'v1',
  code: '22',
  natureId: 'n1',
  nature: NATURA,
  ratePercent: 22,
  nonDeductiblePercent: 0,
  description: 'IVA 22% ordinaria',
  notes: null,
  usageScope: 'both',
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isDefault: false,
  isActive: true,
  isSystem: true,
  sortOrder: 1,
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
  await render(VatCodesPageComponent, {
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: () => utente(permissions) } },
      {
        provide: VatCodeService,
        useValue: { list: () => of([CODICE]), listNatures: () => of([NATURA]) },
      },
    ],
  });
}

/** Apre la scheda del Codice IVA cliccando la riga. */
function apriScheda(): void {
  fireEvent.click(screen.getByText('IVA 22% ordinaria'));
}

describe('VatCodesPageComponent — comandi riservati a «Impostazioni azienda»', () => {
  it('con la sola sezione Impostazioni resta l’elenco, senza creazione né duplica', async () => {
    await apri([TenantPermission.SectionSettings]);

    expect(screen.getByText('IVA 22% ordinaria')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuovo Codice IVA' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Duplica' })).toBeNull();
  });

  it('la scheda si apre in sola lettura: niente Salva, e il motivo è scritto', async () => {
    await apri([TenantPermission.SectionSettings]);
    apriScheda();

    expect(screen.getByRole('heading', { name: 'Dettaglio Codice IVA' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salva' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull();
    expect(
      screen.getByText(
        'Scheda in sola lettura: la modifica dei Codici IVA richiede il permesso «Impostazioni azienda».',
      ),
    ).toBeTruthy();
  });

  it('con «Impostazioni azienda» tornano creazione, duplica e salvataggio', async () => {
    await apri([TenantPermission.SectionSettings, TenantPermission.SettingsCompany]);

    expect(screen.getByRole('button', { name: 'Nuovo Codice IVA' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Duplica' })).toBeTruthy();

    apriScheda();

    expect(screen.getByRole('heading', { name: 'Modifica Codice IVA' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salva' })).toBeTruthy();
  });

  it('al titolare i comandi restano anche senza permessi espliciti', async () => {
    await render(VatCodesPageComponent, {
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ ...utente([]), role: UserRole.Owner }) },
        },
        {
          provide: VatCodeService,
          useValue: { list: () => of([CODICE]), listNatures: () => of([NATURA]) },
        },
      ],
    });

    expect(screen.getByRole('button', { name: 'Nuovo Codice IVA' })).toBeTruthy();
  });
});
