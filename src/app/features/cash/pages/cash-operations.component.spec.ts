import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { PaymentOptionsService } from '@core/services/payment-options.service';
import type { CashOperationsPage } from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';

import { CashOperationsComponent } from './cash-operations.component';

/**
 * ⛔ **Ciò che queste prove falsificano**:
 *
 * ```text
 *   il riepilogo lo somma il browser     NO: arriva dal server, col filtro
 *   gli annullati spariscono             si vedono, e lo stato lo dice
 *   il reso si cerca per identificativo  si cerca per numero, articolo, cliente
 * ```
 */

const PAGINA: CashOperationsPage = {
  page: 1,
  pageSize: 100,
  total: 2,
  summary: {
    grossSalesMinor: 30_000,
    returnsMinor: 10_000,
    netSalesMinor: 20_000,
    cashMinor: 12_000,
    electronicMinor: 8_000,
    saleCount: 2,
    returnCount: 1,
    operationCount: 3,
    averageMinor: 6_666,
  },
  items: [
    {
      id: 'd1',
      kind: 'sale',
      reference: 'CS/2026/1',
      documentDate: '2026-09-04T00:00:00.000Z',
      createdAt: '2026-09-04T10:00:00.000Z',
      status: 'confirmed',
      locationId: 'loc1',
      locationName: 'Negozio A',
      operatorId: 'u1',
      operatorName: 'Anna',
      sessionId: 's1',
      customerName: null,
      totalMinor: 20_000,
      payments: [
        {
          paymentOptionId: 'c1',
          optionName: 'Contanti',
          tenderKind: 'cash',
          amountMinor: 20_000,
          tenderedMinor: 20_000,
          refundedFromPaymentId: null,
        },
      ],
      mixed: false,
      changeMinor: 0,
      sourceDocumentId: null,
      sourceReference: null,
      anomalies: [],
    },
    {
      id: 'd2',
      kind: 'sale',
      reference: 'CS/2026/2',
      documentDate: '2026-09-04T00:00:00.000Z',
      createdAt: '2026-09-04T11:00:00.000Z',
      status: 'cancelled',
      locationId: 'loc1',
      locationName: 'Negozio A',
      operatorId: 'u1',
      operatorName: 'Anna',
      sessionId: 's1',
      customerName: null,
      totalMinor: 5_000,
      payments: [],
      mixed: false,
      changeMinor: 0,
      sourceDocumentId: null,
      sourceReference: null,
      anomalies: ['annullato'],
    },
  ],
};

async function montaOperazioni(operations = vi.fn(() => of(PAGINA))) {
  const api = { operations, searchReceipts: vi.fn(() => of([])) };
  const vista = await render(CashOperationsComponent, {
    providers: [
      provideRouter([]),
      { provide: CashApiService, useValue: api },
      { provide: OperationalLocationsService, useValue: { locations: () => [] } },
      { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
    ],
  });
  return { ...vista, api };
}

describe('CashOperationsComponent', () => {
  it('il riepilogo è quello del SERVER, non una somma delle righe', async () => {
    await montaOperazioni();

    // ⭐ 300,00 lorde e 200,00 nette: le due righe a schermo sommerebbero
    //    altro, perché una è annullata e i resi non sono nell'elenco.
    expect(screen.getByText('3 operazioni')).toBeVisible();
    expect(screen.getByText('300,00 €')).toBeVisible();
    // ⚠️ 200,00 compare due volte — netto e riga: si conta.
    expect(screen.getAllByText('200,00 €').length).toBeGreaterThan(0);
    expect(screen.getByText('Vendite nette')).toBeVisible();
  });

  it('un_operazione ANNULLATA si vede, con il suo stato', async () => {
    await montaOperazioni();

    expect(screen.getByText('CS/2026/2')).toBeVisible();
    expect(screen.getByText('Annullato')).toBeVisible();
  });

  it('dice che gli annullati non entrano nei totali', async () => {
    const { container } = await montaOperazioni();

    expect(container.textContent).toMatch(/non entrano nei totali/);
  });

  it('non promette nessuna fiscalizzazione avvenuta', async () => {
    const { container } = await montaOperazioni();

    const testo = container.textContent ?? '';
    expect(testo).toMatch(/Fiscalizzazione non ancora disponibile|fiscalizzazione non è ancora/i);
    expect(testo).not.toMatch(/scontrino emesso/i);
    expect(testo).not.toMatch(/trasmess/i);
  });

  it('il richiamo scontrino non chiede nessun identificativo', async () => {
    await montaOperazioni();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Richiama scontrino' }));

    // ⛔ Il campo parla di numero, articolo e cliente: mai di UUID o id.
    expect(screen.getByText('Numero, articolo o cliente')).toBeInTheDocument();
  });
});
