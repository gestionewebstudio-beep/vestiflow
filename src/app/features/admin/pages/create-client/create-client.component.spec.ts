import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';

import { ADMIN_TENANTS_COLUMN_DEFS } from '../../models/admin-tenants-table-columns.config';
import { CreateClientComponent } from './create-client.component';

/** Il servizio vero delle preferenze colonne tira dietro `AuthService`: qui basta un doppio (`docs/26` A14). */
const COLONNE_FINTE = {
  provide: TableColumnPreferenceService,
  useValue: {
    registerView: () => undefined,
    columnDefs: () => ADMIN_TENANTS_COLUMN_DEFS,
    visibleColumns: () =>
      signal(ADMIN_TENANTS_COLUMN_DEFS.map((c) => ({ ...c, pinned: false }))).asReadonly(),
    visibleColumnIds: () => ADMIN_TENANTS_COLUMN_DEFS.map((c) => c.id),
    state: () =>
      signal({
        presetId: 'default',
        columnOrder: ADMIN_TENANTS_COLUMN_DEFS.map((c) => c.id),
        hiddenColumnIds: [] as string[],
        pinnedColumnIds: [] as string[],
        columnWidths: {},
      }).asReadonly(),
    presetMap: () => ({}),
    isColumnVisible: () => true,
    moveColumn: () => undefined,
    toggleColumn: () => undefined,
    togglePin: () => undefined,
    applyPreset: () => undefined,
    resetToDefault: () => undefined,
    columnWidth: (_v: unknown, _c: string, ripiego: number) => ripiego,
    setColumnWidths: () => undefined,
  },
};
import { AdminTenantsService } from '../../services/admin-tenants.service';
import { SupportSessionService } from '@core/support/support-session.service';

describe('CreateClientComponent', () => {
  async function setup() {
    await render(CreateClientComponent, {
      providers: [
        COLONNE_FINTE,
        { provide: AdminTenantsService, useValue: { listTenants: () => of([]) } },
        {
          provide: SupportSessionService,
          useValue: { enterTenantWorkspace: vi.fn(), mapStartError: vi.fn() },
        },
        {
          provide: Router,
          useValue: {
            url: '/app/admin/clients/new',
            events: of(),
            navigate: vi.fn(),
            navigateByUrl: vi.fn(),
          },
        },
      ],
    });
  }

  // Regressione: il toggle Shopify e l'hint del profilo canale sono computed che
  // leggono channelProfile dal FormControl (non signal): devono reagire alla
  // scelta del profilo, non restare fissi sul profilo iniziale (Gestionale).
  it('mostra la nota Shopify e nasconde il campo location scegliendo il profilo Shopify', async () => {
    const user = userEvent.setup();
    await setup();

    // Stato iniziale (Gestionale): campo location presente, nota Shopify assente.
    expect(screen.getByText('Nome location (opzionale)')).toBeVisible();
    expect(screen.queryByText(/le sedi magazzino vengono importate/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Tipo cliente' }));
    await user.click(screen.getByRole('option', { name: 'Shopify' }));

    expect(await screen.findByText(/le sedi magazzino vengono importate/)).toBeVisible();
    expect(screen.queryByText('Nome location (opzionale)')).toBeNull();
    expect(screen.getByText('Il cliente collega lo shop Shopify da Impostazioni.')).toBeVisible();
  });
});
