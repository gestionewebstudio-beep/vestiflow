import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import type { SaveGoodsReceiptBody } from '@domain/documents/services/document-api.mapper';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ProductService } from '@domain/products/services/product.service';
import { ProductLabelPrintService } from '@domain/products/services/product-label-print.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { TenantFeatureSettingsService } from '@domain/tenant/services/tenant-feature-settings.service';
import { TableViewPreferenceApiService } from '@shared/table-columns/table-view-preference-api.service';

import { GoodsReceiptFormComponent } from './goods-receipt-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentSettingsService } from './services/document-settings.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';

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

/** Numerazione predefinita: all'apertura della maschera il primo libero è 42. */
const COUNTER: DocumentCounterView = {
  id: 'cnt-1',
  type: DocumentType.GoodsReceipt,
  series: null,
  locationId: null,
  locationName: null,
  isDefault: true,
  nextNumber: 42,
  documentCount: 41,
};

const NON_STOCK_SUMMARY = {
  variantId: 'var-nostock',
  productId: 'prod-nostock',
  sku: 'SRV-1',
  // I mapper garantiscono sempre una stringa (`?? ''`): la colonna
  // «Cod. articolo» la legge dal form control senza fallback.
  articleCode: '00099',
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
    readonly vatCodes?: readonly unknown[];
    /** Contatori restituiti da GET /document-counters: alimentano la proposta. */
    readonly counters?: readonly DocumentCounterView[];
    /** Protocollo che il server assegna davvero al salvataggio. */
    readonly assignedNumber?: number;
  }) {
    const counters = options?.counters ?? [];
    const showInfo = vi.fn();
    // Del documento salvato la maschera legge il numero assegnato: è il
    // confronto con quello mostrato che decide se avvisare l'operatore.
    const saveGoodsReceipt = vi.fn((_body: SaveGoodsReceiptBody) =>
      of({
        document: {
          id: 'gr-1',
          number: options?.assignedNumber ?? 1,
        } as unknown as DocumentRecord,
        warnings: [] as readonly string[],
        createdProducts: [],
      }),
    );

    const result = await render(GoodsReceiptFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: {
            available: () => of({ counters, proposedCounterId: counters[0]?.id ?? null }),
          },
        },
        // Rotta jolly: creato il documento la maschera passa a /:id/edit, e una
        // navigazione senza rotte da agganciare fallirebbe in modo rumoroso.
        provideRouter([{ path: '**', children: [] }]),
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
            previewDocumentNumber: () =>
              of({ reference: 'AM-2026-0001', previewNumber: 1, series: 'A', year: 2026 }),
            saveGoodsReceipt,
            getPriceModePreference: () => of(false),
          },
        },
        { provide: ToastService, useValue: { showInfo, showError: vi.fn() } },
        // Serie del protocollo: una sola configurata → label statica.
        { provide: DocumentSettingsService, useValue: { getSettings: () => of([]) } },
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        {
          provide: SupplierService,
          useValue: { getSuppliers: () => of([]), getVariantLinksBySupplier: () => of([]) },
        },
        { provide: SupplierOrderService, useValue: {} },
        { provide: ProductLabelPrintService, useValue: {} },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: () => of(options?.variantSummaries ?? []),
            getSupplierVariantLinks: () => of([]),
          },
        },
        { provide: VatCodeService, useValue: { list: () => of(options?.vatCodes ?? []) } },
        { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
        { provide: TenantFeatureSettingsService, useValue: { getSettings: () => of(null) } },
        {
          provide: TableViewPreferenceApiService,
          useValue: { load: () => of(null), save: () => of(undefined) },
        },
      ],
    });

    return Object.assign(result, { saveGoodsReceipt, showInfo });
  }

  /** Il campo Protocollo vive in due viste (mobile + desktop): stesso controllo. */
  async function protocolInput(): Promise<HTMLInputElement> {
    const inputs = await screen.findAllByLabelText<HTMLInputElement>('Protocollo');
    return inputs[0]!;
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

  // Gate compilazione: fornitore + magazzino vanno scelti PRIMA delle righe,
  // altrimenti si inserirebbero articoli in un documento "nullo".
  it('blocca le righe finché fornitore e magazzino non sono selezionati', async () => {
    const { fixture } = await setup();

    const input = screen.getAllByLabelText('Nome prodotto')[0]!;
    expect(input.closest('fieldset[disabled]')).not.toBeNull();
    expect(screen.getByText(/Seleziona fornitore e magazzino/i)).toBeVisible();

    fixture.componentInstance.form.controls.supplierId.setValue('sup-1');
    fixture.componentInstance.form.controls.locationId.setValue('loc-1');
    fixture.detectChanges();

    expect(input.closest('fieldset[disabled]')).toBeNull();
    expect(screen.queryByText(/Seleziona fornitore e magazzino/i)).toBeNull();
  });

  // Dropdown essenziale: solo i suggerimenti dal catalogo (o il messaggio
  // vuoto) — nessuna azione "Crea", nessuna scheda completa, nessun badge.
  it('dropdown senza risultati: solo il messaggio, nessuna azione extra', async () => {
    const user = userEvent.setup();
    const { fixture } = await setup();

    // Gate compilazione: fornitore + magazzino sbloccano le righe.
    fixture.componentInstance.form.controls.supplierId.setValue('sup-1');
    fixture.componentInstance.form.controls.locationId.setValue('loc-1');
    fixture.detectChanges();

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

  // ── Il protocollo proposto non torna al server come imposizione ─────────────
  //
  // Il numero che la maschera mostra all'apertura è il primo libero: una
  // proposta, non una scelta. Rimandarlo al salvataggio lo trasformava in
  // un'imposizione, e il secondo operatore si prendeva un dialogo di conflitto
  // per un numero che non aveva mai digitato — glielo aveva scritto la maschera.
  it('non manda il protocollo proposto: lo assegna il server', async () => {
    const { fixture } = await setup({ counters: [COUNTER] });
    const component = fixture.componentInstance;

    await waitFor(() => expect(component.form.controls.protocolNumber.value).toBe(42));
    const input = await protocolInput();
    await waitFor(() => expect(input.value).toBe('42'));

    expect(component['buildSaveGoodsReceiptBody']().number).toBeUndefined();
  });

  // Il numero digitato a mano resta una scelta dell'operatore, e va difesa: si
  // manda, e se è occupato il dialogo di conflitto ha qualcosa da dire.
  //
  // `fireEvent` e non `userEvent`: il campo Protocollo esiste in due viste e su
  // quella non attiva il CSS lo nasconde — la digitazione simulata rifiuterebbe
  // di interagirci. L'evento `input` è comunque quello che il campo ascolta.
  it('manda il protocollo digitato dall’operatore', async () => {
    const { fixture } = await setup({ counters: [COUNTER] });
    const component = fixture.componentInstance;

    // Gate compilazione: senza fornitore e magazzino la testata è disabilitata.
    component.form.controls.supplierId.setValue('sup-1');
    component.form.controls.locationId.setValue('loc-1');
    fixture.detectChanges();

    const input = await protocolInput();
    fireEvent.input(input, { target: { value: '77' } });

    expect(component.form.controls.protocolNumber.value).toBe(77);
    expect(component['buildSaveGoodsReceiptBody']().number).toBe(77);
  });

  // Numero proposto e numero assegnato possono divergere: fra l'apertura e il
  // salvataggio un altro operatore può aver preso il 42. Non è un errore, ma chi
  // l'aveva già trascritto su carta deve sapere di avere il numero sbagliato.
  it('avvisa quando il server assegna un protocollo diverso da quello proposto', async () => {
    const { fixture, saveGoodsReceipt, showInfo } = await setup({
      counters: [COUNTER],
      assignedNumber: 46,
    });
    const component = fixture.componentInstance;

    await waitFor(() => expect(component.form.controls.protocolNumber.value).toBe(42));
    component.form.controls.supplierId.setValue('sup-1');
    component.form.controls.locationId.setValue('loc-1');

    component['requestSaveDocument']();
    await fixture.whenStable();

    expect(saveGoodsReceipt.mock.calls[0]![0].number).toBeUndefined();
    expect(showInfo).toHaveBeenCalledWith(
      'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
    );
    // La testata si allinea al numero vero: continuare a mostrare il 42 quando
    // il documento è il 46 è peggio che non mostrare niente.
    expect(component.form.controls.protocolNumber.value).toBe(46);
  });

  it('nessun avviso quando il server conferma il protocollo proposto', async () => {
    const { fixture, showInfo } = await setup({ counters: [COUNTER], assignedNumber: 42 });
    const component = fixture.componentInstance;

    await waitFor(() => expect(component.form.controls.protocolNumber.value).toBe(42));
    component.form.controls.supplierId.setValue('sup-1');
    component.form.controls.locationId.setValue('loc-1');

    component['requestSaveDocument']();
    await fixture.whenStable();

    expect(showInfo).not.toHaveBeenCalled();
  });

  /**
   * Test di CARATTERIZZAZIONE sui totali documento.
   *
   * Fotografano il comportamento attuale in vista dell'estrazione del core
   * condiviso dei form documento. L'Arrivo merce ha una dimensione in più
   * rispetto all'Ordine cliente: `vatAffectsSupplierTotal`, che tiene fuori
   * dal totale l'IVA di reverse charge e aliquota zero.
   */
  describe('documentTotals — caratterizzazione', () => {
    function vatCode(over: Record<string, unknown>) {
      return {
        id: 'vat-x',
        code: 'IVA',
        natureId: 'nat-1',
        nature: {},
        ratePercent: 22,
        nonDeductiblePercent: 0,
        description: '',
        notes: null,
        usageScope: 'both',
        calculationMode: 'standard',
        vatAffectsSupplierTotal: true,
        ...over,
      };
    }

    const IVA_22 = vatCode({ id: 'vat-22', code: '22', ratePercent: 22 });
    const IVA_10 = vatCode({ id: 'vat-10', code: '10', ratePercent: 10 });
    const REVERSE = vatCode({
      id: 'vat-rc',
      code: 'RC',
      ratePercent: 22,
      calculationMode: 'reverse_charge',
      vatAffectsSupplierTotal: false,
    });

    interface Totals {
      linesTotal: { amountMinor: number };
      documentDiscount: { amountMinor: number };
      subtotal: { amountMinor: number };
      tax: { amountMinor: number };
      total: { amountMinor: number };
    }

    async function withLines(
      lines: readonly { qty: number; cost: string; vatCodeId?: string }[],
      options?: { readonly documentDiscountPercent?: string; readonly costsIncludeVat?: boolean },
    ) {
      const { fixture } = await setup({ vatCodes: [IVA_22, IVA_10, REVERSE] });
      const component = fixture.componentInstance;

      // Gate testata: senza fornitore e magazzino addLine() non fa nulla.
      component.form.controls.supplierId.setValue('sup-1');
      component.form.controls.locationId.setValue('loc-1');
      fixture.detectChanges();

      if (options?.costsIncludeVat) {
        component['costEntryMode'].set('vat_included');
      }
      lines.forEach((line, index) => {
        let guard = 0;
        while (component['lines'].length <= index && guard++ < 20) {
          component['addLine']();
        }
        const controls = component['lines'].at(index).controls;
        controls.productName.setValue(`Articolo ${index + 1}`);
        controls.quantity.setValue(line.qty);
        controls.unitCost.setValue(line.cost);
        controls.vatCodeId.setValue(line.vatCodeId ?? '');
      });
      if (options?.documentDiscountPercent) {
        component.form.controls.documentDiscountPercent.setValue(options.documentDiscountPercent);
      }

      return component['documentTotals']() as Totals;
    }

    it('documento vuoto: tutti i totali a zero', async () => {
      expect(await withLines([])).toMatchObject({
        linesTotal: { amountMinor: 0 },
        tax: { amountMinor: 0 },
        total: { amountMinor: 0 },
      });
    });

    it('riga senza codice IVA: nessuna imposta', async () => {
      expect(await withLines([{ qty: 3, cost: '10,00' }])).toMatchObject({
        linesTotal: { amountMinor: 3000 },
        subtotal: { amountMinor: 3000 },
        tax: { amountMinor: 0 },
        total: { amountMinor: 3000 },
      });
    });

    it('IVA 22% a costo netto: imposta esposta e sommata al totale', async () => {
      // 2 × 50,00 = 100,00 netti → IVA 22,00 → totale 122,00
      expect(await withLines([{ qty: 2, cost: '50,00', vatCodeId: IVA_22.id }])).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        tax: { amountMinor: 2200 },
        total: { amountMinor: 12200 },
      });
    });

    it('reverse charge: l’imponibile conta, l’IVA resta fuori dal totale', async () => {
      expect(await withLines([{ qty: 1, cost: '100,00', vatCodeId: REVERSE.id }])).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        subtotal: { amountMinor: 10000 },
        tax: { amountMinor: 0 },
        total: { amountMinor: 10000 },
      });
    });

    it('sconto documento con due aliquote: IVA ripartita in proporzione', async () => {
      // Imponibile 200,00 − 10% = 180,00, ripartito 50/50 → 90,00 per aliquota.
      // IVA = 90,00·22% + 90,00·10% = 19,80 + 9,00 = 28,80 → totale 208,80
      expect(
        await withLines(
          [
            { qty: 1, cost: '100,00', vatCodeId: IVA_22.id },
            { qty: 1, cost: '100,00', vatCodeId: IVA_10.id },
          ],
          { documentDiscountPercent: '10' },
        ),
      ).toMatchObject({
        linesTotal: { amountMinor: 20000 },
        documentDiscount: { amountMinor: 2000 },
        subtotal: { amountMinor: 18000 },
        tax: { amountMinor: 2880 },
        total: { amountMinor: 20880 },
      });
    });

    it('modalità costi ivati: scorpora il netto dal costo digitato', async () => {
      // 122,00 ivati con IVA 22% → netto 100,00, imposta 22,00
      expect(
        await withLines([{ qty: 1, cost: '122,00', vatCodeId: IVA_22.id }], {
          costsIncludeVat: true,
        }),
      ).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        tax: { amountMinor: 2200 },
        total: { amountMinor: 12200 },
      });
    });

    it('costi ivati + reverse charge: nessuno scorporo, l’IVA non è nel costo', async () => {
      expect(
        await withLines([{ qty: 1, cost: '100,00', vatCodeId: REVERSE.id }], {
          costsIncludeVat: true,
        }),
      ).toMatchObject({
        linesTotal: { amountMinor: 10000 },
        total: { amountMinor: 10000 },
      });
    });
  });
});
