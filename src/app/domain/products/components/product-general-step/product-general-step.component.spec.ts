import { signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProductKind, ProductStatus } from '@core/models/product.model';
import { InventoryTrackingMode } from '@core/models/product-catalog.model';
import type { VatCode } from '@core/models/vat-code.model';
import { ButtonComponent } from '@shared/components/button/button.component';
import { HoverTooltipComponent } from '@shared/components/hover-tooltip/hover-tooltip.component';
import { SegmentedComponent } from '@shared/components/segmented/segmented.component';
import { DocumentLineSelectCellComponent } from '@domain/documents/components/document-line-select-cell/document-line-select-cell.component';
import { SelectMenuComponent } from '@shared/components/select-menu/select-menu.component';

import { ProductGeneralStepComponent } from './product-general-step.component';
import { UnitOfMeasureOptionService } from '../../services/unit-of-measure-option.service';
import { UnitOfMeasureSelectComponent } from '../unit-of-measure-select/unit-of-measure-select.component';
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

/** Un Codice IVA NOTO ad aliquota zero (esente): netto e ivato coincidono per definizione. */
const VAT_ESENTE: VatCode = {
  ...VAT_22,
  id: 'vat-esente',
  code: 'N4',
  ratePercent: 0,
  calculationMode: 'zero_rate',
  description: 'Esente',
  isDefault: false,
};

const LISTINO_SLOTS: readonly ProductListinoSlot[] = [
  { position: 1, field: 'listino1Price', label: 'Ingrosso', inputId: 'product-listino-1-price' },
];

const EMPTY_GENERAL: ProductGeneralDraft = {
  articleCode: '',
  name: '',
  shopifyTitle: '',
  shopifyProductType: '',
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

/** L’elenco U.M. finto: due voci, nessuna rete. */
const unitOptionsMock = {
  options: () =>
    signal([
      { id: '1', name: 'pz', sortOrder: 0, isSystem: true, isActive: true, isDefault: true },
      { id: '2', name: 'kg', sortOrder: 1, isSystem: false, isActive: true, isDefault: false },
    ]).asReadonly(),
  reload: () => undefined,
};

/**
 * Render dello step con le sole dipendenze reali che servono ai test (la
 * tassonomia Shopify e la gestione categorie restano fuori: parlano col server).
 */
function renderStep(componentInputs: Record<string, unknown>) {
  return render(ProductGeneralStepComponent, {
    providers: [
      { provide: CatalogCategoryService, useValue: catalogCategoryServiceMock },
      // ⚠️ Il selettore U.M. è AUTOSUFFICIENTE: si procura l’elenco da sé e ospita
      //   il proprio gestore. È il suo pregio — chi lo usa non deve sapere niente
      //   — ma in prova significa una chiamata al server, che qui non c’entra.
      { provide: UnitOfMeasureOptionService, useValue: unitOptionsMock },
    ],
    configureTestBed: (testBed) => {
      testBed.overrideComponent(ProductGeneralStepComponent, {
        set: {
          imports: [
            NgTemplateOutlet,
            ReactiveFormsModule,
            SelectMenuComponent,
            DocumentLineSelectCellComponent,
            SegmentedComponent,
            ButtonComponent,
            HoverTooltipComponent,
            UnitOfMeasureSelectComponent,
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

  /**
   * Le due sezioni dell’area prezzi — 17/08/2026.
   *
   * Un listino non è un altro prezzo: è una **regola commerciale alternativa**
   * (Ingrosso, Rivenditori) che assegna un prezzo diverso allo stesso
   * articolo. Prima la sezione si chiamava «Listini» e ne conteneva cinque, di
   * cui tre lo erano davvero — e in Impostazioni gli stessi tre si chiamavano
   * «Listini aggiuntivi»: la stessa parola per due insiemi, a due schermate di
   * distanza.
   */
  describe('le due sezioni dell’area prezzi', () => {
    it('«Prezzi di vendita» tiene i tre prezzi veri, barrato compreso', async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        shopifyActive: true,
      });

      expect(screen.getByRole('heading', { name: 'Prezzi di vendita' })).toBeVisible();
      expect(screen.getByLabelText('Prezzo di vendita')).toBeVisible();
      expect(screen.getByLabelText(/Prezzo barrato/)).toBeVisible();
      expect(screen.getByLabelText(/Prezzo Shopify/)).toBeVisible();
    });

    it('«Listini» è una sezione a sé', async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
      });

      expect(screen.getByRole('heading', { name: 'Listini' })).toBeVisible();
      expect(screen.getByLabelText('Ingrosso')).toBeVisible();
    });

    it('il costo dichiara la sua base: è fuori dal selettore', async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        canSeeCosts: true,
      });

      // Stringa e non regex: le parentesi di «(netto)» in una regex sarebbero un
      // gruppo, e il confronto passerebbe anche senza le parentesi a schermo —
      // cioè proprio la cosa che questa prova deve tenere ferma.
      expect(screen.getByLabelText('Costo di riferimento (netto)', { exact: false })).toBeVisible();
    });
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
        // Netti a DB: 100,00 di prezzo di vendita e 50,00 di listino.
        value: { ...EMPTY_GENERAL, sellingPrice: 100, listino1Price: 50 },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      expect(screen.getByLabelText('Prezzo di vendita')).toHaveValue(122);
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

      const price = screen.getByLabelText('Prezzo di vendita');
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

    /**
     * Il prezzo barrato è entrato fra i prezzi di vendita il 17/08/2026.
     *
     * ⚠️ Era l'unico dei sei a ignorare il selettore **in silenzio**: si
     * inseriva «come va mostrato al cliente». La conseguenza usciva dal
     * gestionale — verso Shopify la stessa riga variante portava `price`
     * netto e `compare_at_price` ivato, cioè uno sconto mostrato al cliente
     * gonfiato dell'aliquota.
     */
    it('il barrato segue la modalità come gli altri prezzi di vendita', async () => {
      const { fixture } = await renderStep({
        // Netto a DB: 70,00
        value: { ...EMPTY_GENERAL, sellingPrice: 100, compareAtPrice: 70 },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        pricesIncludeVat: true,
      });
      await fixture.whenStable();

      expect(screen.getByLabelText(/Prezzo barrato/)).toHaveValue(85.4);

      fixture.componentRef.setInput('pricesIncludeVat', false);
      await fixture.whenStable();
      expect(screen.getByLabelText(/Prezzo barrato/)).toHaveValue(70);
    });

    /**
     * Il caso che ha fatto emergere il problema, chiesto da Luigi: 70,00
     * ivati al 22% hanno un netto che in unità minori NON è intero
     * (5737,704918). Se si memorizzasse arrotondato, la riapertura in ivato
     * darebbe 69,99 o 70,01.
     */
    it('70,00 ivati tornano 70,00 esatti dopo il giro', async () => {
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

      const barrato = screen.getByLabelText(/Prezzo barrato/);
      await user.clear(barrato);
      await user.type(barrato, '70');

      // Netto canonico con la coda: 70 / 1,22 = 57,377049…
      expect(onChange.mock.calls.at(-1)?.[0].compareAtPrice).toBeCloseTo(57.377049, 6);

      fixture.componentRef.setInput('pricesIncludeVat', false);
      await fixture.whenStable();
      expect(barrato).toHaveValue(57.38);

      fixture.componentRef.setInput('pricesIncludeVat', true);
      await fixture.whenStable();
      expect(barrato).toHaveValue(70);
    });

    it('barrato vuoto resta vuoto: nessun barrato NON è un barrato a zero', async () => {
      const { fixture } = await renderStep({
        value: { ...EMPTY_GENERAL, sellingPrice: 100, compareAtPrice: null },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: VAT_22.id,
        pricesIncludeVat: true,
      });
      await fixture.whenStable();

      expect(screen.getByLabelText(/Prezzo barrato/)).toHaveValue(null);
    });
  });

  /**
   * ⭐ Deciso dal proprietario l’11/09/2026: Netti/Ivati è SEMPRE visibile e
   *    selezionabile; un importo ivato digitato senza aliquota nota resta in
   *    attesa nella compilazione — non diventa un netto in silenzio, non si
   *    salva — e quando l’aliquota arriva l’ivato resta fermo.
   *
   * ⛔ Qui c’era «senza aliquota il toggle non compare: non c’è nulla da
   *    scorporare», e l’identità di `toNet` faceva di «100 ivati» un «100 netti».
   */
  describe('Netti/Ivati senza aliquota nota', () => {
    it('il selettore c’è comunque, e la testata dice che i prezzi salvati si leggono al netto', async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [],
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });

      expect(screen.getByLabelText('Modalità dei prezzi in questa sezione')).toBeInTheDocument();
      expect(
        screen.getByText('Senza Codice IVA i prezzi salvati si leggono al netto.'),
      ).toBeInTheDocument();
    });

    it('in Ivati senza Codice IVA l’importo resta in attesa: la frase accanto, il netto fermo', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        // Prezzo Shopify uguale al prezzo articolo: il follow è acceso, e segue in attesa.
        value: { ...EMPTY_GENERAL, sellingPrice: 40, shopifyPrice: 40 },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        shopifyActive: true,
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      const price = screen.getByLabelText('Prezzo di vendita');
      await user.clear(price);
      await user.type(price, '100');

      // La frase sta accanto a OGNI importo in attesa: prezzo articolo e prezzo Shopify.
      expect(screen.getAllByText('Scegli il Codice IVA per salvare il prezzo')).toHaveLength(2);
      const draft = onChange.mock.calls.at(-1)?.[0];
      expect(draft?.pendingGrossPrices).toEqual({ sellingPrice: 100, shopifyPrice: 100 });
      // ⛔ Il netto NON è diventato 100, e non è diventato zero: il campo svuotato
      //    vale `null` (come sempre), e il 100 sta solo in attesa.
      expect(draft?.sellingPrice).not.toBe(100);
      expect(draft?.sellingPrice).not.toBe(0);
    });

    it('scelta successiva dell’aliquota: 100 restano 100 ivati e nasce il netto, senza attesa', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      const price = screen.getByLabelText('Prezzo di vendita');
      await user.clear(price);
      await user.type(price, '100');
      expect(onChange.mock.calls.at(-1)?.[0].pendingGrossPrices?.sellingPrice).toBe(100);

      // L’aliquota arriva (qui dal predefinito aziendale; dal Codice IVA dell’articolo è lo stesso).
      fixture.componentRef.setInput('tenantDefaultVatCodeId', VAT_22.id);
      await fixture.whenStable();

      expect(price).toHaveValue(100);
      const draft = onChange.mock.calls.at(-1)?.[0];
      expect(draft?.pendingGrossPrices).toBeUndefined();
      expect(draft?.sellingPrice).toBeCloseTo(81.967213, 6);
      expect(screen.queryByText('Scegli il Codice IVA per salvare il prezzo')).toBeNull();
    });

    it('un Codice IVA noto ad aliquota zero NON è un codice mancante: 100 ivati sono 100 netti subito', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        value: { ...EMPTY_GENERAL, defaultVatCodeId: VAT_ESENTE.id },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22, VAT_ESENTE],
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      const price = screen.getByLabelText('Prezzo di vendita');
      await user.clear(price);
      await user.type(price, '100');

      const draft = onChange.mock.calls.at(-1)?.[0];
      expect(draft?.sellingPrice).toBe(100);
      expect(draft?.pendingGrossPrices).toBeUndefined();
      expect(screen.queryByText('Scegli il Codice IVA per salvare il prezzo')).toBeNull();
    });

    it('passando ai Netti un importo in attesa diventa il netto, dichiarato dall’operatore', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        value: EMPTY_GENERAL,
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [],
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      const price = screen.getByLabelText('Prezzo di vendita');
      await user.clear(price);
      await user.type(price, '100');
      await user.click(screen.getByRole('button', { name: 'Netti' }));
      await fixture.whenStable();

      const draft = onChange.mock.calls.at(-1)?.[0];
      expect(draft?.sellingPrice).toBe(100);
      expect(draft?.pendingGrossPrices).toBeUndefined();
      expect(price).toHaveValue(100);
    });

    it('i prezzi esistenti restano com’erano: senza aliquota si leggono al netto, e OGNI campo lo dice', async () => {
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        value: { ...EMPTY_GENERAL, sellingPrice: 81.9672, listino1Price: 10 },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [],
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      expect(screen.getByLabelText('Prezzo di vendita')).toHaveValue(81.97);
      expect(screen.getByLabelText('Ingrosso')).toHaveValue(10);
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByText('Scegli il Codice IVA per salvare il prezzo')).toBeNull();
      // ⛔ Un netto sotto «Ivati» non passa per ivato: i due campi valorizzati lo dichiarano,
      //    il barrato vuoto no (non c’è niente da dichiarare).
      expect(
        screen.getAllByText('Importo netto salvato: senza Codice IVA non si converte'),
      ).toHaveLength(2);
    });

    it('caso MISTO: un netto salvato e un ivato in attesa convivono, ognuno col suo cartellino, e alla scelta dell’IVA ognuno conserva il suo', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn<(value: ProductGeneralDraft) => void>();
      const { fixture } = await renderStep({
        value: { ...EMPTY_GENERAL, sellingPrice: 81.9672, listino1Price: 10 },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [VAT_22],
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });
      fixture.componentInstance.valueChange.subscribe(onChange);
      await fixture.whenStable();

      // Si ridigita SOLO il listino, come ivato: 61.
      const listino = screen.getByLabelText('Ingrosso');
      await user.clear(listino);
      await user.type(listino, '61');

      // Prezzo di vendita: netto salvato, dichiarato. Listino: ivato in attesa, dichiarato.
      expect(screen.getByLabelText('Prezzo di vendita')).toHaveValue(81.97);
      expect(
        screen.getAllByText('Importo netto salvato: senza Codice IVA non si converte'),
      ).toHaveLength(1);
      expect(screen.getAllByText('Scegli il Codice IVA per salvare il prezzo')).toHaveLength(1);
      let draft = onChange.mock.calls.at(-1)?.[0];
      expect(draft?.sellingPrice).toBe(81.9672);
      // Il campo ridigitato è stato svuotato prima: il suo netto di prima non c’è più
      // (null, non zero) e il 61 sta in attesa. Il salvataggio è bloccato finché resta così.
      expect(draft?.listino1Price).toBeNull();
      expect(draft?.pendingGrossPrices).toEqual({ listino1Price: 61 });

      // Arriva il 22%: il netto salvato resta 81,9672 (a schermo 100,00 ivati), il 61 resta 61 (50 netti).
      fixture.componentRef.setInput('tenantDefaultVatCodeId', VAT_22.id);
      await fixture.whenStable();

      expect(screen.getByLabelText('Prezzo di vendita')).toHaveValue(100);
      expect(listino).toHaveValue(61);
      draft = onChange.mock.calls.at(-1)?.[0];
      expect(draft?.sellingPrice).toBe(81.9672);
      expect(draft?.listino1Price).toBe(50);
      expect(draft?.pendingGrossPrices).toBeUndefined();
      expect(
        screen.queryByText('Importo netto salvato: senza Codice IVA non si converte'),
      ).toBeNull();
      expect(screen.queryByText('Scegli il Codice IVA per salvare il prezzo')).toBeNull();
    });

    it('gli importi in attesa arrivano dal draft: sopravvivono al cambio di scheda', async () => {
      await renderStep({
        value: { ...EMPTY_GENERAL, pendingGrossPrices: { listino1Price: 61 } },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [],
        tenantDefaultVatCodeId: null,
        pricesIncludeVat: true,
      });

      expect(screen.getByLabelText('Ingrosso')).toHaveValue(61);
      expect(screen.getByText('Scegli il Codice IVA per salvare il prezzo')).toBeInTheDocument();
    });

    it('Codici IVA NON caricati: la frase lo dice, e il Codice IVA dell’articolo non si tocca', async () => {
      const user = userEvent.setup();
      await renderStep({
        value: { ...EMPTY_GENERAL, defaultVatCodeId: VAT_22.id },
        listinoSlots: LISTINO_SLOTS,
        vatCodes: [],
        vatCodesUnavailable: true,
        tenantDefaultVatCodeId: VAT_22.id,
        pricesIncludeVat: true,
      });

      const price = screen.getByLabelText('Prezzo di vendita');
      await user.clear(price);
      await user.type(price, '100');

      expect(
        screen.getByText('Codici IVA non caricati: il prezzo ivato resta in attesa'),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Codice IVA del prodotto')).toBeDisabled();
    });
  });
  /*
    ⛔ Un tenant senza Shopify non vede alcuna logica del canale (docs/24 §1.8).
    Prima la checkbox compariva a tutti: prometteva un canale che non c'era.
  */
  describe('«Sincronizza con Shopify» esiste solo dove esiste il canale', () => {
    it("senza Shopify la checkbox non c'è", async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        categories: [],
        shopifyConnected: false,
        shopifyActive: false,
      });

      expect(screen.queryByLabelText('Sincronizza con Shopify')).toBeNull();
    });

    it("con Shopify attivo la checkbox c'è", async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        categories: [],
        shopifyConnected: true,
        shopifyActive: true,
      });

      expect(screen.getByLabelText('Sincronizza con Shopify')).toBeTruthy();
    });

    // ⭐ «Nome Shopify»: due campi perché servono due nomi — quello breve per il
    //    magazzino e quello con cui il prodotto si vende (docs/24 §1.9).
    it('senza Shopify il «Nome Shopify» non esiste: sarebbe un campo senza destinazione', async () => {
      await renderStep({
        value: EMPTY_GENERAL,
        categories: [],
        shopifyConnected: false,
        shopifyActive: false,
      });

      expect(screen.queryByLabelText(/Nome Shopify/)).toBeNull();
    });

    it('⭐ «Copia nome VestiFlow» riallinea i due nomi su richiesta, non da solo', async () => {
      const user = userEvent.setup();
      const { fixture } = await renderStep({
        value: { ...EMPTY_GENERAL, name: 'MAGL-COT-BLU' },
        categories: [],
        shopifyConnected: true,
        shopifyActive: true,
      });

      // Nasce vuoto e nessuno lo riempie: lo decide la prima sincronizzazione.
      expect(screen.getByLabelText<HTMLInputElement>(/Nome Shopify/).value).toBe('');

      await user.click(screen.getByRole('button', { name: 'Copia nome VestiFlow' }));
      fixture.detectChanges();

      expect(screen.getByLabelText<HTMLInputElement>(/Nome Shopify/).value).toBe('MAGL-COT-BLU');
    });

    // ⭐ «Tipo prodotto Shopify» e «Categoria» sono DUE campi, e per questo
    //    devono essere due caselle: fino all’11/09/2026 erano una sola, e
    //    l’operatore non poteva sapere quale dei due stava scrivendo
    //    (docs/24 §9.5).
    it('senza Shopify il «Tipo prodotto Shopify» non esiste, la Categoria sì', async () => {
      const { container } = await renderStep({
        value: EMPTY_GENERAL,
        categories: [],
        shopifyConnected: false,
        shopifyActive: false,
      });

      expect(screen.queryByLabelText(/Tipo prodotto Shopify/)).toBeNull();
      // ⛔ La categoria interna resta: non è un campo del canale, e senza
      //    Shopify serve comunque a chi lavora in magazzino.
      expect(container.querySelector('#product-category')).toBeTruthy();
    });

    it('⭐ con Shopify sono due caselle distinte, e portano valori diversi', async () => {
      const { container } = await renderStep({
        value: {
          ...EMPTY_GENERAL,
          category: 'Abbigliamento donna',
          shopifyProductType: 'Maglieria',
        },
        categories: [],
        shopifyConnected: true,
        shopifyActive: true,
      });

      expect(screen.getByLabelText<HTMLInputElement>(/Tipo prodotto Shopify/).value).toBe(
        'Maglieria',
      );
      expect(container.querySelector<HTMLInputElement>('#product-category')?.value).toBe(
        'Abbigliamento donna',
      );
    });

    it('⭐ e si modifica: è il lato VestiFlow→Shopify della direzione', async () => {
      // ⚠️ Senza questa casella il campo sarebbe importato e rispedito
      //    identico: un’eco, non una direzione.
      const user = userEvent.setup();
      const { fixture, container } = await renderStep({
        value: EMPTY_GENERAL,
        categories: [],
        shopifyConnected: true,
        shopifyActive: true,
      });

      const casella = screen.getByLabelText<HTMLInputElement>(/Tipo prodotto Shopify/);
      expect(casella.value).toBe('');

      await user.type(casella, 'Maglieria');
      fixture.detectChanges();

      expect(casella.value).toBe('Maglieria');
      // ⛔ E la categoria interna non si è mossa di un carattere.
      expect(container.querySelector<HTMLInputElement>('#product-category')?.value).toBe('');
    });
  });
});
