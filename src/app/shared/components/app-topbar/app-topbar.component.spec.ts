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
  it('mostra etichetta fissa con una sola sede disponibile', async () => {
    await render(AppTopbarComponent, {
      componentInputs: {
        locations: [napoli],
        activeLocationId: napoli.id,
      },
    });

    expect(screen.getByText('Napoli')).toBeVisible();
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

  it('mostra etichetta fissa quando la sede è bloccata', async () => {
    await render(AppTopbarComponent, {
      componentInputs: {
        locations: [napoli, roma],
        locationSelectorLocked: true,
        fixedLocationLabel: 'Roma',
      },
    });

    expect(screen.getByText('Roma')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Location attiva' })).not.toBeInTheDocument();
  });
});
