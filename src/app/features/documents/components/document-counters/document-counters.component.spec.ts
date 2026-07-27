import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { ToastService } from '@core/services/toast.service';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocumentCountersComponent } from './document-counters.component';
import type {
  DocumentCounterView,
  SaveDocumentCounterBody,
} from '../../models/document-counter.model';
import { DocumentCountersService } from '../../services/document-counters.service';

const LOCATIONS = [
  { id: 'loc-1', name: 'Milano' },
  { id: 'loc-2', name: 'Roma' },
];

function serviceMock(counters: DocumentCounterView[]) {
  return {
    list: vi.fn(() => of(counters)),
    create: vi.fn((_body: SaveDocumentCounterBody) => of(counters[0])),
    update: vi.fn((_id: string, _body: SaveDocumentCounterBody) => of(counters[0])),
    delete: vi.fn((_id: string) => of(undefined)),
  };
}

async function setup(counters: DocumentCounterView[] = []) {
  const service = serviceMock(counters);
  await render(DocumentCountersComponent, {
    providers: [
      { provide: DocumentCountersService, useValue: service },
      { provide: OperationalLocationsService, useValue: { locations: () => LOCATIONS } },
      { provide: ToastService, useValue: { showInfo: vi.fn(), showError: vi.fn() } },
    ],
  });
  return { service };
}

describe('DocumentCountersComponent', () => {
  it('mostra i contatori con il prossimo numero e la sede', async () => {
    await setup([
      {
        id: 'c1',
        type: 'sales_ddt',
        series: 'MI',
        locationId: 'loc-1',
        locationName: 'Milano',
        isDefault: false,
        nextNumber: 12,
        documentCount: 11,
      },
    ]);

    expect(await screen.findByText('MI')).toBeTruthy();
    expect(screen.getByText('Milano')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('mostra la sede "Tutte le sedi" per un contatore globale', async () => {
    await setup([
      {
        id: 'c1',
        type: 'quote',
        series: null,
        locationId: null,
        locationName: null,
        isDefault: true,
        nextNumber: 1,
        documentCount: 0,
      },
    ]);

    expect(await screen.findByText('Tutte le sedi')).toBeTruthy();
    expect(screen.getByText('Senza serie')).toBeTruthy();
  });

  it('senza contatori mostra lo stato vuoto con la CTA', async () => {
    await setup([]);
    expect(await screen.findByText('Nessun numeratore configurato')).toBeTruthy();
  });

  it('crea un contatore con la serie digitata e il tipo di default', async () => {
    const user = userEvent.setup();
    const { service } = await setup([]);

    await user.click((await screen.findAllByRole('button', { name: /nuovo contatore/i }))[0]!);
    await user.clear(screen.getByPlaceholderText('Es. 2026, NAP, MI'));
    await user.type(screen.getByPlaceholderText('Es. 2026, NAP, MI'), 'NAP');
    await user.click(screen.getByRole('button', { name: 'Salva' }));

    expect(service.create).toHaveBeenCalledTimes(1);
    const body = service.create.mock.calls[0]![0];
    expect(body).toMatchObject({ series: 'NAP', locationId: null });
    expect(typeof body.type).toBe('string');
  });
});
