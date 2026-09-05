import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';

import type {
  CashOperationDetail,
  CashReturnPreview,
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
      refundedMinor: 10_000,
      remainingMinor: 10_000,
    },
  ],
};

const PREVIEW: CashReturnPreview = {
  totalMinor: 10_000,
  netMinor: 8197,
  vatMinor: 1803,
  lines: [
    { originalLineId: 'l1', quantity: 1, netMinor: 8197, vatMinor: 1803, grossMinor: 10_000 },
  ],
  payments: [{ originalPaymentId: 'q1', remainingMinor: 10_000 }],
};

async function montaReso(opzioni?: {
  stato?: CashSessionState;
  createReturn?: ReturnType<typeof vi.fn>;
  previewReturn?: ReturnType<typeof vi.fn>;
}) {
  const api = {
    operation: vi.fn(() => of(OPERAZIONE)),
    current: vi.fn(() => of(opzioni?.stato ?? APERTA)),
    lookupReturn: vi.fn(() => of(VENDITA)),
    previewReturn: opzioni?.previewReturn ?? vi.fn(() => of(PREVIEW)),
    createReturn:
      opzioni?.createReturn ??
      vi.fn(() => of({ documentId: 'r1', reference: 'RS/2026/1', totaleMinor: 10_000 })),
  };
  const vista = await render(CashReturnComponent, {
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { currentUser: () => ({ id: 'u1', tenantId: 't1' }) } },
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
  beforeEach(() => sessionStorage.clear());
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

  it('risposta persa e motivo modificato: recupera lo stesso reso con il contenuto originale', async () => {
    const createReturn = vi
      .fn<CashApiService['createReturn']>()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValue(of({ documentId: 'r1', reference: 'RS/2026/1', totaleMinor: 10_000 }));
    await montaReso({ createReturn });
    const utente = userEvent.setup();
    await utente.clear(screen.getByLabelText(/Quantità da rendere/));
    await utente.type(screen.getByLabelText(/Quantità da rendere/), '1');
    await utente.click(screen.getByRole('button', { name: 'Proponi' }));
    await utente.type(screen.getByLabelText(/Motivo/), 'Motivo originale');
    await utente.click(screen.getByRole('button', { name: 'Concludi reso' }));
    const originale = structuredClone(createReturn.mock.calls[0]![0]);
    await utente.clear(screen.getByLabelText(/Motivo/));
    await utente.type(screen.getByLabelText(/Motivo/), 'Motivo diverso');
    expect(screen.getByRole('button', { name: 'Concludi reso' })).toBeDisabled();
    await utente.click(screen.getByRole('button', { name: "Recupera l'esito" }));
    expect(createReturn.mock.calls[1]![0]).toEqual(originale);
    expect(screen.getByText('Reso registrato')).toBeVisible();
    expect(sessionStorage.length).toBe(0);
  });

  it('mostra e invia il rimborso autorevole, senza ricavarlo dalla proporzione locale', async () => {
    const previewReturn = vi.fn<CashApiService['previewReturn']>().mockReturnValue(
      of({
        ...PREVIEW,
        totalMinor: 1218,
        netMinor: 999,
        vatMinor: 219,
        lines: [
          { originalLineId: 'l1', quantity: 1, netMinor: 999, vatMinor: 219, grossMinor: 1218 },
        ],
        payments: [{ originalPaymentId: 'q1', remainingMinor: 2437 }],
      }),
    );
    const { api } = await montaReso({ previewReturn });
    const utente = userEvent.setup();
    await utente.clear(screen.getByLabelText(/Quantità da rendere/));
    await utente.type(screen.getByLabelText(/Quantità da rendere/), '1');
    await utente.click(screen.getByRole('button', { name: 'Proponi' }));
    expect(screen.getByText(/Rimborso composto: 12,18 € su 12,18 €/)).toBeVisible();
    await utente.type(screen.getByLabelText(/Motivo/), 'Difetto');
    await utente.click(screen.getByRole('button', { name: 'Concludi reso' }));
    expect(api.createReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        refunds: [{ originalPaymentId: 'q1', amountMinor: 1218, confirmed: false }],
      }),
    );
  });

  it('una risposta di anteprima obsoleta non riabilita la registrazione', async () => {
    const first = new Subject<CashReturnPreview>();
    const second = new Subject<CashReturnPreview>();
    const previewReturn = vi
      .fn<CashApiService['previewReturn']>()
      .mockReturnValueOnce(first)
      .mockReturnValue(second);
    const { fixture } = await montaReso({ previewReturn });
    const utente = userEvent.setup();
    const quantity = screen.getByLabelText(/Quantità da rendere/);
    await utente.clear(quantity);
    await utente.type(quantity, '1');
    expect(screen.getByRole('button', { name: 'Proponi' })).toBeDisabled();
    await utente.clear(quantity);
    await utente.type(quantity, '1');
    first.next(PREVIEW);
    fixture.detectChanges();
    expect(screen.getByRole('button', { name: 'Proponi' })).toBeDisabled();
    second.next(PREVIEW);
    fixture.detectChanges();
    expect(screen.getByRole('button', { name: 'Proponi' })).toBeEnabled();
  });
});
