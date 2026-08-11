import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
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

const LOCATIONS = [{ id: 'loc-1', name: 'Milano' }];

function serviceMock() {
  return {
    create: vi.fn((_body: SaveDocumentCounterBody) => of({} as DocumentCounterView)),
    update: vi.fn((_id: string, _body: SaveDocumentCounterBody) => of({} as DocumentCounterView)),
    delete: vi.fn((_id: string) => of(undefined)),
  };
}

function senzaSerie(): DocumentCounterView {
  return {
    id: 'base',
    type: 'quote',
    series: null,
    locationId: null,
    locationName: null,
    isDefault: true,
    nextNumber: 1,
    documentCount: 0,
    missingCount: 0,
    missingNumbers: [],
  };
}

function operatorSeries(): DocumentCounterView {
  return {
    id: 's1',
    type: 'quote',
    series: 'NAP',
    locationId: 'loc-1',
    locationName: 'Milano',
    isDefault: false,
    nextNumber: 5,
    documentCount: 4,
    missingCount: 0,
    missingNumbers: [],
  };
}

async function setup(counters: DocumentCounterView[]) {
  const service = serviceMock();
  const changed = vi.fn();
  await render(DocumentCountersComponent, {
    inputs: { type: 'quote', counters },
    on: { changed },
    providers: [
      { provide: DocumentCountersService, useValue: service },
      { provide: OperationalLocationsService, useValue: { locations: () => LOCATIONS } },
      { provide: ToastService, useValue: { showInfo: vi.fn(), showError: vi.fn() } },
    ],
  });
  return { service, changed };
}

describe('DocumentCountersComponent (serie per tipo)', () => {
  it('mostra «Senza serie» senza azioni di modifica/eliminazione', async () => {
    await setup([senzaSerie()]);
    expect(await screen.findByText('Senza serie')).toBeTruthy();
    expect(screen.getByText('Predefinita')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifica' })).toBeNull();
  });

  it('una serie dell’operatore ha modifica ed eliminazione', async () => {
    await setup([senzaSerie(), operatorSeries()]);
    expect(await screen.findByText('NAP')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifica' })).toBeTruthy();
  });

  it('crea una nuova serie con il nome digitato', async () => {
    const user = userEvent.setup();
    const { service, changed } = await setup([senzaSerie()]);

    await user.click(screen.getByRole('button', { name: 'Aggiungi serie' }));
    await user.type(screen.getByPlaceholderText('Es. 2026, NAP, MI'), '2026');
    await user.click(screen.getByRole('button', { name: 'Salva' }));

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.create.mock.calls[0]![0]).toMatchObject({ type: 'quote', series: '2026' });
    expect(changed).toHaveBeenCalled();
  });

  it('elenca i numeri liberi e spiega come riprenderli', async () => {
    await setup([
      senzaSerie(),
      { ...operatorSeries(), missingCount: 3, missingNumbers: [7, 12, 40] },
    ]);

    expect(await screen.findByText('3 numeri liberi: 7, 12, 40')).toBeTruthy();
    expect(screen.getByText(/scrivilo a mano nella testata del nuovo documento/i)).toBeTruthy();
  });

  it('un solo numero libero è al singolare', async () => {
    await setup([{ ...operatorSeries(), missingCount: 1, missingNumbers: [7] }]);
    expect(await screen.findByText('1 numero libero: 7')).toBeTruthy();
  });

  it('oltre i primi elencati dice quanti altri sono', async () => {
    await setup([
      { ...operatorSeries(), missingCount: 12, missingNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    ]);
    expect(
      await screen.findByText('12 numeri liberi: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 e altri 2'),
    ).toBeTruthy();
  });

  it('serie senza buchi: nessuna nota e nessuna spiegazione', async () => {
    await setup([senzaSerie(), operatorSeries()]);
    expect(await screen.findByText('NAP')).toBeTruthy();
    expect(screen.queryByText(/numer[oi] liber[oi]/i)).toBeNull();
    expect(screen.queryByText(/scrivilo a mano nella testata/i)).toBeNull();
  });

  it('«Rendi predefinita» aggiorna il contatore', async () => {
    const user = userEvent.setup();
    const { service } = await setup([senzaSerie(), operatorSeries()]);

    await user.click(screen.getByRole('button', { name: 'Rendi predefinita' }));

    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.update.mock.calls[0]![1]).toMatchObject({ isDefault: true });
  });
});
