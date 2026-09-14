import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { DetailFactsComponent } from './detail-facts.component';

describe('DetailFactsComponent', () => {
  it('rende etichetta e valore; la nota, se c’è, sotto il valore (14/09/2026)', async () => {
    await render(DetailFactsComponent, {
      inputs: {
        facts: [
          { label: 'Registrate', value: '8 su 10 · 2 mancanti' },
          { label: 'Catalogo', value: '55 articoli importati', note: '1 escluso: stesso SKU' },
          { label: 'Ultima verifica', value: '14/09/2026, 14:00', numeric: true },
        ],
      },
    });
    expect(screen.getByText('Registrate')).toBeVisible();
    expect(screen.getByText('8 su 10 · 2 mancanti')).toBeVisible();
    expect(screen.getByText('1 escluso: stesso SKU')).toHaveClass('detail-facts__note');
    // Senza nota, nessun elemento vuoto.
    expect(document.querySelectorAll('.detail-facts__note')).toHaveLength(1);
    expect(screen.getByText('14/09/2026, 14:00').closest('dd')).toHaveClass('tabular-nums');
  });
});
