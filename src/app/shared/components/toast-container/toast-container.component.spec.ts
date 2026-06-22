import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ToastService } from '@core/services/toast.service';
import { ToastContainerComponent } from './toast-container.component';

describe('ToastContainerComponent', () => {
  it('mostra e consente di chiudere un toast di errore', async () => {
    const user = userEvent.setup();

    await render(ToastContainerComponent);
    const toastService = TestBed.inject(ToastService);

    toastService.showError('Operazione non riuscita');

    expect(await screen.findByText('Operazione non riuscita')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Chiudi notifica' }));

    expect(screen.queryByText('Operazione non riuscita')).not.toBeInTheDocument();
  });
});
