import { DocumentType } from '@core/models/document.model';
import { ToastService } from '@core/services/toast.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { render, screen } from '@testing-library/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocumentSeriesManagerDialogComponent } from './document-series-manager-dialog.component';
import type { DocumentCounterView } from '../../models/document-counter.model';
import { DocumentCountersService } from '../../services/document-counters.service';

/**
 * Il pannello parla di CONTATORI, e un contatore esiste solo per il tipo che
 * possiede il numeratore. Filtrandolo sul tipo grezzo, aperto da una Fattura
 * accompagnatoria mostrava zero righe — e un contatore creato da lì sarebbe
 * stato rifiutato dall'API con 422.
 */
describe('DocumentSeriesManagerDialogComponent — il pannello segue il numeratore', () => {
  const counter = (over: Partial<DocumentCounterView>): DocumentCounterView => ({
    id: 'c',
    type: 'invoice_draft',
    series: null,
    locationId: null,
    locationName: null,
    isDefault: false,
    nextNumber: 1,
    documentCount: 0,
    missingCount: 0,
    missingNumbers: [],
    ...over,
  });

  async function setup(type: DocumentType) {
    const list = vi.fn(() =>
      of([
        counter({ id: 'ft', type: 'invoice_draft', series: 'FT-A' }),
        counter({ id: 'pre', type: 'quote', series: 'PRE-A' }),
      ]),
    );

    await render(DocumentSeriesManagerDialogComponent, {
      inputs: { type, open: true },
      providers: [
        {
          provide: DocumentCountersService,
          useValue: { list, create: vi.fn(), update: vi.fn(), delete: vi.fn() },
        },
        { provide: OperationalLocationsService, useValue: { list: () => of([]) } },
        { provide: ToastService, useValue: { show: vi.fn(), error: vi.fn(), success: vi.fn() } },
      ],
    });

    return { list };
  }

  it('aperto da una Fattura accompagnatoria mostra le serie della Fattura', async () => {
    await setup(DocumentType.InvoiceAccompanying);

    expect(await screen.findByText('FT-A')).toBeTruthy();
    expect(screen.queryByText('PRE-A')).toBeNull();
  });

  it('il titolo nomina il numeratore, non il tipo del documento aperto', async () => {
    await setup(DocumentType.InvoiceAccompanying);

    // «Fattura», non «Fattura accompagnatoria»: sono i contatori della Fattura,
    // ed è sotto quel tipo che ne verrebbe creato uno nuovo.
    expect(await screen.findByText('Numerazioni · Fattura')).toBeTruthy();
  });

  it('sui tipi con numeratore proprio non cambia nulla', async () => {
    await setup(DocumentType.Quote);

    expect(await screen.findByText('PRE-A')).toBeTruthy();
    expect(screen.queryByText('FT-A')).toBeNull();
  });
});
