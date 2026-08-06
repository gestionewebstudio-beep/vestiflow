import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OptionListEditorComponent } from './option-list-editor.component';

describe('OptionListEditorComponent', () => {
  it('blocca valori vuoti e duplicati', async () => {
    const user = userEvent.setup();

    await render(OptionListEditorComponent, {
      componentInputs: {
        label: 'Taglie',
        values: ['M'],
        placeholder: 'Aggiungi taglia',
      },
    });

    await user.click(screen.getByRole('button', { name: 'Aggiungi' }));
    expect(await screen.findByText('Inserisci un valore.')).toBeVisible();

    const input = screen.getByLabelText('Taglie');
    await user.type(input, 'm');
    await user.click(screen.getByRole('button', { name: 'Aggiungi' }));
    expect(await screen.findByText("Valore gia' presente.")).toBeVisible();
  });

  it('emette valuesChange quando aggiunge un valore valido', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(values: readonly string[]) => void>();

    const { fixture } = await render(OptionListEditorComponent, {
      componentInputs: {
        label: 'Colori',
        values: [],
        placeholder: 'Aggiungi colore',
      },
    });

    fixture.componentInstance.valuesChange.subscribe(onChange);

    await user.type(screen.getByLabelText('Colori'), 'Rosso');
    await user.click(screen.getByRole('button', { name: 'Aggiungi' }));

    expect(onChange).toHaveBeenCalledWith(['Rosso']);
  });
});
