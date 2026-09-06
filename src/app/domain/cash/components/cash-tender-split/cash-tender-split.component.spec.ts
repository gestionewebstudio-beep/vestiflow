import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PaymentOption } from '@core/models/payment-option.model';

import { CashTenderSplitComponent, type CashQuotaDraft } from './cash-tender-split.component';

/**
 * ⛔ **Ciò che queste prove falsificano**:
 *
 * ```text
 *   un Tipo non classificato si usa      NO: non compare, e si dice perche`
 *   il resto lo indovina la schermata    e` un_ANTEPRIMA sul solo contante
 *   il residuo non si vede               si vede, e cambia con le quote
 * ```
 */

function tipo(
  id: string,
  name: string,
  tenderKind: PaymentOption['tenderKind'],
): PaymentOption {
  return {
    id,
    name,
    kind: 'method',
    isActive: true,
    sortOrder: 1,
    tenderKind,
  } as PaymentOption;
}

const CONTANTI = tipo('c1', 'Contanti', 'cash');
const CARTA = tipo('e1', 'Carta', 'electronic');
const SENZA_CLASSE = tipo('x1', 'Assegno', null);

describe('CashTenderSplitComponent', () => {
  it('mostra il totale e quanto resta da incassare', async () => {
    await render(CashTenderSplitComponent, {
      inputs: { options: [CONTANTI], totalMinor: 10_000, quotas: [] },
    });

    expect(screen.getByText('Da incassare')).toBeVisible();
    expect(screen.getAllByText('100,00 €').length).toBeGreaterThan(0);
  });

  it('un Tipo NON classificato non si può usare, e si dice perché', async () => {
    await render(CashTenderSplitComponent, {
      inputs: { options: [CONTANTI, SENZA_CLASSE], totalMinor: 5_000, quotas: [] },
    });

    // ⭐ Il bottone per usarlo non c'è…
    expect(screen.queryByRole('button', { name: 'Assegno' })).toBeNull();
    // …ma il motivo sì: sparire in silenzio farebbe cercare un guasto.
    expect(screen.getByText(/Non utilizzabili in cassa/)).toBeVisible();
    expect(screen.getByText(/Assegno/)).toBeVisible();
  });

  it('aggiungere una quota propone il RESIDUO', async () => {
    const quotasChange = vi.fn();
    await render(CashTenderSplitComponent, {
      inputs: { options: [CONTANTI], totalMinor: 7_500, quotas: [] },
      on: { quotasChange },
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Contanti' }));

    expect(quotasChange).toHaveBeenCalledWith([
      { paymentOptionId: 'c1', amountMinor: 7_500, tenderedMinor: null, confirmed: false },
    ]);
  });

  it('il RESTO è un_anteprima sul solo contante', async () => {
    const quote: CashQuotaDraft[] = [
      { paymentOptionId: 'c1', amountMinor: 6_000, tenderedMinor: 10_000, confirmed: false },
      { paymentOptionId: 'e1', amountMinor: 4_000, tenderedMinor: null, confirmed: true },
    ];
    await render(CashTenderSplitComponent, {
      inputs: { options: [CONTANTI, CARTA], totalMinor: 10_000, quotas: quote },
    });

    // 100,00 ricevuti su 60,00 di quota contanti → 40,00 di resto.
    expect(screen.getByText('Resto')).toBeVisible();
    expect(screen.getByText('40,00 €')).toBeVisible();
  });

  it('la quota elettronica chiede la conferma sul terminale', async () => {
    await render(CashTenderSplitComponent, {
      inputs: {
        options: [CARTA],
        totalMinor: 4_000,
        quotas: [
          { paymentOptionId: 'e1', amountMinor: 4_000, tenderedMinor: null, confirmed: false },
        ],
      },
    });

    // ⛔ VestiFlow non parla col POS: la conferma è dell'operatore.
    expect(screen.getByText('Esito confermato sul terminale')).toBeVisible();
  });

  it('la quota contante NON chiede nessuna conferma di terminale', async () => {
    await render(CashTenderSplitComponent, {
      inputs: {
        options: [CONTANTI],
        totalMinor: 4_000,
        quotas: [
          { paymentOptionId: 'c1', amountMinor: 4_000, tenderedMinor: null, confirmed: false },
        ],
      },
    });

    expect(screen.queryByText('Esito confermato sul terminale')).toBeNull();
    expect(screen.getByText('Ricevuto')).toBeVisible();
  });
});
