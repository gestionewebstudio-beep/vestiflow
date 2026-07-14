import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import type { VariantDraft } from '../../models/product-form.model';
import { ProductService } from '../../services/product.service';
import { ProductQuickVariantFieldsComponent } from './product-quick-variant-fields.component';

const emptyVariant: VariantDraft = {
  key: '',
  optionValues: [],
  sku: '',
  sellingPrice: 0,
  purchasePrice: null,
  compareAtPrice: null,
  barcode: '',
  included: true,
};

function createProductServiceMock() {
  return { generateSku: vi.fn() };
}

describe('ProductQuickVariantFieldsComponent', () => {
  it('valida come corretto uno SKU vuoto (facoltativo alla creazione)', async () => {
    const onValidChange = vi.fn<(valid: boolean) => void>();

    const { fixture } = await render(ProductQuickVariantFieldsComponent, {
      componentInputs: { variant: emptyVariant, productName: 'Maglietta' },
      providers: [{ provide: ProductService, useValue: createProductServiceMock() }],
    });
    fixture.componentInstance.validChange.subscribe(onValidChange);
    fixture.detectChanges();

    expect(onValidChange).not.toHaveBeenCalledWith(false);
  });

  it('"Genera SKU" chiama il servizio e propone il codice nel campo', async () => {
    const user = userEvent.setup();
    const productService = createProductServiceMock();
    productService.generateSku.mockReturnValue(of({ sku: 'MAG-BASIC-00125' }));

    await render(ProductQuickVariantFieldsComponent, {
      componentInputs: {
        variant: emptyVariant,
        productName: 'Maglia girocollo Basic',
        category: 'Maglie',
      },
      providers: [{ provide: ProductService, useValue: productService }],
    });

    await user.click(screen.getByRole('button', { name: 'Genera SKU' }));

    expect(productService.generateSku).toHaveBeenCalledWith({
      productName: 'Maglia girocollo Basic',
      category: 'Maglie',
    });
    expect(await screen.findByDisplayValue('MAG-BASIC-00125')).toBeTruthy();
  });

  it('"Genera SKU" mostra un messaggio chiaro se la richiesta fallisce', async () => {
    const user = userEvent.setup();
    const productService = createProductServiceMock();
    productService.generateSku.mockReturnValue(throwError(() => new Error('network')));

    await render(ProductQuickVariantFieldsComponent, {
      componentInputs: { variant: emptyVariant, productName: 'Maglietta' },
      providers: [{ provide: ProductService, useValue: productService }],
    });

    await user.click(screen.getByRole('button', { name: 'Genera SKU' }));

    expect(
      await screen.findByText('Impossibile generare lo SKU: riprova o inseriscilo a mano.'),
    ).toBeTruthy();
  });
});
