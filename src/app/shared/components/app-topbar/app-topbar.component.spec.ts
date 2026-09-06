import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import type { Location } from '@core/models/location.model';

import { AppTopbarComponent } from './app-topbar.component';

const napoli: Location = {
  id: 'loc-nap',
  tenantId: 't1',
  name: 'Napoli',
  isActive: true,
  licensedInVf: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const roma: Location = {
  ...napoli,
  id: 'loc-rom',
  name: 'Roma',
};

describe('AppTopbarComponent', () => {
  it('con una sola sede niente selettore: la sede sta nel bottone profilo', async () => {
    await render(AppTopbarComponent, {
      componentInputs: {
        locations: [napoli],
        activeLocationId: napoli.id,
      },
    });

    // Il blocco profilo è solo avatar: la sede vive nel nome accessibile.
    expect(screen.getByRole('button', { name: /Profilo e impostazioni.*Napoli/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Location attiva' })).not.toBeInTheDocument();
  });

  it('mostra select con più sedi e selettore non bloccato', async () => {
    await render(AppTopbarComponent, {
      componentInputs: {
        locations: [napoli, roma],
        activeLocationId: null,
        locationSelectorLocked: false,
      },
    });

    expect(screen.getByRole('button', { name: 'Location attiva' })).toBeVisible();
    expect(screen.queryByText('Napoli')).not.toBeInTheDocument();
  });

  it('con la sede bloccata niente selettore: la sede sta nel bottone profilo', async () => {
    await render(AppTopbarComponent, {
      componentInputs: {
        locations: [napoli, roma],
        locationSelectorLocked: true,
        fixedLocationLabel: 'Roma',
      },
    });

    expect(screen.getByRole('button', { name: /Profilo e impostazioni.*Roma/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Location attiva' })).not.toBeInTheDocument();
  });
});
