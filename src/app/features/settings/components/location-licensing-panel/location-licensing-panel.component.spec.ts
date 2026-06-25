import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ShopifySyncStatus } from '@core/models/shopify.model';
import type { Location } from '@core/models/location.model';
import { AppErrorKind } from '@core/models/app-error.model';

import { InventoryService } from '@features/inventory/services/inventory.service';
import { LocationLicensingPanelComponent } from './location-licensing-panel.component';

const shopifyLocation = (id: string, name: string, licensedInVf: boolean): Location => ({
  id,
  tenantId: 'tenant-1',
  name,
  code: `LOC-${id}`,
  isActive: true,
  licensedInVf,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  shopify: {
    shopifyId: `gid://shopify/Location/${id}`,
    status: ShopifySyncStatus.Synced,
    lastSyncedAt: '2026-01-01T00:00:00.000Z',
  },
});

describe('LocationLicensingPanelComponent', () => {
  async function setup(options?: {
    canManage?: boolean;
    selectionLocked?: boolean;
    selectionChangeGranted?: boolean;
    locations?: readonly Location[];
  }) {
    const inventory = {
      setLicensedLocations: vi.fn(() =>
        of({
          licensedLocationCount: 2,
          licensedLocationActiveCount: 1,
          locationSelectionLocked: true,
          locationSelectionChangeGranted: false,
          canChangeLicensedLocations: false,
        }),
      ),
    };

    await render(LocationLicensingPanelComponent, {
      componentInputs: {
        locations: options?.locations ?? [
          shopifyLocation('1', 'Shop location', true),
          shopifyLocation('2', 'Warehouse', false),
        ],
        licensedLocationCount: 2,
        canManage: options?.canManage ?? true,
        selectionLocked: options?.selectionLocked ?? false,
        selectionChangeGranted: options?.selectionChangeGranted ?? false,
      },
      providers: [{ provide: InventoryService, useValue: inventory }],
    });

    return { inventory };
  }

  it('mostra messaggio assistenza quando selezione bloccata', async () => {
    await setup({ selectionLocked: true, canManage: false });

    expect(screen.getByText("Contatta l'assistenza per modificare le sedi attive.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salva sedi attive' })).toBeNull();
  });

  it('mostra hint modifica concessa e pulsante salva quando sbloccato dall admin', async () => {
    await setup({ selectionLocked: true, selectionChangeGranted: true });

    expect(
      screen.getByText('Modifica consentita una sola volta. Salva per confermare le sedi attive.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salva sedi attive' })).toBeTruthy();
  });

  it('salva selezione e propaga saved', async () => {
    const user = userEvent.setup();
    const { inventory } = await setup();

    await user.click(screen.getByRole('button', { name: 'Salva sedi attive' }));

    expect(inventory.setLicensedLocations).toHaveBeenCalledWith(['1']);
  });

  it('mostra errore API inline se salvataggio fallisce', async () => {
    const user = userEvent.setup();
    const inventory = {
      setLicensedLocations: vi.fn(() =>
        throwError(() => ({
          kind: AppErrorKind.Forbidden,
          message: "Contatta l'assistenza per modificare le sedi attive.",
        })),
      ),
    };

    await render(LocationLicensingPanelComponent, {
      componentInputs: {
        locations: [shopifyLocation('1', 'Shop location', true)],
        licensedLocationCount: 1,
        canManage: true,
        selectionLocked: false,
        selectionChangeGranted: false,
      },
      providers: [{ provide: InventoryService, useValue: inventory }],
    });

    await user.click(screen.getByRole('button', { name: 'Salva sedi attive' }));

    expect(screen.getByText("Contatta l'assistenza per modificare le sedi attive.")).toBeTruthy();
  });
});
