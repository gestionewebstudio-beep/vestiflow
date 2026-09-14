import { render, screen, within } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { formatMoney } from '@core/utils/money.util';

import {
  ChannelOrderRettificheComponent,
  type QuantitaRiga,
  type RettificaCanale,
} from './channel-order-rettifiche.component';

const EUR = (amountMinor: number) => ({ amountMinor, currencyCode: 'EUR' });
/** Il testo reso: Testing Library normalizza lo spazio unificatore di `Intl` in uno spazio. */
const soldi = (amountMinor: number) => formatMoney(EUR(amountMinor)).replace(/\u00a0/g, ' ');

/** L'ordine #1014 del collaudo reale (13/09/2026): 3 ordinati, 1 annullato, 2 spediti. */
const RIMBORSO_1014: RettificaCanale = {
  id: 'r-1',
  kind: 'cancellation',
  occurredAt: '2026-09-13T13:11:58.000Z',
  total: EUR(74995),
  note: 'test',
};
const RIGA_1014: QuantitaRiga = {
  id: 'l-1',
  description: 'The Hidden Snowboard',
  ordered: 3,
  cancelled: 1,
  shipped: 2,
};

/** Somma e totale aggiornato arrivano dalla testata: qui si passano, come fa l'API. */
async function setup(
  refunds: readonly RettificaCanale[],
  lines: readonly QuantitaRiga[] = [],
  originalTotal = EUR(224985),
) {
  const sommaMinor = refunds.reduce((somma, r) => somma + r.total.amountMinor, 0);
  return render(ChannelOrderRettificheComponent, {
    inputs: {
      originalTotal,
      refundTotal: EUR(sommaMinor),
      updatedTotal: EUR(originalTotal.amountMinor - sommaMinor),
      refunds,
      lines,
    },
  });
}

describe('ChannelOrderRettificheComponent — il raccordo economico di un ordine di canale', () => {
  it('⭐ #1014: valore originario, la rettifica alla sua data col segno, totale aggiornato', async () => {
    await setup([RIMBORSO_1014], [RIGA_1014]);

    const totali = screen.getByRole('heading', {
      name: /Valore originario, rettifiche e totale aggiornato/,
    }).parentElement as HTMLElement;
    expect(within(totali).getByText(soldi(224985))).not.toBeNull();
    expect(within(totali).getByText(`− ${soldi(74995)}`)).not.toBeNull();
    expect(within(totali).getByText(soldi(149990))).not.toBeNull();
    // L'etichetta del tipo e la nota del canale.
    expect(within(totali).getByText(/Annullamento/)).not.toBeNull();
    expect(within(totali).getByText('«test»')).not.toBeNull();
  });

  it('per riga: ordinati · annullati · spediti, con gli annullati evidenziati', async () => {
    await setup([RIMBORSO_1014], [RIGA_1014]);

    const righe = screen.getByRole('list', { name: 'Quantità per riga' });
    const quantita = within(righe)
      .getByText(/ordinati 3/)
      .textContent?.replace(/\s+/g, ' ');
    expect(quantita).toContain('ordinati 3');
    expect(quantita).toContain('annullati 1');
    expect(quantita).toContain('spediti 2');
    expect(within(righe).getByText('annullati 1').className).toContain('rettifiche__annullati');
  });

  it('senza rettifiche dice «nessuna» e il totale aggiornato coincide col valore originario', async () => {
    await setup([], [{ ...RIGA_1014, cancelled: 0, shipped: 3 }]);

    expect(screen.getByText('nessuna')).not.toBeNull();
    expect(screen.getAllByText(soldi(224985))).toHaveLength(2);
  });

  it('una riga senza annullati né spediti non compare: non direbbe niente', async () => {
    await setup([], [{ ...RIGA_1014, cancelled: 0, shipped: 0 }]);

    expect(screen.queryByRole('list', { name: 'Quantità per riga' })).toBeNull();
  });

  it('due rettifiche, ciascuna col proprio tipo, e il totale aggiornato della testata', async () => {
    await setup([
      RIMBORSO_1014,
      {
        id: 'r-2',
        kind: 'return_with_restock',
        occurredAt: '2026-09-14T09:00:00.000Z',
        total: EUR(500),
      },
    ]);

    expect(screen.getByText(/Reso/)).not.toBeNull();
    expect(screen.getByText(soldi(224985 - 74995 - 500))).not.toBeNull();
  });
});
