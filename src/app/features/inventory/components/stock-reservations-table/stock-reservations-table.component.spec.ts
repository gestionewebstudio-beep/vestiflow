import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { StockReservationRow } from '@domain/inventory/models/stock-reservation.model';

import { StockReservationsTableComponent } from './stock-reservations-table.component';

/**
 * Gli ordini che impegnano la quantità, sul motore comune (`docs/26` A20):
 * colonne dal catalogo, ordinamento sul valore, riga totali sulla quantità.
 */

function prenotazione(
  id: string,
  orderNumber: string,
  channel: StockReservationRow['channel'],
  quantity: number,
): StockReservationRow {
  return {
    id,
    orderNumber,
    channel,
    quantity,
    sku: 'MAG-M',
    locationName: 'Negozio centro',
    placedAt: '2026-08-10T09:00:00.000Z',
    createdAt: '2026-08-10T09:00:00.000Z',
  };
}

const RIGHE: readonly StockReservationRow[] = [
  prenotazione('r-1', '#1042', 'shopify_online', 2),
  prenotazione('r-2', 'OC-2026-0007', 'manual', 1),
  prenotazione('r-3', '#1050', 'shopify_pos', 5),
];

describe('StockReservationsTableComponent', () => {
  it('rende un ordine per riga, con «Origine» e «Sede» dal catalogo e la somma delle quantità', async () => {
    await render(StockReservationsTableComponent, { inputs: { rows: RIGHE } });

    const tabella = screen.getByRole('table', { name: 'Ordini che impegnano la quantità' });
    expect(within(tabella).getByRole('columnheader', { name: /Origine/ })).toBeVisible();
    expect(within(tabella).getByRole('columnheader', { name: /Sede/ })).toBeVisible();
    expect(tabella.querySelectorAll('tbody tr.data-table__row')).toHaveLength(3);
    expect(within(tabella).getAllByText('Shopify POS').length).toBeGreaterThan(0);

    const totali = tabella.querySelector('tfoot.data-table__totals')!;
    expect(totali.textContent).toContain('3 voci');
    expect(totali.textContent).toContain('8');
  });

  it('ordina sul VALORE della quantità', async () => {
    const user = userEvent.setup();
    await render(StockReservationsTableComponent, { inputs: { rows: RIGHE } });

    await user.click(screen.getByRole('button', { name: 'Ordina per Quantità' }));
    const righe = screen
      .getByRole('table', { name: 'Ordini che impegnano la quantità' })
      .querySelectorAll('tbody tr.data-table__row');
    expect(righe[0]!.textContent).toContain('OC-2026-0007');
    expect(righe[2]!.textContent).toContain('#1050');
  });
});
