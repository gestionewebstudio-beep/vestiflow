import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { fireEvent, render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
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
  return {
    locations: () => writeLocations,
    writeLocations: () => writeLocations,
    actionLocations: () => writeLocations,
    transferTargetLocations: () => writeLocations,
    defaultLocation: () => defaultLocation,
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

/**
 * Forma di una summary articolo nelle prove: larga quanto la maschera legge.
 *
 * Prima il tipo delle fixture era `typeof NON_STOCK_SUMMARY`, cioè quella
 * costante e nient'altro — con `as const` ogni campo diventa un letterale, e
 * una fixture nuova con un altro `variantId` non compilava. Un'impalcatura che
 * ammette un solo articolo impedisce di provare tutto ciò che riguarda il
 * SECONDO: la sostituzione, per esempio.
 */
interface VariantSummaryFixture {
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly articleCode: string;
  readonly productName: string;
  readonly title: string;
  readonly barcode?: string;
  readonly sellingPrice: { readonly amountMinor: number; readonly currencyCode: string };
  readonly compareAtPrice?: { readonly amountMinor: number; readonly currencyCode: string };
  readonly purchasePrice?: { readonly amountMinor: number; readonly currencyCode: string };
  readonly stockOnHand: number | null;
  readonly managesStock: boolean;
  readonly defaultVatCodeId?: string;
  readonly unitOfMeasure?: string;
}

const NON_STOCK_SUMMARY: VariantSummaryFixture = {
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

interface GoodsReceiptSetupOptions {
  readonly writeLocations?: readonly { id: string; name: string }[];
  readonly defaultLocation?: { id: string; name: string } | null;
  readonly variantSummaries?: readonly VariantSummaryFixture[];
  readonly vatCodes?: readonly unknown[];
  /** Operatore corrente: decide quali comandi la maschera può mostrare. */
  readonly currentUser?: unknown;
  /** Contatori restituiti da GET /document-counters: alimentano la proposta. */
  readonly counters?: readonly DocumentCounterView[];
  /** Numero che il server assegna davvero al salvataggio. */
  readonly assignedNumber?: number;
}

/** Operatore senza permessi: l'array salvato È la verità, anche vuoto. */
function userWithPermissions(permissions: readonly string[]) {
  return { id: 'u-1', role: 'clerk', permissions };
}

/**
 * I provider di base della maschera. Estratti da `setup` perché un secondo
 * gruppo di prove ne sovrascrive due (catalogo e collegamenti fornitore): in
 * Angular vince l'ultimo provider per lo stesso token, quindi basta accodarli.
 */
function goodsReceiptProviders(options?: GoodsReceiptSetupOptions) {
  return [
    {
      provide: DocumentCountersService,
      useValue: { available: () => of({ counters: [], proposedCounterId: null }) },
    },
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
        paramMap: of(convertToParamMap({})),
      },
    },
    { provide: OperationalLocationsService, useValue: operationalLocationsMock(options) },
    { provide: AuthService, useValue: { currentUser: () => options?.currentUser ?? null } },
    {
      provide: APP_CONFIG,
      useValue: {
        production: false,
        appName: 'VestiFlow',
        apiBaseUrl: '',
        features: { barcodeScanner: false, shopify: false },
      },
    },
    {
      provide: DocumentService,
      useValue: {
        getDocumentById: vi.fn(),
        previewDocumentNumber: () =>
          of({ reference: 'AM-2026-0001', previewNumber: 1, series: 'A', year: 2026 }),
        saveGoodsReceipt: vi.fn(),
        getPriceModePreference: () => of(false),
        // Controllo cronologico (§4): serie in ordine, quindi nessun avviso e
        // il salvataggio prosegue senza interruzioni.
        checkChronology: () => of({ conflicts: [], dismissed: false }),
        dismissChronologyWarning: () => of(void 0),
      },
    },
    // Serie del numero: una sola configurata → label statica.
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
        // Il filtro per `variantId` va rispettato come nel servizio vero: la
        // maschera cerca per id quando la variante non è ancora fra le pinned,
        // e un catalogo che risponde sempre con tutto le farebbe agganciare il
        // primo articolo qualunque cosa abbia chiesto.
        searchVariantSummaries: (params?: { readonly variantId?: string }) => {
          const catalogo = options?.variantSummaries ?? [];
          return of(
            params?.variantId
              ? catalogo.filter((row) => row.variantId === params.variantId)
              : catalogo,
          );
        },
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
  ];
}

describe('GoodsReceiptFormComponent', () => {
  async function setup(options?: GoodsReceiptSetupOptions) {
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

    // Base condivisa più sovrascritture (stesso token: vince l'ultimo provider):
    // contatori pilotabili, salvataggio che restituisce il numero assegnato,
    // toast catturato. La rotta jolly serve perché creato il documento la
    // maschera passa a /:id/edit, e senza rotte la navigazione fallirebbe.
    const result = await render(GoodsReceiptFormComponent, {
      providers: [
        ...goodsReceiptProviders(options),
        {
          provide: DocumentCountersService,
          useValue: {
            available: () => of({ counters, proposedCounterId: counters[0]?.id ?? null }),
          },
        },
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(),
            previewDocumentNumber: () =>
              of({ reference: 'AM-2026-0001', previewNumber: 1, series: 'A', year: 2026 }),
            saveGoodsReceipt,
            getPriceModePreference: () => of(false),
            // Controllo cronologico (§4): serie in ordine, quindi nessun avviso e
            // il salvataggio prosegue senza interruzioni.
            checkChronology: () => of({ conflicts: [], dismissed: false }),
            dismissChronologyWarning: () => of(void 0),
          },
        },
        { provide: ToastService, useValue: { showInfo, showError: vi.fn() } },
      ],
    });

    return Object.assign(result, { saveGoodsReceipt, showInfo });
  }

  /** Il campo Numero vive in due viste (mobile + desktop): stesso controllo. */
  async function numberInput(): Promise<HTMLInputElement> {
    const inputs = await screen.findAllByLabelText<HTMLInputElement>('Numero');
    return inputs[0]!;
  }

  // ── Sede predefinita (§1-bis, 13/08/2026) ─────────────────────────────────
  //
  // Regola nuova, e ribalta quella che questi due test fissavano prima («mai
  // autoselezione, suggerimento cliccabile»). Il motivo del ribaltamento:
  // una sede predefinita non è una sede che il sistema si inventa, è un dato
  // che qualcuno ha assegnato a quell'utente. Il commesso del negozio di Napoli
  // non deve confermare a ogni documento di stare a Napoli.
  //
  // Gli scenari sono due, e sono complementari: chi lavora su più sedi una
  // predefinita NON ce l'ha, quindi per lui il campo resta vuoto — che è il
  // comportamento giusto proprio nel caso in cui la sede è ambigua.
  it('con una sede predefinita la testata esce già compilata', async () => {
    await setup({ defaultLocation: MILANO });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Location di destinazione' })).toHaveTextContent(
        'Milano (predefinita)',
      ),
    );
  });

  it('senza sede predefinita il campo resta vuoto, anche con una sola sede', async () => {
    await setup({ writeLocations: [MILANO], defaultLocation: null });

    expect(screen.getByRole('button', { name: 'Location di destinazione' })).toHaveTextContent(
      'Seleziona location…',
    );
    // Il suggerimento cliccabile non esiste più: col predefinito il campo è già
    // pieno, senza predefinito non c'è nulla da suggerire.
    expect(screen.queryByRole('button', { name: /suggerita/i })).toBeNull();
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
  // Cambio dichiarato (11/08/2026): a testata incompleta le righe non sono più
  // «lì, spente a metà tinta» — non ci sono affatto, e al loro posto c'è uno
  // stato vuoto che dice cosa manca. Il fieldset disabilitato resta comunque,
  // perché copre anche i comandi della barra strumenti.
  it('a testata incompleta le righe non ci sono, e lo stato vuoto dice cosa manca', async () => {
    const { fixture } = await setup();

    expect(screen.queryAllByLabelText('Nome prodotto')).toHaveLength(0);
    expect(screen.getByText('Scegli il fornitore e il magazzino')).toBeVisible();

    fixture.componentInstance.form.controls.supplierId.setValue('sup-1');
    fixture.componentInstance.form.controls.locationId.setValue('loc-1');
    fixture.detectChanges();

    const input = screen.getAllByLabelText('Nome prodotto')[0]!;
    expect(input.closest('fieldset[disabled]')).toBeNull();
    expect(screen.queryByText('Scegli il fornitore e il magazzino')).toBeNull();
  });

  // Dropdown essenziale: solo i suggerimenti dal catalogo (o il messaggio
  // vuoto) — nessuna azione "Crea", nessuna scheda completa, nessun badge.
  // Decisione 11/08/2026: senza risultati il pannello non si apre, e non dice
  // niente. Non trovare nulla non è un errore — si continua a compilare la riga
  // a mano, e la creazione dell'articolo passa dal pannello di ricerca.
  it('senza risultati il pannello non si apre e non c’è nessun messaggio', async () => {
    const user = userEvent.setup();
    const { fixture } = await setup();

    // Gate compilazione: fornitore + magazzino sbloccano le righe.
    fixture.componentInstance.form.controls.supplierId.setValue('sup-1');
    fixture.componentInstance.form.controls.locationId.setValue('loc-1');
    fixture.detectChanges();

    const input = screen.getAllByLabelText('Nome prodotto')[0];
    await user.type(input!, 'maglia');

    expect(screen.queryByRole('listbox', { name: 'Suggerimenti prodotto' })).toBeNull();
    expect(screen.queryByText('Nessun articolo trovato a catalogo.')).toBeNull();
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

  /**
   * Sostituzione d'articolo sulla stessa riga (difetto trovato il 15/08/2026).
   *
   * Costo e prezzi si scrivevano solo se il campo era vuoto — una precauzione
   * giusta per la riga che arriva da un ordine fornitore, sbagliata quando è
   * l'operatore a cambiare articolo: restavano i valori del precedente, e da
   * qui sarebbero finiti in giacenza e su Shopify.
   */
  it('sostituendo l’articolo sulla riga, costo e prezzo seguono il nuovo', async () => {
    const primo = {
      ...NON_STOCK_SUMMARY,
      variantId: 'var-1',
      sku: 'ART-1',
      managesStock: true,
      purchasePrice: { amountMinor: 1000, currencyCode: 'EUR' },
      sellingPrice: { amountMinor: 2000, currencyCode: 'EUR' },
    };
    const secondo = {
      ...primo,
      variantId: 'var-2',
      sku: 'ART-2',
      purchasePrice: { amountMinor: 3000, currencyCode: 'EUR' },
      sellingPrice: { amountMinor: 6000, currencyCode: 'EUR' },
    };
    const { fixture } = await setup({ variantSummaries: [primo, secondo] });
    const component = fixture.componentInstance;

    component['onVariantSelect'](0, 'var-1');
    await fixture.whenStable();
    const line = component['lines'].at(0);
    expect(line.controls.unitCost.value).toBe('10,00');

    component['onVariantSelect'](0, 'var-2');
    await fixture.whenStable();

    expect(line.controls.variantId.value).toBe('var-2');
    expect(line.controls.unitCost.value).toBe('30,00');
    expect(line.controls.sellingPrice.value).toBe('60,00');
  });

  // ── Il numero proposto non torna al server come imposizione ─────────────
  //
  // Il numero che la maschera mostra all'apertura è il primo libero: una
  // proposta, non una scelta. Rimandarlo al salvataggio lo trasformava in
  // un'imposizione, e il secondo operatore si prendeva un dialogo di conflitto
  // per un numero che non aveva mai digitato — glielo aveva scritto la maschera.
  it('non manda il numero proposto: lo assegna il server', async () => {
    const { fixture } = await setup({ counters: [COUNTER] });
    const component = fixture.componentInstance;

    await waitFor(() => expect(component.form.controls.documentNumber.value).toBe(42));
    const input = await numberInput();
    await waitFor(() => expect(input.value).toBe('42'));

    expect(component['buildSaveGoodsReceiptBody']().number).toBeUndefined();
  });

  // Il numero digitato a mano resta una scelta dell'operatore, e va difesa: si
  // manda, e se è occupato il dialogo di conflitto ha qualcosa da dire.
  //
  // `fireEvent` e non `userEvent`: il campo Numero esiste in due viste e su
  // quella non attiva il CSS lo nasconde — la digitazione simulata rifiuterebbe
  // di interagirci. L'evento `input` è comunque quello che il campo ascolta.
  it('manda il numero digitato dall’operatore', async () => {
    const { fixture } = await setup({ counters: [COUNTER] });
    const component = fixture.componentInstance;

    // Gate compilazione: senza fornitore e magazzino la testata è disabilitata.
    component.form.controls.supplierId.setValue('sup-1');
    component.form.controls.locationId.setValue('loc-1');
    fixture.detectChanges();

    const input = await numberInput();
    fireEvent.input(input, { target: { value: '77' } });

    expect(component.form.controls.documentNumber.value).toBe(77);
    expect(component['buildSaveGoodsReceiptBody']().number).toBe(77);
  });

  // Numero proposto e numero assegnato possono divergere: fra l'apertura e il
  // salvataggio un altro operatore può aver preso il 42. Non è un errore, ma chi
  // l'aveva già trascritto su carta deve sapere di avere il numero sbagliato.
  it('avvisa quando il server assegna un numero diverso da quello proposto', async () => {
    const { fixture, saveGoodsReceipt, showInfo } = await setup({
      counters: [COUNTER],
      assignedNumber: 46,
    });
    const component = fixture.componentInstance;

    await waitFor(() => expect(component.form.controls.documentNumber.value).toBe(42));
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
    expect(component.form.controls.documentNumber.value).toBe(46);
  });

  it('nessun avviso quando il server conferma il numero proposto', async () => {
    const { fixture, showInfo } = await setup({ counters: [COUNTER], assignedNumber: 42 });
    const component = fixture.componentInstance;

    await waitFor(() => expect(component.form.controls.documentNumber.value).toBe(42));
    component.form.controls.supplierId.setValue('sup-1');
    component.form.controls.locationId.setValue('loc-1');

    component['requestSaveDocument']();
    await fixture.whenStable();

    expect(showInfo).not.toHaveBeenCalled();
  });

  /**
   * **La guardia dell'allineamento del 13/08/2026.**
   *
   * L'Arrivo merce numerava con una regola propria: «già numerato» lo deduceva
   * dal RIFERIMENTO del documento. Ora guarda la sua esistenza — la stessa cosa
   * che le altre maschere dicono con `isEditMode()`, detta per una maschera che
   * dopo il salvataggio non se ne va (§10.7).
   *
   * **Questa prova è nata rossa, ed è il suo motivo di esistere.** Con la sola
   * rotta (`isEditMode()`) il campo torna da 46 a 42: il documento è salvato ma
   * l'URL è ancora quello di creazione, la prima riproposta dei contatori lo
   * trova «nuovo e mai toccato» e ci riscrive sopra il numero proposto prima.
   * L'operatore trascriverebbe un numero che non è del suo documento.
   */
  it('dopo il salvataggio il numero assegnato non torna a essere una proposta', async () => {
    const { fixture } = await setup({ counters: [COUNTER], assignedNumber: 46 });
    const component = fixture.componentInstance;

    await waitFor(() => expect(component.form.controls.documentNumber.value).toBe(42));
    component.form.controls.supplierId.setValue('sup-1');
    component.form.controls.locationId.setValue('loc-1');

    component['requestSaveDocument']();
    await fixture.whenStable();
    await fixture.whenStable();

    // Il documento esiste e porta il 46: la testata lo mostra.
    expect(component.form.controls.documentNumber.value).toBe(46);

    // Una riproposta dei contatori — la scatenano il cambio data e ogni
    // ricarica — non deve più toccarlo: il numero è assegnato, non proposto.
    component['refreshNumberProposal']();
    await fixture.whenStable();

    expect(component.form.controls.documentNumber.value).toBe(46);
    expect(component['numberIsProposal']()).toBe(false);
  });

  /**
   * Comandi che l'API nega: non devono nemmeno comparire. Un pulsante che
   * risponde 403 al primo clic è peggio di un pulsante assente.
   */
  describe('permessi dell’operatore', () => {
    it('senza permessi: numerazioni, nuovo fornitore e nuovo prodotto spariscono', async () => {
      await setup({ currentUser: userWithPermissions([]) });

      expect(screen.queryAllByRole('button', { name: 'Gestisci numerazioni' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Nuovo fornitore' })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: 'Nuovo prodotto' })).toHaveLength(0);
    });

    it('con i permessi: gli stessi comandi restano al loro posto', async () => {
      await setup({
        currentUser: userWithPermissions([
          'documents.configure',
          'doc.supplier_order.manage',
          'catalog.manage',
        ]),
      });

      // Testata mobile e desktop convivono in jsdom: entrambe li mostrano.
      expect(
        screen.getAllByRole('button', { name: 'Gestisci numerazioni' }).length,
      ).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: 'Nuovo fornitore' }).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Nuovo prodotto' })).toBeVisible();
    });

    it('senza documents.configure la tendina tipo documento non propone la configurazione', async () => {
      const user = userEvent.setup();
      const { fixture } = await setup({ currentUser: userWithPermissions([]) });

      // La seconda fascia della testata è dietro il gate fornitore + magazzino.
      fixture.componentInstance.form.controls.supplierId.setValue('sup-1');
      fixture.componentInstance.form.controls.locationId.setValue('loc-1');
      fixture.detectChanges();

      await user.click(screen.getByRole('button', { name: 'Tipo di documento' }));

      expect(screen.queryByRole('option', { name: /Gestisci tipi documento/ })).toBeNull();
      expect(screen.queryByRole('option', { name: /Nuovo tipo/ })).toBeNull();
    });
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

  /**
   * Il giro del fuoco, innestato sul punto unico. Qui si provano le due cose che
   * questa maschera ha e le gemelle no: il gancio di cambio riga, e `Ctrl` +
   * frecce che resta fuori dal contratto.
   */
  describe('il giro del fuoco', () => {
    interface FocusForm {
      readonly lineFocus: { fieldsOf: (i: number) => readonly string[] };
      readonly onLineFieldKeydown: (i: number, field: string, e: KeyboardEvent) => void;
      readonly moveLineDown: (i: number) => void;
      readonly lines: { length: number };
    }

    async function apriForm() {
      const view = await setup();
      return view.fixture.componentInstance as unknown as FocusForm;
    }

    // L'IVA è rientrata nel giro con la cella a ricerca-e-selezione (B3). La
    // guardia era «non c'è» e ora è «c'è»: `gr-vat-{i}` stava nella mappa degli
    // id anche quando quella cella era un `app-select-menu` e nel DOM non
    // esisteva — è quel disallineamento che faceva morire il fuoco, e ora i due
    // lati dicono la stessa cosa. Che l'id finisca davvero sull'input lo prova
    // lo spec della cella.
    it('l’IVA è nel giro del fuoco', async () => {
      const form = await apriForm();

      expect(form.lineFocus.fieldsOf(0)).toContain('vat');
    });

    // ⛔ Ctrl+↑/↓ NON sposta più la riga (11/08/2026, §7.3): esisteva solo qui,
    // duplicava il trascinamento che ora c'è ovunque, e si scopriva solo col
    // mouse — cioè da chi poteva già trascinare. La guardia serve perché
    // «tolto» non torni indietro per inerzia insieme a un'altra modifica.
    it('Ctrl+↓ non sposta la riga, e il tasto resta al browser', async () => {
      const form = await apriForm();
      const spostaGiu = vi.spyOn(
        form as unknown as { moveLineDown: (i: number) => void },
        'moveLineDown',
      );
      const evento = new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        ctrlKey: true,
        cancelable: true,
      });

      form.onLineFieldKeydown(0, 'quantity', evento);

      expect(spostaGiu).not.toHaveBeenCalled();
      // Non si trattiene un tasto che non si serve: fermarlo senza fare niente
      // fa sembrare rotta la tastiera.
      expect(evento.defaultPrevented).toBe(false);
    });

    // §4.5: Invio non naviga più. Qui cade il caso speciale «Invio su Q.tà con
    // articolo collegato salta riga», che era metà della vecchia voce 9.
    it('Invio non crea righe e non naviga', async () => {
      const form = await apriForm();
      const righePrima = form.lines.length;
      const evento = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

      form.onLineFieldKeydown(0, 'quantity', evento);

      expect(evento.defaultPrevented).toBe(true);
      expect(form.lines.length).toBe(righePrima);
    });
  });

  /**
   * Quale codice fornitore finisce nella riga quando si aggancia un articolo.
   *
   * Le fonti sono due e vanno in quest'ordine: il codice DIGITATO con cui si è
   * agganciato, poi quello del collegamento con il fornitore DELLA TESTATA. Non
   * è una fonte `VariantSummary.supplierSku`: da quando la conferma non filtra
   * per fornitore, quel campo è il primo collegamento in ordine deterministico
   * — il codice di un fornitore qualsiasi.
   */
  describe('codice fornitore scritto nella riga', () => {
    interface CodeForm {
      readonly commitSkuLookup: (index: number) => void;
      readonly commitSupplierSkuLookup: (index: number) => void;
      readonly form: { controls: Record<string, { setValue: (v: unknown) => void }> };
      readonly lines: {
        at: (i: number) => {
          controls: Record<string, { setValue: (v: unknown) => void; value: string }>;
        };
      };
    }

    /**
     * `catalogo` risponde alla RICERCA (query con `search`), dove il codice
     * fornitore restituito è quello che ha fatto scattare la ricerca;
     * `perVariante` risponde al caricamento per id, dove nessuna ricerca ha
     * scelto un collegamento e il codice è arbitrario. Mockarle uguali
     * nasconderebbe il difetto.
     */
    async function apri(options: {
      readonly catalogo: readonly Record<string, unknown>[];
      readonly perVariante?: readonly Record<string, unknown>[];
      readonly collegamentiDelFornitore?: readonly Record<string, unknown>[];
    }) {
      const view = await render(GoodsReceiptFormComponent, {
        providers: [
          ...goodsReceiptProviders(),
          {
            provide: SupplierService,
            useValue: {
              getSuppliers: () => of([{ id: 'sup-1', name: 'Tessuti Italia' }]),
              getVariantLinksBySupplier: () => of(options.collegamentiDelFornitore ?? []),
            },
          },
          {
            provide: ProductService,
            useValue: {
              searchVariantSummaries: (query?: { search?: string }) =>
                of(query?.search ? options.catalogo : (options.perVariante ?? options.catalogo)),
              findVariantByCode: () => throwError(() => new Error('404')),
              getSupplierVariantLinks: () => of([]),
            },
          },
        ],
      });
      const form = view.fixture.componentInstance as unknown as CodeForm;
      // La testata sceglie il fornitore: e' cio' che carica i suoi codici.
      form.form.controls['supplierId']!.setValue('sup-1');
      return { form, fixture: view.fixture };
    }

    /**
     * In questa maschera il codice fornitore lo scrive il RIALLINEAMENTO, non
     * l'aggancio: assegnare la variante fa ricaricare i riepiloghi, e un effect
     * riempie i codici. Senza far girare il ciclo il campo resta vuoto e la
     * prova non misura niente.
     */
    async function lasciaGirareIlCiclo(fixture: { detectChanges: () => void }): Promise<void> {
      for (let giro = 0; giro < 3; giro += 1) {
        fixture.detectChanges();
        await Promise.resolve();
      }
      fixture.detectChanges();
    }

    const ARTICOLO = {
      variantId: 'var-1',
      productId: 'prod-1',
      articleCode: 'ART-1',
      productName: 'Maglietta',
      title: 'Maglietta',
      sku: 'MAG-M',
      sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
    };

    it('agganciando per SKU vale il codice del fornitore della testata, non quello del riepilogo', async () => {
      const { form, fixture } = await apri({
        catalogo: [{ ...ARTICOLO, supplierSku: 'F-999' }],
        collegamentiDelFornitore: [{ variantId: 'var-1', supplierSku: 'F-777' }],
      });
      form.lines.at(0).controls['sku']!.setValue('MAG-M');

      form.commitSkuLookup(0);
      await lasciaGirareIlCiclo(fixture);

      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
      expect(form.lines.at(0).controls['supplierSku']!.value).toBe('F-777');
    });

    // Il controllo inverso: senza, la prova qui sopra passerebbe anche se il
    // codice della testata vincesse SEMPRE, pure su quello appena digitato.
    // Vale anche come guardia sul riallineamento, che gira su un effect: se
    // tornasse a sovrascrivere, il codice digitato sparirebbe un istante dopo.
    it('agganciando da Cod. fornitore resta il codice digitato', async () => {
      const { form, fixture } = await apri({
        catalogo: [{ ...ARTICOLO, supplierSku: 'F-100' }],
        perVariante: [{ ...ARTICOLO, supplierSku: 'F-999' }],
        collegamentiDelFornitore: [{ variantId: 'var-1', supplierSku: 'F-777' }],
      });
      form.lines.at(0).controls['supplierSku']!.setValue('F-100');

      form.commitSupplierSkuLookup(0);
      await lasciaGirareIlCiclo(fixture);

      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
      expect(form.lines.at(0).controls['supplierSku']!.value).toBe('F-100');
    });
  });
});
