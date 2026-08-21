import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { LocationContextService } from '@core/services/location-context.service';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { CustomerService } from '@domain/customers/services/customer.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { STORE_SALE_MODE_ROUTE_DATA_KEY } from '@domain/store-sales/models/store-sale-routing.util';
import type {
  CreateStoreReturnPayload,
  CreateStoreSalePayload,
} from '@domain/store-sales/models/store-sale.model';

import { StoreSalesService } from './services/store-sales.service';
import { StoreSaleDocumentFormComponent } from './store-sale-document-form.component';

const SEDE = { id: 'loc-1', name: 'Negozio Milano' };
const ALTRA_SEDE = { id: 'loc-2', name: 'Magazzino' };
const ZERO = { amountMinor: 0, currencyCode: DEFAULT_CURRENCY };

const VAT_SNAPSHOT = {
  code: '22',
  natureKey: 'imponibile',
  natureLabel: 'Imponibile',
  officialCode: null,
  ratePercent: 22,
  description: 'Imponibile 22%',
  nonDeductiblePercent: 0,
  calculationMode: 'standard' as const,
  vatAffectsSupplierTotal: true,
};

/**
 * Vendita già registrata, con la testata piena: sono i campi che questa fase
 * **conserva senza mostrarli** (note, pagamento, cliente) e che un risalvataggio
 * non deve cancellare.
 */
const VENDITA: DocumentRecord = {
  id: 'doc-sale-1',
  tenantId: 'ten-1',
  createdAt: '2026-03-10T08:00:00.000Z',
  updatedAt: '2026-03-10T08:00:00.000Z',
  type: DocumentType.StoreSale,
  status: DocumentStatus.Confirmed,
  series: '',
  number: 12,
  year: 2026,
  documentDate: '2026-03-10',
  currency: DEFAULT_CURRENCY,
  subtotal: ZERO,
  tax: ZERO,
  total: ZERO,
  pricesIncludeVat: true,
  createdByName: 'Operatore',
  locationId: SEDE.id,
  customerId: 'cli-1',
  notes: 'Consegnato a mano',
  paymentMethod: 'card',
  lines: [
    {
      id: 'line-A',
      lineNumber: 1,
      variantId: 'var-1',
      sku: 'MAG-001',
      description: 'Maglietta Basic — M / Bianco',
      quantity: 2,
      unitPrice: { amountMinor: 2049.180328, currencyCode: DEFAULT_CURRENCY },
      discountPercent: 0,
      lineTotal: { amountMinor: 4098, currencyCode: DEFAULT_CURRENCY },
      loadsStock: true,
      vatCodeId: 'vat-22',
      vatSnapshot: VAT_SNAPSHOT,
    },
  ],
};

const RESO: DocumentRecord = {
  ...VENDITA,
  id: 'doc-return-1',
  type: DocumentType.StoreReturn,
  customerId: undefined,
  paymentMethod: undefined,
  causalText: 'Capo difettoso',
  lines: [{ ...VENDITA.lines![0]!, id: 'line-R', loadsStock: false }],
};

const ESITO = {
  id: 'doc-nuovo',
  reference: 'VN-1',
  documentDate: '2026-08-21',
  totalMinor: 4098,
  currency: DEFAULT_CURRENCY,
  lines: [],
};

/**
 * Un 409 nella forma in cui arriva DAVVERO al componente: `AppError.details` è
 * la `HttpErrorResponse`, e Nest annida il payload dentro `message`. Una
 * fixture più semplice renderebbe verde un estrattore che in produzione non
 * trova niente.
 */
function errore409(payload: Record<string, unknown>) {
  return {
    kind: 'conflict',
    message: 'Conflitto.',
    status: 409,
    details: new HttpErrorResponse({ status: 409, error: { message: payload } }),
  };
}

interface SetupOptions {
  readonly mode?: 'sale' | 'return';
  readonly editId?: string;
  readonly loadDocument?: DocumentRecord;
  readonly loadFails?: boolean;
  readonly createSale?: ReturnType<typeof vi.fn>;
  readonly createReturn?: ReturnType<typeof vi.fn>;
  /**
   * Sedi fra cui scegliere. Con una sola, il default la precompila — ma il
   * campo resta il controllo comune (`11` A13).
   */
  readonly locations?: readonly { id: string; name: string }[];
  /** Sede preferita del contesto: `null` = nessuna, e il gate resta aperto. */
  readonly preferredLocation?: string | null;
}

async function setup(options: SetupOptions = {}) {
  const locations = options.locations ?? [SEDE, ALTRA_SEDE];
  const preferredLocation =
    options.preferredLocation === undefined ? SEDE.id : options.preferredLocation;
  const createSale = options.createSale ?? vi.fn(() => of(ESITO));
  const createReturn = options.createReturn ?? vi.fn(() => of(ESITO));
  const getDocumentById = vi.fn(() =>
    options.loadFails
      ? throwError(() => ({ kind: 'server', message: 'Errore.' }))
      : of(options.loadDocument ?? VENDITA),
  );

  const rendered = await render(StoreSaleDocumentFormComponent, {
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          // ⛔ Il modo lo pretende la rotta e il componente LANCIA se manca: i
          // due modi hanno effetti di magazzino opposti.
          snapshot: {
            data: { [STORE_SALE_MODE_ROUTE_DATA_KEY]: options.mode ?? 'sale' },
            paramMap: convertToParamMap(options.editId ? { id: options.editId } : {}),
          },
          paramMap: of(convertToParamMap(options.editId ? { id: options.editId } : {})),
        },
      },
      { provide: DocumentService, useValue: { getDocumentById } },
      { provide: StoreSalesService, useValue: { createSale, createReturn } },
      {
        provide: CustomerService,
        useValue: {
          getAllCustomers: vi.fn(() =>
            of([{ id: 'cli-1', displayName: 'Mario Rossi', type: 'person' }]),
          ),
        },
      },
      {
        provide: OperationalLocationsService,
        useValue: {
          actionLocations: () => locations,
        },
      },
      {
        provide: LocationContextService,
        useValue: { activeLocationId: () => preferredLocation, setActiveLocation: vi.fn() },
      },
    ],
  });

  const component = rendered.fixture.componentInstance;
  return { ...rendered, component, createSale, createReturn, getDocumentById };
}

const corpoVendita = (spia: ReturnType<typeof vi.fn>, chiamata = 0): CreateStoreSalePayload =>
  spia.mock.calls[chiamata]![0] as CreateStoreSalePayload;

const corpoReso = (spia: ReturnType<typeof vi.fn>, chiamata = 0): CreateStoreReturnPayload =>
  spia.mock.calls[chiamata]![0] as CreateStoreReturnPayload;

describe('StoreSaleDocumentFormComponent', () => {
  describe('il modo viene dalla rotta, e con lui tutto ciò che cambia', () => {
    it('vendita: titolo e sottotestata parlano di scarico', async () => {
      await setup({ mode: 'sale' });

      expect(screen.getByRole('heading', { name: 'Nuova vendita al banco' })).toBeTruthy();
      expect(screen.getByText(/vengono scaricate/)).toBeTruthy();
    });

    it('reso: titolo e sottotestata parlano di rientro', async () => {
      await setup({ mode: 'return' });

      expect(screen.getByRole('heading', { name: 'Nuovo reso al banco' })).toBeTruthy();
      // ⚠️ Era il difetto misurato quando i due testi erano fissi sulla vendita:
      // «Nuovo reso al banco» dichiarava lo scarico della giacenza.
      expect(screen.getByText(/rientra in giacenza/)).toBeTruthy();
    });

    it('senza modo nella rotta non parte: un fallback silenzioso è peggio', async () => {
      await expect(
        render(StoreSaleDocumentFormComponent, {
          providers: [
            provideRouter([]),
            {
              provide: ActivatedRoute,
              useValue: {
                snapshot: { data: {}, paramMap: convertToParamMap({}) },
                paramMap: of(convertToParamMap({})),
              },
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it('il cliente c’è sulla vendita', async () => {
      const { container } = await setup({ mode: 'sale' });

      expect(container.textContent).toContain('Cliente (facoltativo)');
    });

    it('⭐ il cliente c’è anche sul reso: A13 non distingue i due modi', async () => {
      const { container } = await setup({ mode: 'return' });

      expect(container.textContent).toContain('Cliente (facoltativo)');
    });
  });

  describe('la testata governa le righe', () => {
    it('senza sede, al posto delle righe c’è uno stato vuoto che dice cosa manca', async () => {
      // Più sedi possibili e nessuna preferita: A13 dice che non si prosegue
      // finché non se ne sceglie una.
      await setup({ preferredLocation: null });

      expect(screen.getByText('Scegli la sede')).toBeTruthy();
    });

    it('la sede preferita precompila e chiude il gate', async () => {
      await setup({ preferredLocation: SEDE.id });

      expect(screen.queryByText('Scegli la sede')).toBeNull();
    });

    it('⭐ con una sola sede il campo resta il controllo comune, non un’etichetta', async () => {
      // ⛔ La maschera legacy mostrava un'etichetta al posto della tendina: un
      // default non cambia la natura del campo (`11` A13, «precompila ma resta
      // modificabile»).
      await setup({ locations: [SEDE], preferredLocation: null });

      expect(screen.getAllByLabelText('Sede').length).toBeGreaterThan(0);
      expect(screen.queryByText('Scegli la sede')).toBeNull();
    });
  });

  describe('caricamento di un documento esistente', () => {
    it('legge il documento per id', async () => {
      const { getDocumentById } = await setup({ editId: 'doc-sale-1' });

      expect(getDocumentById).toHaveBeenCalledWith('doc-sale-1');
      expect(screen.getByRole('heading', { name: 'Modifica vendita al banco' })).toBeTruthy();
    });

    it('un documento di tipo diverso non si apre qui', async () => {
      // Il tipo lo dice la ROTTA: aprire un reso su una maschera che dice
      // vendita farebbe correggere la cosa sbagliata.
      await setup({ mode: 'sale', editId: 'doc-return-1', loadDocument: RESO });

      expect(screen.getByText('Documento non disponibile')).toBeTruthy();
    });

    it('⭐ la sede del documento non viene sovrascritta da quella assegnata', async () => {
      // Con una sede unica assegnata, aprire un documento di un'ALTRA sede non
      // deve spostarlo: sarebbe un cambio di magazzino fatto aprendo, e su un
      // operatore autorizzato a entrambe il server non avrebbe da obiettare.
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({
        editId: 'doc-sale-1',
        loadDocument: { ...VENDITA, locationId: ALTRA_SEDE.id },
        // La sede assegnata all'operatore è un'altra: non deve vincere su
        // quella già persistita sul documento.
        preferredLocation: SEDE.id,
        createSale,
      });

      component.save();

      expect(corpoVendita(createSale).locationId).toBe(ALTRA_SEDE.id);
    });

    it('⭐ la data si carica dal documento e RESTA modificabile', async () => {
      // Contratto documentale comune: default oggi, modificabile, caricata dal
      // documento esistente. Il server la persiste in update senza rinumerare.
      await setup({ editId: 'doc-sale-1' });

      const campi = screen.getAllByLabelText<HTMLInputElement>('Data documento');
      expect(campi.length).toBeGreaterThan(0);
      expect(campi.some((campo) => campo.disabled)).toBe(false);
      expect(campi[0]!.value).toContain('10/03/2026');
    });

    it('la lettura fallita ha il suo stato, non una maschera vuota', async () => {
      await setup({ editId: 'doc-sale-1', loadFails: true });

      expect(screen.getByText('Impossibile caricare il documento.')).toBeTruthy();
    });
  });

  describe('salvataggio', () => {
    it('creazione: nessun id, intento presente, data del documento', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      expect(corpo.id).toBeUndefined();
      expect(corpo.creationIntentId).toBeTruthy();
      expect(corpo.locationId).toBe(SEDE.id);
      expect(corpo.documentDate).toBeTruthy();
    });

    it('modifica: id presente, nessun intento, e la data viaggia lo stesso', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      expect(corpo.id).toBe('doc-sale-1');
      // ⛔ Rivendicare un intento in modifica impedirebbe la seconda modifica
      // legittima dello stesso documento.
      expect(corpo.creationIntentId).toBeUndefined();
      // La data è modificabile anche dopo la conclusione: il client la manda
      // sempre, e il server la persiste senza rinumerare.
      expect(corpo.documentDate).toContain('2026-03-10');
    });

    it('⭐ risalvare un documento caricato non cancella la testata che non si vede', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      // Il server riscrive la testata da ciò che riceve: ometterli li
      // cancellerebbe, e i loro campi non si vedono ancora.
      expect(corpo.notes).toBe('Consegnato a mano');
      expect(corpo.customerId).toBe('cli-1');
    });

    it('⛔ il pagamento NON viaggia: la sua gestione è differita (A8)', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const corpo = corpoVendita(createSale);
      // Nessun campo, nessun default, nessun trasporto: il valore storico lo
      // protegge il server, che senza metodo dichiarato conserva il persistito.
      expect(corpo).not.toHaveProperty('paymentMethod');
      expect(corpo).not.toHaveProperty('paymentMethodNote');
    });

    it('⭐ risalvare non altera le righe caricate', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ editId: 'doc-sale-1', createSale });

      component.save();

      const [riga] = corpoVendita(createSale).lines;
      expect(riga!.id).toBe('line-A');
      // Assenti = non modificate: il server conserva snapshot IVA e descrizione.
      expect(riga!.vatCodeId).toBeUndefined();
      expect(riga!.description).toBeUndefined();
      // Il prezzo torna com'era, coda decimale compresa.
      expect(riga!.unitPriceMinor).toBe(2049.180328);
    });

    it('reso: causale conservata e «Carica giacenze» nel nome del confine', async () => {
      const createReturn = vi.fn(() => of(ESITO));
      const { component } = await setup({
        mode: 'return',
        editId: 'doc-return-1',
        loadDocument: RESO,
        createReturn,
      });

      component.save();

      const corpo = corpoReso(createReturn);
      expect(corpo.causale).toBe('Capo difettoso');
      // Il concetto è `loadsStock`; `restockable` è come si chiama nel DTO.
      expect(corpo.lines[0]!.restockable).toBe(false);
      expect(corpo.lines[0]!.id).toBe('line-R');
    });

    it('⭐ reso: il cliente scelto viaggia, come sulla Vendita (A13)', async () => {
      const createReturn = vi.fn(() => of(ESITO));
      const { component } = await setup({
        mode: 'return',
        editId: 'doc-return-1',
        loadDocument: { ...RESO, customerId: 'cli-1' },
        createReturn,
      });

      component.save();

      expect(corpoReso(createReturn).customerId).toBe('cli-1');
    });

    it('senza sede non si salva', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ preferredLocation: null, createSale });

      component.save();

      expect(createSale).not.toHaveBeenCalled();
    });
  });

  describe('idempotenza della creazione (T15)', () => {
    it('⭐ errore INCERTO: il reinvio porta lo STESSO intento', async () => {
      const createSale = vi.fn(() =>
        throwError(() => ({ kind: 'timeout', message: 'Troppo tempo.' })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      const primo = corpoVendita(createSale, 0).creationIntentId;
      const secondo = corpoVendita(createSale, 1).creationIntentId;
      expect(primo).toBeTruthy();
      // Il server potrebbe aver committato lo stesso: un intento nuovo
      // creerebbe un secondo documento.
      expect(secondo).toBe(primo);
    });

    it('⭐ errore CERTO: l’intento si chiude, il successivo è nuovo', async () => {
      const createSale = vi.fn(() =>
        throwError(() => ({ kind: 'validation', message: 'Dati non validi.', status: 422 })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      expect(corpoVendita(createSale, 1).creationIntentId).not.toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('⭐ successo: l’intento si chiude — la vendita dopo è un’altra', async () => {
      const createSale = vi.fn(() => of(ESITO));
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      // Due clienti, stessa maglietta, stesso minuto: due vendite.
      expect(corpoVendita(createSale, 1).creationIntentId).not.toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('⭐ il 409 non è una categoria sola: l’intento occupato NON si chiude', async () => {
      const createSale = vi.fn(() =>
        throwError(() => errore409({ code: 'creation_intent_in_progress', resultRef: null })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      // Chiuderlo renderebbe il tentativo successivo una seconda creazione
      // inconsapevole.
      expect(corpoVendita(createSale, 1).creationIntentId).toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('⭐ numero già preso: la transazione ha fatto rollback, l’intento si chiude', async () => {
      const createSale = vi.fn(() =>
        throwError(() => ({
          kind: 'conflict',
          message: 'Numero già assegnato.',
          status: 409,
          details: new HttpErrorResponse({
            status: 409,
            error: { message: { code: 'document_number_taken' } },
          }),
        })),
      );
      const { component } = await setup({ createSale });

      component.save();
      component.save();

      expect(corpoVendita(createSale, 1).creationIntentId).not.toBe(
        corpoVendita(createSale, 0).creationIntentId,
      );
    });

    it('quando il server nomina il documento già creato, il riferimento si conserva', async () => {
      const createSale = vi.fn(() =>
        throwError(() =>
          errore409({ code: 'creation_intent_mismatch', resultRef: 'doc-esistente' }),
        ),
      );
      const { component } = await setup({ createSale });

      component.save();

      expect(component.alreadyCreatedDocumentId()).toBe('doc-esistente');
    });
  });
});
