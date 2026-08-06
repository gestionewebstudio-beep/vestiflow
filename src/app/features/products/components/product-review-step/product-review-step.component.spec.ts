import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';

import { ProductKind, ProductStatus } from '@core/models/product.model';
import { InventoryTrackingMode } from '@core/models/product-catalog.model';

import { ProductReviewStepComponent } from './product-review-step.component';
import type {
  ProductGeneralDraft,
  ProductOptionsDraft,
} from '@domain/products/models/product-form.model';
import { OPTION_NAME_COLOR, OPTION_NAME_SIZE } from '@domain/products/models/product-form.model';
import { generateVariantDrafts } from '@domain/products/models/product-form.mapper';

const GENERAL: ProductGeneralDraft = {
  articleCode: '00042',
  name: 'Giacca invernale',
  description: 'Descrizione breve',
  brand: 'North Brand',
  category: 'Outerwear',
  subcategory: 'Piumini',
  internalNotes: '',
  supplierId: '',
  shopifyTaxonomyCategoryId: '',
  shopifyTaxonomyCategoryFullName: '',
  shopifyCategoryMetafields: [],
  season: 'FW26',
  tags: 'premium',
  status: ProductStatus.Draft,
  shopifySyncEnabled: true,
  unitOfMeasure: 'pz',
  defaultVatCodeId: '',
  inventoryTracking: InventoryTrackingMode.Standard,
  managesStock: true,
  kind: ProductKind.Article,
  sellingPrice: 129.9,
  shopifyPrice: 129.9,
  compareAtPrice: null,
  purchasePrice: null,
  listino1Price: null,
  listino2Price: null,
  listino3Price: null,
};

const OPTIONS: ProductOptionsDraft = {
  axes: [
    { name: OPTION_NAME_SIZE, values: ['M'] },
    { name: OPTION_NAME_COLOR, values: ['Nero'] },
  ],
};

const VARIANTS = generateVariantDrafts(OPTIONS, GENERAL.name).map((variant) => ({
  ...variant,
  sellingPrice: 129.9,
}));

describe('ProductReviewStepComponent', () => {
  it('mostra il riepilogo dei dati generali e delle varianti', async () => {
    await render(ProductReviewStepComponent, {
      componentInputs: {
        general: GENERAL,
        options: OPTIONS,
        variants: VARIANTS,
      },
    });

    expect(screen.getByText('Giacca invernale')).toBeVisible();
    expect(screen.getByText('North Brand')).toBeVisible();
    expect(screen.getByText('Outerwear')).toBeVisible();
    expect(screen.getByText('(1)')).toBeVisible();
    expect(screen.getAllByText('M').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nero').length).toBeGreaterThan(0);
  });
});
