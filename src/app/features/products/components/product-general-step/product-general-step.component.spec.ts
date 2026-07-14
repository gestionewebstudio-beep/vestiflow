import { NgTemplateOutlet } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProductStatus } from '@core/models/product.model';
import { InventoryTrackingMode } from '@core/models/product-catalog.model';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';

import { ProductGeneralStepComponent } from './product-general-step.component';
import type { ProductGeneralDraft } from '../../models/product-form.model';

const EMPTY_GENERAL: ProductGeneralDraft = {
  name: '',
  description: '',
  brand: '',
  category: '',
  shopifyTaxonomyCategoryId: '',
  shopifyTaxonomyCategoryFullName: '',
  shopifyCategoryMetafields: [],
  season: '',
  tags: '',
  status: ProductStatus.Draft,
  unitOfMeasure: 'pz',
  defaultVatCodeId: '',
  inventoryTracking: InventoryTrackingMode.Standard,
  managesStock: true,
};

describe('ProductGeneralStepComponent', () => {
  it('mostra errore se il nome prodotto è vuoto', async () => {
    const user = userEvent.setup();

    await render(ProductGeneralStepComponent, {
      configureTestBed: (testBed) => {
        testBed.overrideComponent(ProductGeneralStepComponent, {
          set: { imports: [NgTemplateOutlet, ReactiveFormsModule, SelectMenuComponent] },
        });
      },
      componentInputs: {
        value: EMPTY_GENERAL,
        categories: ['Abbigliamento'],
        shopifyConnected: false,
      },
    });

    await user.click(screen.getByLabelText('Nome prodotto'));
    await user.tab();

    expect(await screen.findByText('Inserisci il nome del prodotto.')).toBeVisible();
  });

  it('propaga le modifiche al parent via valueChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: ProductGeneralDraft) => void>();

    const { fixture } = await render(ProductGeneralStepComponent, {
      configureTestBed: (testBed) => {
        testBed.overrideComponent(ProductGeneralStepComponent, {
          set: { imports: [NgTemplateOutlet, ReactiveFormsModule, SelectMenuComponent] },
        });
      },
      componentInputs: {
        value: EMPTY_GENERAL,
        categories: [],
        shopifyConnected: false,
      },
    });

    fixture.componentInstance.valueChange.subscribe(onChange);

    await user.type(screen.getByLabelText('Nome prodotto'), 'Maglietta');
    await user.type(screen.getByLabelText(/Brand/i), 'Brand X');
    await user.type(screen.getByLabelText(/Categoria/i), 'Top');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.name).toBe('Maglietta');
    expect(lastCall?.brand).toBe('Brand X');
    expect(lastCall?.category).toBe('Top');
  });
});
