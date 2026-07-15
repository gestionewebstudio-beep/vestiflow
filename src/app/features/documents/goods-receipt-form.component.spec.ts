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

const NON_STOCK_SUMMARY = {
  variantId: 'var-nostock',
  productId: 'prod-nostock',
  sku: 'SRV-1',
  productName: 'Servizio sartoria',
  title: 'Servizio sartoria',
  barcode: undefined,
  sellingPrice: { amountMinor: 1500, currencyCode: 'EUR' },
  stockOnHand: null,
  managesStock: false,
} as const;

describe('GoodsReceiptFormComponent', () => {
  async function setup(options?: {
    readonly writeLocations?: readonly { id: string; name: string }[];
    readonly defaultLocation?: { id: string; name: string } | null;
    readonly variantSummaries?: readonly (typeof NON_STOCK_SUMMARY)[];
  }) {
    return render(GoodsReceiptFormComponent, {
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
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        { provide: SupplierService, useValue: { getSuppliers: () => of([]) } },
        { provide: SupplierOrderService, useValue: {} },
        { provide: ProductLabelPrintService, useValue: {} },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: () => of(options?.variantSummaries ?? []),
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

  // Punto E: la causale non è più esposta nel form (generata in silenzio).
  it('non mostra il campo Causale di carico né il comando Rigenera', async () => {
    await setup();

    expect(screen.queryByText('Causale di carico')).toBeNull();
    expect(screen.queryByRole('button', { name: /Rigenera/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Gestione causali/ })).toBeNull();
  });

  // Creazione implicita (punto A): il nome digitato basta — la riga
  // serializza `newProduct` nel payload del salvataggio.
  it('serializza newProduct al salvataggio col solo nome digitato', async () => {
    const { fixture } = await setup();
    const component = fixture.componentInstance;

    const line = component['lines'].at(0);
    line.controls.productName.setValue('Cintura pelle', { emitEvent: false });
    line.controls.quantity.setValue(2, { emitEvent: false });
    line.controls.unitCost.setValue('9,90', { emitEvent: false });

    const body = component['buildSaveGoodsReceiptBody']();
    expect(body.lines).toHaveLength(1);
    expect(body.lines?.[0]?.newProduct).toEqual(
      expect.objectContaining({ name: 'Cintura pelle', purchasePriceMinor: 990 }),
    );
    expect(body.lines?.[0]?.loadsStock).toBe(true);
  });

  // Dropdown essenziale: solo i suggerimenti dal catalogo (o il messaggio
  // vuoto) — nessuna azione "Crea", nessuna scheda completa, nessun badge.
  it('dropdown senza risultati: solo il messaggio, nessuna azione extra', async () => {
    const user = userEvent.setup();
    await setup();

    const input = screen.getAllByLabelText('Nome prodotto')[0];
    await user.type(input!, 'maglia');

    expect(
      (await screen.findAllByText('Nessun articolo trovato a catalogo.')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Crea/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apri scheda completa…' })).toBeNull();
    expect(screen.queryByText('Nuovo articolo al salvataggio')).toBeNull();
  });

  // Punto B: variante di prodotto non gestito a magazzino → "Mag." spenta e bloccata.
  it('selezione variante non-stock: carico magazzino disattivato e bloccato', async () => {
    const { fixture } = await setup({ variantSummaries: [NON_STOCK_SUMMARY] });
    const component = fixture.componentInstance;

    component['onVariantSelect'](0, 'var-nostock');
    // Le summary arrivano in modo asincrono (pinnedVariants): attende il sync.
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    const line = component['lines'].at(0);
    expect(line.controls.loadsStock.value).toBe(false);
    expect(line.controls.loadsStock.disabled).toBe(true);
  });
});
