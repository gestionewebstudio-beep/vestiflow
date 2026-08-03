import { NgTemplateOutlet } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProductKind, ProductStatus } from '@core/models/product.model';
import { InventoryTrackingMode } from '@core/models/product-catalog.model';
import type { VatCode } from '@core/models/vat-code.model';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { SegmentedComponent } from '@shared/components/segmented/segmented.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';

import { ProductGeneralStepComponent } from './product-general-step.component';
import type { ProductGeneralDraft } from '../../models/product-form.model';
import type { ProductListinoSlot } from '../../models/product-listino.model';
import { CatalogCategoryService } from '../../services/catalog-category.service';

const catalogCategoryServiceMock = {} as CatalogCategoryService;

/** Aliquota ordinaria: unico dato che serve alla conversione netto/ivato. */
const VAT_22: VatCode = {
  id: 'vat-22',
  code: '22',
  natureId: 'nature-1',
  nature: {
    id: 'nature-1',
    key: 'ordinary',
    officialCode: null,
    label: 'Ordinaria',
    description: null,
    defaultUsageScope: 'both',
    defaultCalculationMode: 'standard',
    sortOrder: 1,
  },
  ratePercent: 22,
  nonDeductiblePercent: 0,
  description: 'Aliquota ordinaria',
  notes: null,
  usageScope: 'both',
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isDefault: true,
  isActive: true,
  isSystem: false,
  sortOrder: 1,
};

const LISTINO_SLOTS: readonly ProductListinoSlot[] = [
  { position: 1, field: 'listino1Price', label: 'Ingrosso', inputId: 'product-listino-1-price' },
];

const EMPTY_GENERAL: ProductGeneralDraft = {
  articleCode: '',
  name: '',
  description: '',
  brand: '',
  category: '',
  subcategory: '',
  internalNotes: '',
  supplierId: '',
  shopifyTaxonomyCategoryId: '',
  shopifyTaxonomyCategoryFullName: '',
  shopifyCategoryMetafields: [],
  season: '',
  tags: '',
  status: ProductStatus.Draft,
  shopifySyncEnabled: true,
  unitOfMeasure: 'pz',
  defaultVatCodeId: '',
  inventoryTracking: InventoryTrackingMode.Standard,
  managesStock: true,
  kind: ProductKind.Article,
  sellingPrice: 0,
  shopifyPrice: 0,
  compareAtPrice: null,
  purchasePrice: null,
  listino1Price: null,
  listino2Price: null,
  listino3Price: null,
};

/**
 * Render dello step con le sole dipendenze reali che servono ai test (la
 * tassonomia Shopify e la gestione categorie restano fuori: parlano col server).
 */
function renderStep(componentInputs: Record<string, unknown>) {
  return render(ProductGeneralStepComponent, {
    providers: [{ provide: CatalogCategoryService, useValue: catalogCategoryServiceMock }],
    configureTestBed: (testBed) => {
      testBed.overrideComponent(ProductGeneralStepComponent, {
        set: {
          imports: [
            NgTemplateOutlet,
            ReactiveFormsModule,
            SelectMenuComponent,
            SegmentedComponent,
            HoverTooltipComponent,
          ],
        },
      });
    },
    componentInputs,
  });
}

describe('ProductGeneralStepComponent', () => {
  it('mostra errore se il nome prodotto è vuoto', async () => {
    const user = userEvent.setup();

    await renderStep({
      value: EMPTY_GENERAL,
      categories: ['Abbigliamento'],
      shopifyConnected: false,
    });

    await user.click(screen.getByLabelText('Nome prodotto'));
    await user.tab();

    expect(await screen.findByText('Inserisci il nome del prodotto.')).toBeVisible();
  });

  it('propaga le modifiche al parent via valueChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: ProductGeneralDraft) => void>();

    const { fixture } = await renderStep({
      value: EMPTY_GENERAL,
      categories: [],
      shopifyConnected: false,
    });

    fixture.componentInstance.valueChange.subscribe(onChange);

    await user.type(screen.getByLabelText('Nome prodotto'), 'Maglietta');
    await user.type(screen.getByLabelText(/Brand/i), 'Brand X');
    await user.type(screen.getByLabelText(/^Categoria/), 'Top');

    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.name).toBe('Maglietta');
    expect(lastCall?.brand).toBe('Brand X');
    expect(lastCall?.category).toBe('Top');
  });

  describe('sezione Listini', () => {
    it('mostra solo i listini attivi, col nome dato dall azienda', async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
      });

      expect(screen.getByLabelText('Ingrosso')).toBeVisible();
      expect(screen.queryByLabelText('Listino 2')).toBeNull();
      expect(screen.queryByLabelText('Listino 3')).toBeNull();
    });

    it('in modalità ivata i campi mostrano il lordo e il draft resta netto', async () => {
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        // Netti a DB: 100,00 di prezzo articolo e 50,00 di listino.
        value: { ...EMPTY_GENERAL, sellingPrice: 100, listino1Price: 50 },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      expect(screen.getByLabelText('Prezzo articolo')).toHaveValue(122);
      expect(screen.getByLabelText('Ingrosso')).toHaveValue(61);
      // Cambiare come si guardano i prezzi non è una modifica dell'articolo.
      expect(onChange).not.toHaveBeenCalled();
    });

    it('in modalità ivata il prezzo digitato arriva al parent scorporato', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      await user.clear(screen.getByLabelText('Ingrosso'));
      await user.type(screen.getByLabelText('Ingrosso'), '122');

      const lastCall = onChange.mock.calls.at(-1)?.[0];
      expect(lastCall?.listino1Price).toBe(100);
    });

    it('un prezzo ivato torna identico dopo un giro netti → ivati', async () => {
      // Regola di accettazione (§sei decimali): 123,97 al 22% ha un netto che in
      // unità minori NON è intero (10161,4754). Memorizzarlo arrotondato a 10161
      // lo farebbe tornare 123,96: il centesimo si perde qui, non altrove.
      const user = userEvent.setup();
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      const price = screen.getByLabelText('Prezzo articolo');
      await user.clear(price);
      await user.type(price, '123.97');
      expect(onChange.mock.calls.at(-1)?.[0].sellingPrice).toBeCloseTo(101.614754, 6);

      // A schermo il netto resta a due decimali: la coda è del dato, non della vista.
      fixture.componentRef.setInput('pricesIncludeVat', false);
      await fixture.whenStable();
      expect(price).toHaveValue(101.61);

      fixture.componentRef.setInput('pricesIncludeVat', true);
      await fixture.whenStable();
      expect(price).toHaveValue(123.97);
    });

    it('senza aliquota il toggle non compare: non c è nulla da scorporare', async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [],
        tenantDefaultVatCodeId: null,
      });

      expect(screen.queryByLabelText('Modalità dei prezzi in questa sezione')).toBeNull();
    });
  });
});
