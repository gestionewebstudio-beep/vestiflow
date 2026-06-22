import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { generateVariantDrafts } from '../../models/product-form.mapper';
import type { ProductOptionsDraft } from '../../models/product-form.model';
import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from '../../models/product-form.model';
import { ProductVariantsStepComponent } from './product-variants-step.component';

const TWO_SIZE_OPTIONS: ProductOptionsDraft = {
  axes: [
    { name: OPTION_NAME_SIZE, values: ['M', 'L'] },
    { name: OPTION_NAME_COLOR, values: ['Rosso'] },
  ],
};

describe('ProductVariantsStepComponent', () => {
  it('segnala SKU duplicati tra le varianti', async () => {
    const duplicated = generateVariantDrafts(TWO_SIZE_OPTIONS, 'Maglietta').map((variant) => ({
      ...variant,
      sku: 'SKU-DUP',
    }));

    await render(ProductVariantsStepComponent, {
      componentInputs: {
        variants: duplicated,
        takenSkus: [],
      },
    });

    expect((await screen.findAllByText('SKU duplicato tra le varianti.')).length).toBeGreaterThan(
      0,
    );
  });

  it('emette stepValidChange false con SKU non valido', async () => {
    const user = userEvent.setup();
    const onValidChange = vi.fn<(valid: boolean) => void>();
    const variants = generateVariantDrafts(TWO_SIZE_OPTIONS, 'Maglietta').slice(0, 1);

    const { fixture } = await render(ProductVariantsStepComponent, {
      componentInputs: {
        variants,
        takenSkus: [],
      },
    });

    fixture.componentInstance.stepValidChange.subscribe(onValidChange);

    const skuInput = screen.getByLabelText(/SKU per/i);
    await user.clear(skuInput);
    await user.type(skuInput, 'sku invalido!');
    await user.tab();

    expect(onValidChange).toHaveBeenCalledWith(false);
  });
});
