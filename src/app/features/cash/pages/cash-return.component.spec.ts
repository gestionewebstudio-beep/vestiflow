import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type {
  CashOperationDetail,
  CashSessionState,
  ReturnLookup,
} from '@domain/cash/models/cash.model';
import { CashApiService } from '@domain/cash/services/cash-api.service';

import { CashReturnComponent } from './cash-return.component';

/**
 * ⛔ **Ciò che queste prove falsificano**:
 *
 * ```text
 *   si rende piu` del rendibile          il campo si ferma al residuo
 *   si rimborsa su un Tipo qualsiasi     si rimborsa sulle QUOTE dell_incasso
 *   il reso parte senza sessione         no: si dice, e non si offre il gesto
 * ```
 */

const OPERAZIONE = { locationId: 'loc1' } as CashOperationDetail;

const APERTA: CashSessionState = {
  session: { id: 's1', locationId: 'loc1', status: 'open' } as CashSessionState['session'],
  depositsMinor: 0,
  withdrawalsMinor: 0,
};

const VENDITA: ReturnLookup = {
  documentId: 'd1',
  reference: 'CS/2026/1',
  documentDate: '2026-09-04T00:00:00.000Z',
  totalMinor: 20_000,
  cashSessionId: 's1',
  lines: [
    {
      lineId: 'l1',
      variantId: 'v1',
      description: 'Maglia cotone',
      quantitySold: 2,
      quantityReturned: 1,
      quantityReturnable: 1,
      unitPriceMinor: 10_000,
      lineTotalMinor: 16_393,
      lineGrossTotalMinor: 20_000,
    },
  ],
  payments: [
    {
      paymentId: 'q1',
      paymentOptionId: 'c1',
      optionName: 'Contanti',
      tenderKind: 'cash',
      amountMinor: 20_000,
    },
  ],
};

async function montaReso(opzioni?: { stato?: CashSessionState }) {
  const api = {
    operation: vi.fn(() => of(OPERAZIONE)),
    current: vi.fn(() => of(opzioni?.stato ?? APERTA)),
    lookupReturn: vi.fn(() => of(VENDITA)),
    createReturn: vi.fn(() => of({ documentId: 'r1', reference: 'RS/2026/1', totaleMinor: 10_000 })),
  };
  const vista = await render(CashReturnComponent, {
    providers: [
      provideRouter([]),
      { provide: CashApiService, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id: 'd1' })) },
      },
    ],
  });
  return { ...vista, api };
}

describe('CashReturnComponent', () => {
  it('mostra venduto, già reso e ancora rendibile', async () => {
    await montaReso();

    expect(screen.getByText('Articoli da rendere')).toBeVisible();
    expect(screen.getByText('Venduti')).toBeVisible();
    expect(screen.getByText('Già resi')).toBeVisible();
    expect(screen.getByText('Rendibili')).toBeVisible();
  });

  it('il campo quantità si ferma al RESIDUO, non al venduto', async () => {
    await montaReso();

    const campo = screen.getByLabelText(/Quantità da rendere di Maglia cotone/);
    // ⭐ Venduti 2, già resi 1: il massimo è 1.
    expect(campo).toHaveAttribute('max', '1');
  });

  it('il rimborso si compone sulle QUOTE dell_incasso', async () => {
    await montaReso();

    // ⭐ La quota, col suo nome e quanto era stato incassato.
    expect(screen.getAllByText(/Contanti/).length).toBeGreaterThan(0);
    expect(screen.getByText(/incassati/)).toBeVisible();
    expect(screen.getByLabelText('Rimborso su Contanti')).toBeVisible();
  });

  it('«Proponi» riempie il rimborso con il totale del reso', async () => {
    await montaReso();
    const utente = userEvent.setup();

    await utente.clear(screen.getByLabelText(/Quantità da rendere/));
    await utente.type(screen.getByLabelText(/Quantità da rendere/), '1');
    await utente.click(screen.getByRole('button', { name: 'Proponi' }));

    expect(screen.getByText(/Rimborso composto: 100,00 € su 100,00 €/)).toBeVisible();
  });

  it('senza sessione aperta il reso non si fa, e si dice', async () => {
    await montaReso({ stato: { session: null, depositsMinor: 0, withdrawalsMinor: 0 } });

    expect(screen.getByText('Nessuna sessione aperta')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Concludi reso' })).toBeNull();
  });

  it('senza motivo il reso non si conclude', async () => {
    await montaReso();
    const utente = userEvent.setup();

    await utente.clear(screen.getByLabelText(/Quantità da rendere/));
    await utente.type(screen.getByLabelText(/Quantità da rendere/), '1');
    await utente.click(screen.getByRole('button', { name: 'Proponi' }));

    expect(screen.getByRole('button', { name: 'Concludi reso' })).toBeDisabled();
  });
});
