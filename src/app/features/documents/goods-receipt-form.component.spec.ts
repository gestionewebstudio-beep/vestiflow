import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { OperationalLocationsService } from '@core/services/operational-locations.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ProductService } from '@features/products/services/product.service';
import { ProductLabelPrintService } from '@features/products/services/product-label-print.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';
import { SupplierOrderService } from '@features/orders/services/supplier-order.service';
import { TenantFeatureSettingsService } from '@features/settings/services/tenant-feature-settings.service';
import { TableViewPreferenceApiService } from '@shared/table-columns/table-view-preference-api.service';

import { GoodsReceiptFormComponent } from './goods-receipt-form.component';
import { DocumentService } from './services/document.service';
import { ExternalDocumentTypeService } from './services/external-document-type.service';
import { GoodsReceiptCausalService } from './services/goods-receipt-causal.service';

const MILANO = { id: 'loc-1', name: 'Milano' };
const ROMA = { id: 'loc-2', name: 'Roma' };
const LOCATIONS = [MILANO, ROMA];

function operationalLocationsMock(options?: {
  readonly writeLocations?: readonly { id: string; name: string }[];
  readonly defaultLocation?: { id: string; name: string } | null;
}) {
  const writeLocations = options?.writeLocations ?? LOCATIONS;
  const defaultLocation = options?.defaultLocation ?? null;
  const suggested = defaultLocation ?? (writeLocations.length === 1 ? writeLocations[0] : null);
  return {
    locations: () => writeLocations,
    writeLocations: () => writeLocations,
    actionLocations: () => writeLocations,
    transferTargetLocations: () => writeLocations,
    defaultLocation: () => defaultLocation,
    suggestedWriteLocation: () => suggested,
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

describe('GoodsReceiptFormComponent', () => {
  async function setup(options?: {
    readonly writeLocations?: readonly { id: string; name: string }[];
    readonly defaultLocation?: { id: string; name: string } | null;
  }) {
    await render(GoodsReceiptFormComponent, {
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
          },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock(options) },
        { provide: AuthService, useValue: { currentUser: () => null } },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            previewDocumentNumber: () => of({ reference: 'AM-2026-0001' }),
            saveGoodsReceipt: vi.fn(),
          },
        },
        { provide: GoodsReceiptCausalService, useValue: { list: () => of([]) } },
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        { provide: SupplierService, useValue: { getSuppliers: () => of([]) } },
        { provide: SupplierOrderService, useValue: {} },
        { provide: ProductLabelPrintService, useValue: {} },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: () => of([]),
            getSupplierVariantLinks: () => of([]),
          },
        },
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
        {
          provide: TableViewPreferenceApiService,
          useValue: { load: () => of(null), save: () => of(undefined) },
        },
      ],
    });
  }

  // Specifica «sede predefinita»: nessuna autoselezione della location in
  // creazione — il campo parte vuoto anche se esiste una predefinita.
  it('non autoseleziona la location e mostra il suggerimento cliccabile', async () => {
    const user = userEvent.setup();
    await setup({ defaultLocation: MILANO });

    const locationTrigger = screen.getByRole('button', { name: 'Location di destinazione' });
    expect(locationTrigger).toHaveTextContent('Seleziona location…');

    // Hint "Suggerita: Milano": cliccandolo la sede viene impostata.
    const hint = screen.getByRole('button', { name: 'Usa la sede suggerita Milano' });
    await user.click(hint);
    expect(locationTrigger).toHaveTextContent('Milano (predefinita)');
  });

  // Eccezione mono-location: anche con UNA sola sede autorizzata il campo
  // resta da confermare esplicitamente (suggerimento visibile, nessun valore).
  it('mono-location: non preseleziona e propone comunque il suggerimento', async () => {
    await setup({ writeLocations: [MILANO], defaultLocation: null });

    expect(screen.getByRole('button', { name: 'Location di destinazione' })).toHaveTextContent(
      'Seleziona location…',
    );
    expect(screen.getByRole('button', { name: 'Usa la sede suggerita Milano' })).toBeVisible();
  });

  // La predefinita compare PRIMA nelle opzioni, etichettata "(predefinita)".
  it('ordina la predefinita per prima nelle opzioni con etichetta dedicata', async () => {
    const user = userEvent.setup();
    await setup({ defaultLocation: ROMA });

    await user.click(screen.getByRole('button', { name: 'Location di destinazione' }));
    const options = screen.getAllByRole('option');
    const labels = options.map((option) => option.textContent?.trim());
    const romaIndex = labels.findIndex((label) => label?.includes('Roma (predefinita)'));
    const milanoIndex = labels.findIndex((label) => label === 'Milano');
    expect(romaIndex).toBeGreaterThanOrEqual(0);
    expect(milanoIndex).toBeGreaterThan(romaIndex);
  });
});
