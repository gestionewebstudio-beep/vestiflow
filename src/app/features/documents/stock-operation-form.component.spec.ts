import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { AdjustmentDirection, DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import type { TenantPermissionKey } from '@core/models/tenant-permission.model';
import { UserRole } from '@core/models/user.model';
import { ToastService } from '@core/services/toast.service';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { TestBed } from '@angular/core/testing';
import { ProductService } from '@domain/products/services/product.service';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import { StockOperationFormComponent } from './stock-operation-form.component';

const LOCATIONS = [{ id: 'loc-1', name: 'Milano' }];

function operationalLocationsMock() {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    defaultLocation: () => LOCATIONS[0],
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
}

/** Operatore non titolare: conta solo l'elenco permessi, mai il ruolo. */
function clerkWith(permissions: readonly TenantPermissionKey[]) {
  return { role: UserRole.Clerk, permissions: [...permissions] };
}

const ZERO_MONEY = { amountMinor: 0, currencyCode: DEFAULT_CURRENCY };

/**
 * Rettifica già confermata, con il numero 42 assegnato. È il documento su cui
 * si verifica cosa la maschera rimanda al server: caricato così, il controllo
 * del numero è pristine — il valore non l'ha scritto l'operatore.
 */
const CONFIRMED_ADJUSTMENT: DocumentRecord = {
  id: 'doc-1',
  tenantId: 'ten-1',
  createdAt: '2026-08-10T08:00:00.000Z',
  updatedAt: '2026-08-10T08:00:00.000Z',
  type: DocumentType.Adjustment,
  status: DocumentStatus.Confirmed,
  series: '',
  number: 42,
  year: 2026,
  documentDate: '2026-08-10',
  currency: DEFAULT_CURRENCY,
  subtotal: ZERO_MONEY,
  tax: ZERO_MONEY,
  total: ZERO_MONEY,
  pricesIncludeVat: false,
  createdByName: 'Operatore',
  locationId: 'loc-1',
  adjustmentDirection: AdjustmentDirection.Increase,
  internalComment: 'Riscontro inventario',
  lines: [
    {
      id: 'line-1',
      lineNumber: 1,
      variantId: 'var-1',
      sku: 'SKU-1',
      description: 'Maglietta · M',
      quantity: 2,
      unitPrice: ZERO_MONEY,
      discountPercent: 0,
      lineTotal: ZERO_MONEY,
      loadsStock: true,
    },
  ],
};

interface SetupOptions {
  /** Id in rotta: presente = modifica di un documento esistente. */
  readonly documentId?: string;
  /** Numero che il server assegna davvero (diverso = l'ha preso un altro). */
  readonly assignedNumber?: number;
  /** Primo numero libero proposto dal contatore predefinito (documento nuovo). */
  readonly proposedNumber?: number;
  /** Permessi dell'operatore: decidono quali comandi la maschera mostra. */
  readonly permissions?: readonly TenantPermissionKey[];
  /**
   * Catalogo che l'anagrafica restituisce.
   *
   * ⚠️ Serve a distinguere le due fonti di un dato di riga: con il catalogo
   * vuoto (il default) una prova non saprebbe dire se il valore mostrato viene
   * dal documento o dall'anagrafica, perché l'anagrafica non direbbe nulla.
   */
  readonly catalogo?: readonly VariantSummary[];
}

describe('StockOperationFormComponent', () => {
  // jsdom non implementa <dialog>: senza questo, lo sblocco del documento
  // confermato esplode con «showModal is not a function». È un limite
  // dell'ambiente di prova, non del componente.
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

  async function setup(options: SetupOptions = {}) {
    const proposedNumber = options.proposedNumber ?? null;
    const counters =
      proposedNumber === null
        ? []
        : [
            {
              id: 'cnt-1',
              type: DocumentType.Adjustment,
              series: null,
              locationId: null,
              locationName: null,
              isDefault: true,
              nextNumber: proposedNumber,
              documentCount: 0,
            },
          ];
    // Il corpo arriva tipizzato `unknown`: i test lo ispezionano da sé, e
    // dichiararlo qui legherebbe lo stub alla forma del body.
    const saveAdjustment = vi.fn((_body: unknown) =>
      of({ id: 'doc-1', number: options.assignedNumber ?? CONFIRMED_ADJUSTMENT.number }),
    );
    const createDocument = vi.fn((_body: unknown) =>
      of({ id: 'doc-1', number: options.assignedNumber ?? proposedNumber ?? 1 }),
    );
    const toast = { showInfo: vi.fn(), showError: vi.fn() };

    const view = await render(StockOperationFormComponent, {
      providers: [
        // Serve da quando le righe usano il sistema condiviso delle colonne:
        // TableColumnPreferenceService costruisce l'API delle preferenze, che
        // legge la configurazione dell'app.
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
          provide: DocumentCountersService,
          useValue: {
            available: () =>
              of({ counters, proposedCounterId: counters.length > 0 ? 'cnt-1' : null }),
          },
        },
        // Elenco permessi vuoto per default: nessun permesso costi, quindi il
        // selettore articolo non deve mostrare il costo. Chi prova un comando
        // riservato se li passa esplicitamente.
        {
          provide: AuthService,
          useValue: { currentUser: () => clerkWith(options.permissions ?? []) },
        },
        // Catch-all: dopo il salvataggio la maschera naviga davvero al dettaglio.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { stockDocumentType: DocumentType.Adjustment },
              queryParamMap: convertToParamMap({}),
            },
            paramMap: of(convertToParamMap(options.documentId ? { id: options.documentId } : {})),
            data: of({ stockDocumentType: DocumentType.Adjustment }),
          },
        },
        { provide: OperationalLocationsService, useValue: operationalLocationsMock() },
        {
          provide: ProductService,
          useValue: {
            searchVariantSummaries: (params?: { readonly variantId?: string }) => {
              const catalogo = options.catalogo ?? [];
              return of(
                params?.variantId
                  ? catalogo.filter((row) => row.variantId === params.variantId)
                  : [...catalogo],
              );
            },
          },
        },
        // Tipi documento della controparte: li chiede il blocco condiviso in
        // testata, che senza un HttpClient nel test non arriverebbe in fondo.
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        { provide: ToastService, useValue: toast },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(() => of(CONFIRMED_ADJUSTMENT)),
            // Controllo cronologico (§4): serie in ordine, nessun avviso.
            checkChronology: () => of({ conflicts: [], dismissed: false }),
            dismissChronologyWarning: () => of(void 0),
            saveAdjustment,
            createDocument,
            updateDocument: vi.fn(),
            confirmDocument: vi.fn(),
          },
        },
      ],
    });

    return {
      saveAdjustment,
      createDocument,
      toast,
      form: view.fixture.componentInstance,
    };
  }

  /** Un confermato si apre protetto: sbloccare è il gesto che precede l'edit. */
  async function unlock(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole('button', { name: 'Sblocca modifica' }));
    await user.click(screen.getByRole('button', { name: 'Sblocca e modifica' }));
  }

  /** Salva la rettifica confermata: nessun dialogo, il submit è diretto. */
  async function save(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getAllByRole('button', { name: 'Salva documento' })[0]!);
  }

  /**
   * Il campo Numero della testata. ⛔ Qui c’era `getAllByLabelText(…)[0]`, col
   * commento «desktop e pannello mobile convivono»: la doppia scrittura della
   * testata era diventata un requisito della prova. Ora la testata si dichiara
   * una volta e il campo è uno solo — se ne ricomparissero due, `getByLabelText`
   * fallirebbe, che è esattamente quello che deve fare.
   */
  function numberInput(): HTMLInputElement {
    return screen.getByLabelText<HTMLInputElement>('Numero');
  }

  // ── Numero proposto vs numero imposto ───────────────────────────────────────
  //
  // Il numero in testata è il primo libero: mostrarlo aiuta, rimandarlo al
  // server no. Se torna indietro diventa un'imposizione, e il secondo operatore
  // si becca un conflitto per un numero che gli aveva proposto la maschera.
  // Il caso «documento nuovo, numero non toccato → non si manda» è coperto dallo
  // spec del Documento di vendita, che sa portare un documento nuovo fino al
  // salvataggio. Qui si guarda l'altra faccia della regola, che è quella che
  // sfugge: su un documento GIÀ SALVATO il numero non è una proposta ed esce
  // sempre. Un gate nudo su `dirty` lo ometterebbe, e dopo un cambio di serie il
  // documento resterebbe con il numero della serie vecchia — o collide in quella
  // nuova. Il toast tace, perché non c'è stata nessuna riassegnazione.
  it('manda sempre il numero su un documento già salvato', async () => {
    const user = userEvent.setup();
    const { saveAdjustment, toast } = await setup({ documentId: 'doc-1' });

    await unlock(user);
    await save(user);

    expect(saveAdjustment).toHaveBeenCalledTimes(1);
    const body = saveAdjustment.mock.calls[0]![0] as { readonly number?: number };
    expect(body.number).toBe(42);
    expect(toast.showInfo).not.toHaveBeenCalled();
  });

  // L'altra metà della regola: un numero scritto a mano (riempire un buco nella
  // numerazione) resta un'imposizione e viaggia col documento.
  it('manda il numero quando l’operatore lo digita', async () => {
    const user = userEvent.setup();
    // Il server risponde con un numero diverso da quello imposto: nemmeno lì
    // l'avviso si doppia, perché il numero occupato ha già il suo dialogo.
    const { saveAdjustment, toast } = await setup({ documentId: 'doc-1', assignedNumber: 46 });

    await unlock(user);
    await user.clear(numberInput());
    await user.type(numberInput(), '77');
    await save(user);

    const body = saveAdjustment.mock.calls[0]![0] as { readonly number?: number };
    expect(body.number).toBe(77);
    expect(toast.showInfo).not.toHaveBeenCalled();
  });

  // Concorrenza: il server ha assegnato il primo libero e non è più quello che
  // l'operatore aveva davanti. Dirglielo, o trascriverà il numero sbagliato.
  it('avvisa quando il numero assegnato è diverso da quello mostrato', async () => {
    const user = userEvent.setup();
    const { toast } = await setup({ documentId: 'doc-1', assignedNumber: 46 });

    await unlock(user);
    await save(user);

    expect(toast.showInfo).toHaveBeenCalledWith(
      'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
    );
  });

  // Il campo dichiara che il numero è una proposta finché nessuno lo tocca: chi
  // lo trascrive su un cartaceo prima di salvare deve sapere che può cambiare.
  it('dichiara il numero come proposta sul documento nuovo, finché non lo si digita', async () => {
    const user = userEvent.setup();
    await setup({ proposedNumber: 42 });

    // Un solo avviso: la testata non ha più una seconda copia dei suoi campi.
    expect(await screen.findByText('Primo libero: lo prende chi salva per primo.')).toBeTruthy();

    await user.clear(numberInput());
    await user.type(numberInput(), '55');

    expect(screen.queryByText('Primo libero: lo prende chi salva per primo.')).toBeNull();
  });

  // ── Comandi dietro permesso ────────────────────────────────────────────────
  //
  // Un pulsante che risponde 403 al primo clic è peggio di un pulsante assente:
  // senza «documents.configure» l'API nega la scrittura delle numerazioni, e
  // l'ingranaggio accanto alla serie non deve nemmeno comparire.
  it('nasconde «Gestisci numerazioni» a chi non configura i documenti', async () => {
    await setup();

    expect(screen.queryAllByRole('button', { name: 'Gestisci numerazioni' })).toHaveLength(0);
  });

  it('mostra «Gestisci numerazioni» a chi ha documents.configure', async () => {
    await setup({ permissions: [TenantPermission.DocumentsConfigure] });

    // Un solo comando: la testata monta la veste viva, non tutte e due.
    expect(screen.getByRole('button', { name: 'Gestisci numerazioni' })).toBeTruthy();
  });

  /**
   * ⭐ **LA RIGA RIAPERTA DICE QUELLO CHE DICEVA** — tranche 0A.2b.
   *
   * ⛔ Il difetto che queste prove chiudono: `lineArticleCode` leggeva
   * `lineVariantSummary(index)?.articleCode` — cioè il riepilogo della
   * variante caricato da `searchVariantSummaries`, l'ANAGRAFICA DI OGGI — e il
   * controllo del form era solo un ripiego. Su un documento riaperto quel
   * controllo era vuoto, quindi vinceva sempre l'anagrafica: ricodificare un
   * articolo cambiava ciò che un documento di marzo diceva.
   *
   * ⚠️ **Il catalogo qui dice una cosa DIVERSA dal documento**, ed è la sola
   * forma in cui la prova ha valore: con gli stessi valori nelle due fonti
   * passerebbe anche il codice difettoso.
   */
  describe("riapertura: l'identità è quella fotografata, non quella di oggi", () => {
    /** Com'è l'articolo OGGI in anagrafica: tutto diverso dal documento. */
    const OGGI: VariantSummary = {
      variantId: 'var-foto-1',
      productId: 'prod-foto-1',
      sku: 'MAG-M',
      articleCode: 'ART-DI-OGGI',
      productName: 'Maglia cotone — rinominata',
      title: 'Maglia cotone — rinominata — M / Rosso',
      variantLabel: 'M / Rosso',
      barcode: '8009999999999',
      sellingPrice: { amountMinor: 2500, currencyCode: 'EUR' },
    };

    interface FormaRiapertura {
      patchFormFromDocument(doc: unknown): void;
      applyDuplicatePrefill(doc: unknown): void;
      lineArticleCode(index: number): string;
      lineBarcode(index: number): string;
      onVariantSelect(index: number, value: string | null, known?: VariantSummary | null): void;
      readonly lines: {
        at(i: number): { controls: Record<string, { value: unknown }> };
      };
    }

    /** Il documento SALVATO, con l'identità fotografata sulle righe. */
    function documentoSalvato(riga: Record<string, unknown> = {}) {
      return {
        id: 'doc-foto-1',
        locationId: 'loc-1',
        targetLocationId: 'loc-2',
        documentDate: '2026-03-15T00:00:00.000Z',
        number: 7,
        series: 'A',
        notes: '',
        internalComment: '',
        lines: [
          {
            id: 'line-1',
            variantId: 'var-foto-1',
            sku: 'MAG-M',
            description: 'Maglia cotone — nome di allora',
            variantLabel: 'M / Rosso',
            articleCode: 'ART-DI-ALLORA',
            barcode: '8001111111111',
            quantity: 2,
            loadsStock: true,
            serialNumbers: [],
            ...riga,
          },
        ],
      };
    }

    it("⛔ il codice articolo è quello del DOCUMENTO, non dell'anagrafica di oggi", async () => {
      const { form: componente } = await setup({ catalogo: [OGGI] });
      const form = componente as unknown as FormaRiapertura;

      form.patchFormFromDocument(documentoSalvato());

      expect(form.lineArticleCode(0)).toBe('ART-DI-ALLORA');
      // ⭐ E il catalogo dice un'altra cosa: è la prova che le due fonti sono
      //    distinguibili, e che vince quella giusta.
      expect(form.lineArticleCode(0)).not.toBe(OGGI.articleCode);
    });

    it('⛔ e lo stesso vale per il barcode', async () => {
      const { form: componente } = await setup({ catalogo: [OGGI] });
      const form = componente as unknown as FormaRiapertura;

      form.patchFormFromDocument(documentoSalvato());

      expect(form.lineBarcode(0)).toBe('8001111111111');
      expect(form.lineBarcode(0)).not.toBe(OGGI.barcode);
    });

    /*
      ⛔ **Assente NON riapre la porta all'anagrafica.** Una riga salvata prima
      che la colonna esistesse non ha lo snapshot: la cella resta vuota. È la
      regola esplicita della tranche — ricostruirlo mostrerebbe il dato di oggi
      su un documento storico, cioè il difetto stesso.
    */
    /*
      ⚠️ **Gli effect devono girare, o questa prova non prova niente.**
      `pinnedVariants` è un `toSignal` alimentato da un effect: senza farlo
      girare, il catalogo resta vuoto e la prova passerebbe anche col ripiego
      reintrodotto — misurato il 03/09/2026, falsificazione fallita a 40 verdi.
      Con gli effect girati l'anagrafica RISPONDE, e il vuoto della cella
      diventa una scelta invece che un'assenza.
    */
    it("⛔ snapshot assente: la cella resta VUOTA, non ripiega sull'anagrafica", async () => {
      const { form: componente } = await setup({ catalogo: [OGGI] });
      const form = componente as unknown as FormaRiapertura;

      form.patchFormFromDocument(documentoSalvato({ articleCode: undefined, barcode: undefined }));

      // L'anagrafica ha di che rispondere: la variante è nel catalogo e il
      // form la porta. Se il lettore ripiegasse, troverebbe 'ART-DI-OGGI'.
      TestBed.flushEffects();
      await Promise.resolve();
      TestBed.flushEffects();

      expect(form.lineArticleCode(0)).toBe('');
      expect(form.lineBarcode(0)).toBe('');
    });
    /*
      ⭐ **DUPLICARE: l'id diventa RIFERIMENTO** — tranche 0A.2c.

      Due cose in una riga sola, nessuna facoltativa: la riga nuova non porta
      l'id dell'originale (o il salvataggio MODIFICHEREBBE l'originale), e
      porta il riferimento (o il server rifotograferebbe l'anagrafica di oggi).
    */
    it("⭐ duplicando, l'id della riga originale diventa il riferimento sorgente", async () => {
      const { form: componente } = await setup({ catalogo: [OGGI] });
      const form = componente as unknown as FormaRiapertura;

      form.applyDuplicatePrefill(documentoSalvato());

      const riga = (
        form as unknown as {
          lines: { at(i: number): { controls: Record<string, { value: unknown }> } };
        }
      ).lines.at(0).controls;
      expect(riga['sourceDocumentLineId']!.value).toBe('line-1');
      // ⛔ E l'id proprio NON c'è: è un documento nuovo, non una modifica.
      //    Vuoto e non `null`: la funzione condivisa azzera con la stringa
      //    vuota, che ogni forma di controllo accetta e che il payload tratta
      //    come «riga nuova» (`id || undefined`).
      expect(riga['id']!.value).toBe('');
    });

    /*
      ⭐ **La riga NUOVA prende invece la variante scelta ADESSO**, ed è
      corretto: non c'è nessuna fotografia da rispettare, l'articolo lo si sta
      scegliendo. Senza questa prova, «leggi sempre e solo il controllo»
      potrebbe valere anche dove non deve, e il difetto sarebbe muto — una
      riga nuova che non mostra il codice dell'articolo appena richiamato.
    */
    it('⭐ una riga NUOVA prende i valori della variante scelta ora', async () => {
      const { form: componente } = await setup({ catalogo: [OGGI] });
      const form = componente as unknown as FormaRiapertura;

      form.onVariantSelect(0, OGGI.variantId, OGGI);

      expect(form.lineArticleCode(0)).toBe('ART-DI-OGGI');
      expect(form.lineBarcode(0)).toBe('8009999999999');
    });
  });
});
