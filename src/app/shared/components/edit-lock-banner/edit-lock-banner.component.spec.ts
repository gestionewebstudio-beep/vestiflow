import { render, screen } from '@testing-library/angular';
import { describe, expect, it, vi } from 'vitest';

import { EditLockBannerComponent } from './edit-lock-banner.component';

describe('EditLockBannerComponent', () => {
  it('mostra il messaggio di documento protetto e il pulsante di sblocco', async () => {
    await render(EditLockBannerComponent);

    expect(screen.getByText(/Documento protetto da modifica/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sblocca modifica' })).toBeVisible();
  });

  it('emette unlock una sola volta al click sul pulsante', async () => {
    const unlock = vi.fn();
    await render(EditLockBannerComponent, { on: { unlock } });

    screen.getByRole('button', { name: 'Sblocca modifica' }).click();

    expect(unlock).toHaveBeenCalledTimes(1);
  });
});
