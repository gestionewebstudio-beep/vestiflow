import { Router } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { CreateClientComponent } from './create-client.component';
import { AdminTenantsService } from '@features/admin/services/admin-tenants.service';
import { SupportSessionService } from '@core/support/support-session.service';

describe('CreateClientComponent', () => {
  async function setup() {
    await render(CreateClientComponent, {
      providers: [
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
