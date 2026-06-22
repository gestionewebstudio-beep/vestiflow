import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProductOptionsStepComponent } from './product-options-step.component';
import type { ProductOptionsDraft } from '../../models/product-form.model';
import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from '../../models/product-form.model';

const EMPTY_OPTIONS: ProductOptionsDraft = {
  axes: [
    { name: OPTION_NAME_SIZE, values: [] },
    { name: OPTION_NAME_COLOR, values: [] },
  ],
};

describe('ProductOptionsStepComponent', () => {
  it('emette nuove taglie quando l utente aggiunge un valore', async () => {
    const user = userEvent.setup();
    const onOptionsChange = vi.fn<(value: ProductOptionsDraft) => void>();

    const { fixture } = await render(ProductOptionsStepComponent, {
      componentInputs: {
        options: EMPTY_OPTIONS,
        variants: [],
        shopifyConnected: false,
      },
    });

    fixture.componentInstance.optionsChange.subscribe(onOptionsChange);

    const sizeInput = screen.getByLabelText('Taglie');
    await user.type(sizeInput, 'M');
    await user.click(screen.getAllByRole('button', { name: 'Aggiungi' })[0]!);

    expect(onOptionsChange).toHaveBeenCalled();
    const last = onOptionsChange.mock.calls.at(-1)?.[0];
    const sizeAxis = last?.axes.find((axis) => axis.name === OPTION_NAME_SIZE);
    expect(sizeAxis?.values).toContain('M');
  });

  it('consente di aggiungere un terzo asse opzionale', async () => {
    const user = userEvent.setup();
    let currentOptions = EMPTY_OPTIONS;

    const { fixture } = await render(ProductOptionsStepComponent, {
      componentInputs: {
        options: currentOptions,
        variants: [],
        shopifyConnected: false,
      },
    });

    fixture.componentInstance.optionsChange.subscribe((next) => {
      currentOptions = next;
      fixture.componentRef.setInput('options', next);
      fixture.detectChanges();
    });

    await user.click(screen.getByRole('button', { name: '+ Aggiungi opzione' }));

    expect(screen.getByLabelText('Nome opzione')).toBeVisible();
    expect(currentOptions.axes).toHaveLength(3);
  });
});
