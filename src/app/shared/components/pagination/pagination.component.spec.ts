import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PageMeta } from '@core/models/api.model';

import { PaginationComponent } from './pagination.component';

const meta = (partial: Partial<PageMeta> = {}): PageMeta => ({
  page: 1,
  pageSize: 25,
  total: 100,
  totalPages: 4,
  ...partial,
});

const SIZES = [10, 25, 50] as const;

describe('PaginationComponent', () => {
  it('mostra il range degli elementi e la pagina corrente', async () => {
    await render(PaginationComponent, {
      inputs: { meta: meta({ page: 2 }), pageSizeOptions: SIZES },
    });

    expect(screen.getByText('26–50 di 100')).toBeVisible();
    // Il contatore pagina è presente ma può essere nascosto via CSS a certe
    // larghezze: qui interessa il contenuto, non il breakpoint.
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('su lista vuota il range parte da zero, senza indici fantasma', async () => {
    await render(PaginationComponent, {
      inputs: { meta: meta({ total: 0, totalPages: 0 }), pageSizeOptions: SIZES },
    });

    expect(screen.getByText('0–0 di 0')).toBeVisible();
  });

  it('in prima pagina "precedente" è disabilitato e "successiva" emette page+1', async () => {
    const pageChange = vi.fn();
    await render(PaginationComponent, {
      inputs: { meta: meta(), pageSizeOptions: SIZES },
      on: { pageChange },
    });

    expect(screen.getByRole('button', { name: 'Pagina precedente' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pagina successiva' }));

    expect(pageChange).toHaveBeenCalledWith(2);
  });

  it("in ultima pagina 'successiva' è disabilitato", async () => {
    await render(PaginationComponent, {
      inputs: { meta: meta({ page: 4 }), pageSizeOptions: SIZES },
    });

    expect(screen.getByRole('button', { name: 'Pagina successiva' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pagina precedente' })).toBeEnabled();
  });

  it('il click su una pill numerata emette quella pagina', async () => {
    const pageChange = vi.fn();
    await render(PaginationComponent, {
      inputs: { meta: meta(), pageSizeOptions: SIZES },
      on: { pageChange },
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Pagina 3' }));

    expect(pageChange).toHaveBeenCalledWith(3);
  });

  it('con tante pagine mostra prima, ultima e finestra attorno alla corrente, con ellissi', async () => {
    await render(PaginationComponent, {
      inputs: {
        meta: meta({ page: 10, total: 1300, totalPages: 52 }),
        pageSizeOptions: SIZES,
      },
    });

    for (const p of [1, 8, 9, 10, 11, 12, 52]) {
      expect(screen.getByRole('button', { name: `Pagina ${p}` })).toBeVisible();
    }
    expect(screen.queryByRole('button', { name: 'Pagina 2' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pagina 13' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pagina 10' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('con una sola pagina niente pill: non c’è nulla da navigare', async () => {
    await render(PaginationComponent, {
      inputs: { meta: meta({ total: 5, totalPages: 1 }), pageSizeOptions: SIZES },
    });

    expect(screen.queryByRole('button', { name: 'Pagina 1' })).toBeNull();
  });
});
