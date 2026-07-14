import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { generateVariantDrafts } from '../../models/product-form.mapper';
import type { ProductOptionsDraft } from '../../models/product-form.model';
import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from '../../models/product-form.model';
import { ProductService } from '../../services/product.service';
import { ProductVariantsStepComponent } from './product-variants-step.component';

const TWO_SIZE_OPTIONS: ProductOptionsDraft = {
  axes: [
    { name: OPTION_NAME_SIZE, values: ['M', 'L'] },
    { name: OPTION_NAME_COLOR, values: ['Rosso'] },
  ],
};

function createProductServiceMock() {
  return { generateSku: vi.fn() };
}

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
        takenBarcodes: [],
      },
      providers: [{ provide: ProductService, useValue: createProductServiceMock() }],
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
        takenBarcodes: [],
      },
      providers: [{ provide: ProductService, useValue: createProductServiceMock() }],
    });

    fixture.componentInstance.stepValidChange.subscribe(onValidChange);

    const skuInput = screen.getByLabelText(/SKU per/i);
    await user.clear(skuInput);
    await user.type(skuInput, 'sku invalido!');
    await user.tab();

    expect(onValidChange).toHaveBeenCalledWith(false);
  });

  it('SKU vuoto e valido: la variante resta valida senza codice (specifica cliente)', async () => {
    const user = userEvent.setup();
    const onValidChange = vi.fn<(valid: boolean) => void>();
    const variants = generateVariantDrafts(TWO_SIZE_OPTIONS, 'Maglietta')
      .slice(0, 1)
      .map((variant) => ({ ...variant, sku: '', sellingPrice: 19.9 }));

    const { fixture } = await render(ProductVariantsStepComponent, {
      componentInputs: {
        variants,
        takenSkus: [],
        takenBarcodes: [],
      },
      providers: [{ provide: ProductService, useValue: createProductServiceMock() }],
    });

    fixture.componentInstance.stepValidChange.subscribe(onValidChange);

    const skuInput = screen.getByLabelText(/SKU per/i);
    await user.click(skuInput);
    await user.tab();

    expect(onValidChange).not.toHaveBeenCalledWith(false);
  });

  it('"Genera SKU" chiama il servizio con nome/categoria/attributi e propone il codice', async () => {
    const user = userEvent.setup();
    const productService = createProductServiceMock();
    productService.generateSku.mockReturnValue(of({ sku: 'MAG-BASIC-NER-S' }));
    const variants = generateVariantDrafts(TWO_SIZE_OPTIONS, 'Maglietta')
      .slice(0, 1)
      .map((variant) => ({ ...variant, sku: '' }));

    await render(ProductVariantsStepComponent, {
      componentInputs: {
        variants,
        productName: 'Maglia girocollo Basic',
        category: 'Maglie',
        takenSkus: [],
        takenBarcodes: [],
      },
      providers: [{ provide: ProductService, useValue: productService }],
    });

    await user.click(screen.getByRole('button', { name: /Genera SKU/i }));

    expect(productService.generateSku).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: 'Maglia girocollo Basic',
        category: 'Maglie',
      }),
    );
    expect(await screen.findByDisplayValue('MAG-BASIC-NER-S')).toBeTruthy();
  });
});
