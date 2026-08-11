import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@core/auth';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of, throwError } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AppErrorKind } from '@core/models/app-error.model';
import { SupplierOrderStatus } from '@core/models/supplier-order.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { VatCodeService } from '@core/services/vat-code.service';
import { ProductService } from '@domain/products/services/product.service';

import { SupplierOrderFormComponent } from './supplier-order-form.component';
import { SupplierOrderService } from '@domain/supplier-orders/services/supplier-order.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { signal } from '@angular/core';

const SUPPLIERS = [
  { id: 'sup-1', tenantId: 't1', name: 'Tessuti Italia', email: null, phone: null },
];
const VARIANTS = [
  {
    variantId: 'var-1',
    productId: 'prod-1',
    productName: 'Maglietta',
    title: 'Maglietta / M / Rosso',
    sku: 'MAG-M-ROSSO',
  },
];

function tableColumnPreferenceMock() {
  const defaultState = {
    presetId: 'default' as const,
    columnOrder: ['product', 'quantity', 'unitCost', 'discount', 'vat', 'lineTotal', 'actions'],
    hiddenColumnIds: [] as string[],
    pinnedColumnIds: [] as string[],
    columnWidths: {} as Record<string, number>,
  };
  const stateSignal = signal(defaultState);
  return {
    registerView: vi.fn(),
    isColumnVisible: vi.fn(
      (_view: unknown, columnId: string) => !defaultState.hiddenColumnIds.includes(columnId),
    ),
    columnWidth: vi.fn((_view: unknown, _id: string, fallback: number) => fallback),
    setColumnWidth: vi.fn(),
    state: vi.fn(() => stateSignal.asReadonly()),
    columnDefs: vi.fn(() => []),
    presetMap: vi.fn(() => ({})),
    visibleColumns: vi.fn(() => () => []),
    visibleColumnIds: vi.fn(() => defaultState.columnOrder),
    applyPreset: vi.fn(),
    toggleColumn: vi.fn(),
    moveColumn: vi.fn(),
    togglePin: vi.fn(),
    resetToDefault: vi.fn(),
  };
}

const VAT_22 = {
  id: 'vat-22',
  code: '22',
  description: 'Aliquota ordinaria',
  ratePercent: 22,
  nonDeductiblePercent: 0,
  calculationMode: 'standard',
  vatAffectsSupplierTotal: true,
  isActive: true,
  isDefault: true,
  usageScope: 'both',
};

describe('SupplierOrderFormComponent', () => {
  // jsdom non implementa <dialog>: senza questo, aprire il dialogo di sblocco
  // esplode con «showModal is not a function». È un limite dell'ambiente di
  // prova, non del componente.
  beforeAll(() => {
    const proto = globalThis.HTMLDialogElement?.prototype;
    if (proto && !proto.showModal) {
      proto.showModal = function showModal(this: HTMLDialogElement) {
        this.open = true;
      };
      proto.close = function close(this: HTMLDialogElement) {
        this.open = false;
      };
    }
  });

  async function setup(options?: { createFails?: boolean; vatCodes?: readonly unknown[] }) {
    const createOrder = options?.createFails
      ? vi.fn(() =>
          throwError(() => ({
            kind: AppErrorKind.Server,
            message: 'Errore del server. Riprova più tardi.',
          })),
        )
      : vi.fn(() => of({ id: 'po-1', status: SupplierOrderStatus.Confirmed }));

    const { fixture } = await render(SupplierOrderFormComponent, {
      providers: [
        // Nessun permesso costi: il selettore articolo non deve mostrare il costo.
        { provide: AuthService, useValue: { currentUser: () => null } },
        // Catch-all: il test «ritorno alla lista» naviga davvero verso /app/orders.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: SupplierService,
          useValue: {
            getSuppliers: () => of(SUPPLIERS),
            createSupplier: vi.fn(),
          },
        },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: (query?: { search?: string }) =>
              query?.search && query.search.length >= 2 ? of(VARIANTS) : of([]),
          },
        },
        {
          provide: SupplierOrderService,
          useValue: {
            createOrder,
            getMeta: () => of({ nextReferencePreview: 'OF-2026-0042' }),
          },
        },
        // Modalità costi iniziale del nuovo ordine: preferenza operatore per tipo.
        {
          provide: DocumentService,
          useValue: { getPriceModePreference: () => of(false) },
        },
        {
          provide: TableColumnPreferenceService,
          useValue: tableColumnPreferenceMock(),
        },
        {
          provide: VatCodeService,
          useValue: { list: () => of(options?.vatCodes ?? []) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([]) },
        },
      ],
    });

    return { fixture, createOrder };
  }

  it('mostra l’anteprima della numerazione dai Numeratori', async () => {
    await setup();

    expect(await screen.findByText('OF-2026-0042')).toBeVisible();
  });

  it('mostra errori di validazione al submit senza dati obbligatori', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    expect(await screen.findByText('Seleziona un fornitore.')).toBeVisible();
  });

  it('consente di aggiungere una riga ordine', async () => {
    const user = userEvent.setup();
    await setup();

    const rowsBefore = screen.getAllByRole('button', { name: 'Rimuovi riga' }).length;
    await user.click(screen.getByRole('button', { name: 'Aggiungi riga' }));

    expect(screen.getAllByRole('button', { name: 'Rimuovi riga' })).toHaveLength(rowsBefore + 1);
  });

  it('permette lo switch costi netto/ivato dall’intestazione colonna', async () => {
    const user = userEvent.setup();
    await setup();

    expect(screen.getByText('Costo netto')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Modalità costi del documento' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Usa costi ivati' }));

    expect(screen.getByText('Costo ivato')).toBeVisible();
  });

  it('protegge l’uscita con modifiche non salvate (chip indietro → dialogo)', async () => {
    const user = userEvent.setup();
    await setup();

    const qtyInput = screen.getByRole('spinbutton');
    await user.clear(qtyInput);
    await user.type(qtyInput, '3');

    await user.click(screen.getByRole('button', { name: 'Indietro' }));

    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Modifiche non salvate')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Chiudi senza salvare' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Salva e chiudi' })).toBeVisible();
  });

  it('senza modifiche il ritorno alla lista non chiede conferma', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole('button', { name: 'Indietro' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mostra errore inline quando il salvataggio fallisce', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ createFails: true });

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await user.click(screen.getAllByRole('button', { name: 'Articolo' })[0]!);
    await user.type(screen.getByLabelText('Cerca articolo per prodotto o SKU'), 'mag');
    await user.click(
      await screen.findByRole('option', { name: 'Maglietta / M / Rosso, SKU MAG-M-ROSSO' }),
    );

    const qtyInput = screen.getByRole('spinbutton');
    await user.clear(qtyInput);
    await user.type(qtyInput, '2');
    const costInput = screen.getByPlaceholderText('0,00');
    await user.clear(costInput);
    await user.type(costInput, '12,50');

    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'sup-1',
        costEntryMode: 'vat_excluded',
        lines: [
          expect.objectContaining({
            variantId: 'var-1',
            orderedQuantity: 2,
            enteredUnitCostMinor: 1250,
          }),
        ],
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore del server');
  });

  // ── Il ciclo del blocco su un ordine già registrato ────────────────────────
  //
  // Apre protetto → si sblocca → si modifica → si salva → torna protetto, senza
  // mai uscire dal documento. È il giro che a mano sembrava a posto due volte
  // mentre non lo era: la prima perché il blocco non si agganciava, la seconda
  // perché non si richiudeva mai dopo il primo sblocco.
  async function setupEdit() {
    const updateOrder = vi.fn(() => of({ id: 'po-1', status: SupplierOrderStatus.Confirmed }));
    const ordine = {
      id: 'po-1',
      reference: 'OF-2026-0001',
      supplierId: 'sup-1',
      supplierName: 'Tessuti Italia',
      status: SupplierOrderStatus.Confirmed,
      currency: 'EUR',
      costEntryMode: 'vat_excluded' as const,
      orderDate: '2026-08-01T00:00:00.000Z',
      lines: [
        {
          id: 'l-1',
          variantId: 'var-1',
          sku: 'MAG-M-ROSSO',
          description: 'Maglietta',
          orderedQuantity: 2,
          receivedQuantity: 0,
          unitCost: { amountMinor: 1250, currencyCode: 'EUR' as const },
          enteredUnitCost: { amountMinor: 1250, currencyCode: 'EUR' as const },
          discountPercent: 0,
          lineTotal: { amountMinor: 2500, currencyCode: 'EUR' as const },
        },
      ],
      subtotal: { amountMinor: 2500, currencyCode: 'EUR' as const },
      tax: { amountMinor: 0, currencyCode: 'EUR' as const },
      totalAmount: { amountMinor: 2500, currencyCode: 'EUR' as const },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };

    await render(SupplierOrderFormComponent, {
      providers: [
        { provide: AuthService, useValue: { currentUser: () => null } },
        provideRouter([{ path: '**', children: [] }]),
        // Rotta /:id/edit: è l'id a far entrare la maschera in modifica.
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: 'po-1' })) },
        },
        {
          provide: SupplierService,
          useValue: { getSuppliers: () => of(SUPPLIERS), createSupplier: vi.fn() },
        },
        { provide: ProductService, useValue: { searchVariantSummaries: () => of(VARIANTS) } },
        {
          provide: SupplierOrderService,
          useValue: {
            getSupplierOrderById: () => of(ordine),
            updateOrder,
            createOrder: vi.fn(),
            getMeta: () => of({ nextReferencePreview: 'OF-2026-0042' }),
          },
        },
        { provide: DocumentService, useValue: { getPriceModePreference: () => of(false) } },
        { provide: TableColumnPreferenceService, useValue: tableColumnPreferenceMock() },
        { provide: VatCodeService, useValue: { list: () => of([]) } },
        { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
      ],
    });

    return { updateOrder };
  }

  it('un ordine registrato si apre protetto', async () => {
    await setupEdit();

    expect(await screen.findByRole('button', { name: /Sblocca/ })).toBeVisible();
    // Protetto = form disabilitato: non si digita a vuoto.
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });

  // TODO(blocco documenti): manca il resto del giro — sblocca, modifica, salva,
  // torna protetto. Il test è stato scritto e NON passa nell'ambiente di prova:
  // il dialogo di sblocco usa <dialog>, che jsdom non implementa, e il polyfill
  // qui sopra non basta a farlo arrivare in fondo. Va ripreso decidendo se
  // pilotare il dialogo o esercitare direttamente confirmUnlockEdit(): è la
  // verifica che manca, e va fatta prima di migrare Arrivo merce e Ordine
  // cliente, che hanno lo stesso giro.

  // ── Salvare non è uscire ───────────────────────────────────────────────────
  //
  // Dopo il primo salvataggio si RESTA nel documento: cambia solo l'URL, da
  // /new a /:id/edit, così un ricaricamento non perde il documento e un secondo
  // salvataggio aggiorna invece di crearne un altro. Prima portava al dettaglio
  // in sola lettura, cioè buttava fuori l'operatore da quello che stava
  // scrivendo — ed è lo stesso pattern dell'Ordine cliente.
  it('dopo il salvataggio resta nel documento, su /:id/edit', async () => {
    const user = userEvent.setup();
    await setup({ vatCodes: [VAT_22] });
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await user.click(screen.getAllByRole('button', { name: 'Articolo' })[0]!);
    await user.type(screen.getByLabelText('Cerca articolo per prodotto o SKU'), 'mag');
    await user.click(
      await screen.findByRole('option', { name: 'Maglietta / M / Rosso, SKU MAG-M-ROSSO' }),
    );

    const cost = screen.getByPlaceholderText('0,00');
    await user.clear(cost);
    await user.type(cost, '12,50');

    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    expect(navigate).toHaveBeenCalledWith(
      ['/app/orders', 'po-1', 'edit'],
      expect.objectContaining({ replaceUrl: true }),
    );
  });

  // ── Il salvataggio non fallisce mai in silenzio ────────────────────────────
  //
  // Il pulsante marcava i campi e usciva zitto quando il form era invalido:
  // all'operatore non succedeva letteralmente NULLA. E con le colonne che
  // scorrono in orizzontale il campo incriminato può stare fuori schermo,
  // quindi non c'era nemmeno modo di capire da soli cosa mancasse.
  it('dice cosa manca invece di non fare nulla, e nomina la riga', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup();

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await user.click(screen.getAllByRole('button', { name: 'Articolo' })[0]!);
    await user.type(screen.getByLabelText('Cerca articolo per prodotto o SKU'), 'mag');
    await user.click(
      await screen.findByRole('option', { name: 'Maglietta / M / Rosso, SKU MAG-M-ROSSO' }),
    );

    // L'articolo di prova non ha costo d'anagrafica: la riga resta senza costo.
    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Riga 1');
    expect(screen.getByRole('alert')).toHaveTextContent('costo');
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('senza fornitore lo dice, invece di restare muto', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup();

    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('fornitore');
    expect(createOrder).not.toHaveBeenCalled();
  });

  // ── Il selettore netto/ivato cambia la VISTA, non il valore ────────────────
  //
  // Prima non convertiva affatto: cambiava il significato del numero senza
  // cambiare il numero. Lo stesso «5,02» passava da lordo a netto e l'ordine
  // valeva d'improvviso il 22% in meno, senza che nulla si muovesse a schermo.
  //
  // La correzione non è «convertire il valore mostrato» — quella perde il
  // centesimo nel 18% dei costi al 22%. È tenere il netto canonico in memoria e
  // ridisegnare il campo: passando avanti e indietro il numero non si muove
  // perché non viene mai ricostruito da ciò che si vede.
  async function switchCostMode(user: ReturnType<typeof userEvent.setup>, label: string) {
    await user.click(screen.getByRole('button', { name: 'Modalità costi del documento' }));
    await user.click(await screen.findByRole('menuitemradio', { name: label }));
  }

  it('il giro ivato → netto → ivato rimette lo stesso costo ivato', async () => {
    const user = userEvent.setup();
    await setup({ vatCodes: [VAT_22] });

    // Serve un articolo sulla riga: è il richiamo a portarle il Codice IVA, e
    // senza aliquota non c'è nessuno scorporo da fare.
    await user.click(screen.getAllByRole('button', { name: 'Articolo' })[0]!);
    await user.type(screen.getByLabelText('Cerca articolo per prodotto o SKU'), 'mag');
    await user.click(
      await screen.findByRole('option', { name: 'Maglietta / M / Rosso, SKU MAG-M-ROSSO' }),
    );

    await switchCostMode(user, 'Usa costi ivati');

    const cost = screen.getByPlaceholderText('0,00');
    await user.clear(cost);
    // 5,02 al 22% è uno dei costi che il giro arrotondato perdeva: il netto
    // vale 411,4754 centesimi, e chi lo arrotondava a 411 tornava a 5,01.
    await user.type(cost, '5,02');

    await switchCostMode(user, 'Usa costi netti');
    expect(cost).toHaveValue('4,11');

    await switchCostMode(user, 'Usa costi ivati');
    expect(cost).toHaveValue('5,02');
  });

  it('al salvataggio manda il costo esatto, non i due decimali che si leggono', async () => {
    const user = userEvent.setup();
    const { createOrder } = await setup({ vatCodes: [VAT_22] });

    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'Tessuti Italia' }));

    await user.click(screen.getAllByRole('button', { name: 'Articolo' })[0]!);
    await user.type(screen.getByLabelText('Cerca articolo per prodotto o SKU'), 'mag');
    await user.click(
      await screen.findByRole('option', { name: 'Maglietta / M / Rosso, SKU MAG-M-ROSSO' }),
    );

    await switchCostMode(user, 'Usa costi ivati');
    const cost = screen.getByPlaceholderText('0,00');
    await user.clear(cost);
    await user.type(cost, '5,02');

    await user.click(screen.getByRole('button', { name: 'Salva ordine' }));

    // Il valore parte esatto: è il server a rifare lo scorporo e a ottenere lo
    // stesso netto. Mandare «502» arrotondato funzionerebbe qui e si romperebbe
    // appena l'operatore passa a netto prima di salvare.
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        costEntryMode: 'vat_included',
        lines: [expect.objectContaining({ enteredUnitCostMinor: 502 })],
      }),
    );
  });

  /**
   * Il giro del fuoco, innestato sul punto unico. Chiude tre difetti che questa
   * maschera aveva e le gemelle no.
   */
  describe('il giro del fuoco', () => {
    interface FocusForm {
      readonly lineFocus: {
        fieldsOf: (i: number) => readonly string[];
        rowDown: (i: number, field: string) => void;
      };
      readonly lines: {
        length: number;
        at: (i: number) => { controls: Record<string, { setValue: (v: unknown) => void }> };
      };
      readonly form: { controls: Record<string, { setValue: (v: unknown) => void }> };
    }

    async function apriForm() {
      const { fixture } = await setup({ vatCodes: [VAT_22] });
      return fixture.componentInstance as unknown as FocusForm;
    }

    // Difetto: «product» era nel giro e puntava a `po-product-{i}`,
    // identificativo che non esiste in nessun template — quella cella è un
    // `app-select-menu`. Da «Cod. fornitore» il fuoco si perdeva a metà giro.
    it('«Nome prodotto» non è nel giro: non ha un campo su cui atterrare', async () => {
      const form = await apriForm();

      expect(form.lineFocus.fieldsOf(0)).not.toContain('product');
    });

    // Difetto: U.M. e sconto erano nel giro ma senza gestore di tastiera —
    // due gestori per nove campi. Ora ci sono, e il giro li attraversa.
    it('U.M. e sconto sono attraversabili', async () => {
      const form = await apriForm();

      expect(form.lineFocus.fieldsOf(0)).toEqual(
        expect.arrayContaining(['unitOfMeasure', 'discount']),
      );
    });

    // Difetto: `advanceToNextLine` non guardava la sola-lettura, e questa
    // maschera non ha nemmeno il `<fieldset [disabled]>` delle altre due: su
    // documento bloccato il Tab AGGIUNGEVA righe.
    it('su documento bloccato non si creano righe', async () => {
      const form = await apriForm();
      const righePrima = form.lines.length;
      (form as unknown as { formReadOnly: () => boolean }).formReadOnly = () => true;

      form.lineFocus.rowDown(righePrima - 1, 'quantity');

      expect(form.lines.length).toBe(righePrima);
    });

    // Voce 9 del contratto, che qui NON esisteva: «riga vuota» in Ordine
    // fornitore significa nessun articolo selezionato. Senza, tenere premuto ↓
    // impilerebbe righe vuote in fondo.
    it('↓ in fondo non crea righe se l’articolo non c’è', async () => {
      const form = await apriForm();
      const righePrima = form.lines.length;

      form.lineFocus.rowDown(righePrima - 1, 'quantity');

      expect(form.lines.length).toBe(righePrima);
    });
  });

  /**
   * Conferma di un codice: gli esiti sono TRE, non due.
   *
   * Qui il caso ambiguo è quello che capita davvero. Il codice fornitore non è
   * unico — fornitori diversi possono usare lo stesso codice per articoli
   * diversi — e fino a 08/2026 questa maschera lo risolveva con
   * `resolveVariantIdByCode`, che restituisce `string | null`: due candidati
   * tornavano `null`, cioè il codice giusto si comportava come inesistente.
   */
  describe('conferma dei codici', () => {
    function variante(overrides: Record<string, unknown>) {
      return {
        articleCode: 'ART-1',
        productName: 'Maglietta',
        title: 'Maglietta',
        sku: 'MAG-M',
        sellingPrice: { amountMinor: 1000, currencyCode: 'EUR' },
        ...overrides,
      };
    }

    interface CodeForm {
      readonly commitCodeLookup: (index: number, field: string) => void;
      readonly codeLookup: {
        readonly isOpenOn: (index: number, field: string) => boolean;
        readonly matches: () => readonly { readonly variantId: string }[];
      };
      readonly lines: {
        at: (i: number) => {
          controls: Record<string, { setValue: (v: unknown) => void; value: unknown }>;
        };
      };
    }

    /**
     * `catalogo` è cosa risponde la RICERCA (query con `search`): lì il codice
     * fornitore restituito è quello che ha fatto scattare la ricerca.
     * `perVariante` è cosa risponde il caricamento per id, che il form fa dopo
     * per riempire la riga: lì nessuna ricerca ha scelto un collegamento, e il
     * codice restituito è il primo in ordine deterministico — quello di un
     * fornitore qualsiasi. Sono due risposte diverse per lo stesso articolo, ed
     * è da questa differenza che nasce il difetto: mockarle uguali lo nasconde.
     */
    async function apri(
      catalogo: readonly Record<string, unknown>[],
      perVariante?: readonly Record<string, unknown>[],
    ) {
      const { fixture } = await render(SupplierOrderFormComponent, {
        providers: [
          { provide: AuthService, useValue: { currentUser: () => null } },
          provideRouter([{ path: '**', children: [] }]),
          {
            provide: SupplierService,
            useValue: { getSuppliers: () => of(SUPPLIERS), createSupplier: vi.fn() },
          },
          {
            provide: ProductService,
            useValue: {
              searchVariantSummaries: (query?: { search?: string }) =>
                of(query?.search ? catalogo : (perVariante ?? catalogo)),
              // L'endpoint per codice tace sui casi ambigui: non deve essere
              // la strada che salva il test.
              findVariantByCode: () => throwError(() => new Error('404')),
            },
          },
          {
            provide: SupplierOrderService,
            useValue: {
              createOrder: vi.fn(),
              getMeta: () => of({ nextReferencePreview: 'OF-2026-0042' }),
            },
          },
          { provide: DocumentService, useValue: { getPriceModePreference: () => of(false) } },
          { provide: TableColumnPreferenceService, useValue: tableColumnPreferenceMock() },
          { provide: VatCodeService, useValue: { list: () => of([]) } },
          { provide: PaymentOptionsService, useValue: { list: () => of([]) } },
        ],
      });
      return fixture.componentInstance as unknown as CodeForm;
    }

    it('un codice fornitore condiviso da due articoli apre la scelta', async () => {
      const form = await apri([
        variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-100' }),
        variante({ variantId: 'var-2', productId: 'prod-2', supplierSku: 'F-100' }),
      ]);
      form.lines.at(0).controls['supplierCode']!.setValue('F-100');

      form.commitCodeLookup(0, 'supplierCode');

      expect(form.codeLookup.isOpenOn(0, 'supplierCode')).toBe(true);
      expect(form.codeLookup.matches().map((row) => row.variantId)).toEqual(['var-1', 'var-2']);
    });

    // Il controllo inverso: senza, la prova qui sopra passerebbe anche se la
    // scelta si aprisse sempre, pure con un solo articolo.
    it('un codice fornitore di un solo articolo aggancia la riga', async () => {
      const form = await apri([
        variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-100' }),
      ]);
      form.lines.at(0).controls['supplierCode']!.setValue('F-100');

      form.commitCodeLookup(0, 'supplierCode');

      expect(form.codeLookup.isOpenOn(0, 'supplierCode')).toBe(false);
      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
    });

    // Il riepilogo porta il codice del PRIMO collegamento in ordine
    // deterministico, che può essere di un altro fornitore: l'operatore
    // digitava F-100 e nel campo si ritrovava F-999, mai scritto da lui.
    it('agganciando da Cod. fornitore resta il codice digitato, non quello del riepilogo', async () => {
      const form = await apri(
        // La ricerca per «F-100» trova l'articolo e riporta il codice che ha
        // corrisposto…
        [variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-100' })],
        // …ma il caricamento per id, che riempie la riga, riporta il primo
        // collegamento: quello di un altro fornitore.
        [variante({ variantId: 'var-1', productId: 'prod-1', supplierSku: 'F-999' })],
      );
      form.lines.at(0).controls['supplierCode']!.setValue('F-100');

      form.commitCodeLookup(0, 'supplierCode');

      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
      expect(form.lines.at(0).controls['supplierCode']!.value).toBe('F-100');
    });

    // Il controllo inverso del precedente: agganciando per SKU non esiste un
    // «codice con cui hai agganciato», e il campo NON va riempito col codice di
    // un fornitore qualsiasi. Vuoto è la risposta giusta.
    it('agganciando per SKU il Cod. fornitore resta vuoto invece che arbitrario', async () => {
      const form = await apri([
        variante({ variantId: 'var-1', productId: 'prod-1', sku: 'MAG-M', supplierSku: 'F-999' }),
      ]);
      form.lines.at(0).controls['sku']!.setValue('MAG-M');

      form.commitCodeLookup(0, 'sku');

      expect(form.lines.at(0).controls['variantId']!.value).toBe('var-1');
      expect(form.lines.at(0).controls['supplierCode']!.value).toBe('');
    });
  });
});
