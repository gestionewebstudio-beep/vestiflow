import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ButtonComponent } from './button.component';

describe('ButtonComponent', () => {
  it('proietta il contenuto e il click risale naturalmente al consumer', async () => {
    const onClick = vi.fn();
    await render('<app-button (click)="onClick()">Salva</app-button>', {
      imports: [ButtonComponent],
      componentProperties: { onClick },
    });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Salva' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disabled blocca il click: nessun evento arriva al consumer', async () => {
    const onClick = vi.fn();
    await render('<app-button [disabled]="true" (click)="onClick()">Salva</app-button>', {
      imports: [ButtonComponent],
      componentProperties: { onClick },
    });

    const button = screen.getByRole('button', { name: 'Salva' });
    expect(button).toBeDisabled();
    await userEvent
      .setup()
      .click(button)
      .catch(() => undefined);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading disabilita, segnala aria-busy e annuncia il caricamento allo screen reader', async () => {
    await render('<app-button [loading]="true">Salva</app-button>', {
      imports: [ButtonComponent],
    });

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Caricamento in corso')).toBeInTheDocument();
  });

  it('type="submit" con formId aggancia il bottone a un form esterno', async () => {
    await render('<app-button type="submit" formId="doc-form">Concludi</app-button>', {
      imports: [ButtonComponent],
    });

    const button = screen.getByRole('button', { name: 'Concludi' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('form', 'doc-form');
  });

  it('di default è type="button": non fa submit accidentali dentro un form', async () => {
    await render('<app-button>Annulla</app-button>', { imports: [ButtonComponent] });

    expect(screen.getByRole('button', { name: 'Annulla' })).toHaveAttribute('type', 'button');
  });
});
