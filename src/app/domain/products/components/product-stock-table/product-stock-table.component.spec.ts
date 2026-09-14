import { render, screen, within } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { VariantSummary } from '../../models/variant-summary.model';
import { ProductStockTableComponent } from './product-stock-table.component';

/**
 * Le giacenze per variante nella scheda articolo, sul motore comune
 * (`docs/26` A26): colonne dal catalogo, ordinamento sul valore, riga totali.
 */

function variante(
  variantId: string,
  sku: string,
  title: string,
  onHand: number | null,
  available: number | null,
): VariantSummary {
  return {
    variantId,
    productId: 'p-1',
    sku,
    articleCode: '00042',
    productName: 'Maglia in cotone',
    title,
    variantLabel: title.split(' — ')[1] ?? '',
    sellingPrice: { amountMinor: 2_500, currencyCode: 'EUR' },
    stockOnHand: onHand,
    stockAvailable: available,
  };
}

const RIGHE: readonly VariantSummary[] = [
  variante('v-m', 'MAG-M', 'Maglia in cotone — M', 10, 7),
  variante('v-l', 'MAG-L', 'Maglia in cotone — L', 2, 2),
  variante('v-s', 'MAG-S', 'Maglia in cotone — S', null, null),
];

describe('ProductStockTableComponent', () => {
  it('rende una riga per variante, con le parole del catalogo e i totali', async () => {
    await render(ProductStockTableComponent, { inputs: { rows: RIGHE } });

    const tabella = screen.getByRole('table', { name: 'Giacenze per variante' });
    expect(within(tabella).getByRole('columnheader', { name: /Giacenza/ })).toBeVisible();
    expect(within(tabella).getByRole('columnheader', { name: /Impegnata/ })).toBeVisible();
    expect(within(tabella).getByRole('columnheader', { name: /Disponibile/ })).toBeVisible();
    expect(tabella.querySelectorAll('tbody tr.data-table__row')).toHaveLength(3);

    // L'impegnata è giacenza − disponibile: 3 sulla M, 0 sulle altre.
    const rigaM = tabella.querySelector('tbody tr.data-table__row')!;
    expect(rigaM.textContent).toContain('MAG-M');
    expect(rigaM.textContent).toContain('3');

    // La riga totali somma le tre quantità: 12 · 3 · 9, con «3 voci».
    const totali = tabella.querySelector('tfoot.data-table__totals')!;
    expect(totali.textContent).toContain('3 voci');
    expect(totali.textContent).toContain('12');
    expect(totali.textContent).toContain('9');
  });

  it('ordina sul VALORE della giacenza: la variante senza giacenza (0) apre il crescente', async () => {
    const user = userEvent.setup();
    await render(ProductStockTableComponent, { inputs: { rows: RIGHE } });

    await user.click(screen.getByRole('button', { name: 'Ordina per Giacenza' }));
    const righe = screen
      .getByRole('table', { name: 'Giacenze per variante' })
      .querySelectorAll('tbody tr.data-table__row');
    expect(righe[0]!.textContent).toContain('MAG-S');
    expect(righe[2]!.textContent).toContain('MAG-M');
  });
});
