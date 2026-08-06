import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmptyStateComponent } from './empty-state.component';

describe('EmptyStateComponent', () => {
  it('mostra titolo e descrizione: mai un "Nessun dato" nudo', async () => {
    await render(EmptyStateComponent, {
      inputs: {
        title: 'Nessun prodotto',
        description: 'Aggiungi il primo prodotto per iniziare.',
      },
    });

    expect(screen.getByText('Nessun prodotto')).toBeVisible();
    expect(screen.getByText('Aggiungi il primo prodotto per iniziare.')).toBeVisible();
  });

  it('senza ctaLabel non mostra alcun bottone', async () => {
    await render(EmptyStateComponent, { inputs: { title: 'Nessun movimento' } });

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('con ctaLabel mostra la CTA e il click notifica il chiamante', async () => {
    const ctaClick = vi.fn();
    await render(EmptyStateComponent, {
      inputs: { title: 'Nessun prodotto', ctaLabel: 'Aggiungi prodotto' },
      on: { ctaClick },
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Aggiungi prodotto' }));

    expect(ctaClick).toHaveBeenCalledTimes(1);
  });

  it("l'icona è decorativa: nascosta allo screen reader", async () => {
    const { container } = await render(EmptyStateComponent, {
      inputs: { title: 'Nessun risultato', icon: 'pi-search' },
    });

    const icon = container.querySelector('[aria-hidden="true"]');
    expect(icon).not.toBeNull();
  });
});
