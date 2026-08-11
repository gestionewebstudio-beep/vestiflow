import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { AdjustmentDirection, DocumentStatus, DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { ToastService } from '@core/services/toast.service';
import { DEFAULT_CURRENCY } from '@core/utils/money.util';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { DocumentService } from '@domain/documents/services/document.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { OperationalLocationsService } from '@domain/inventory/services/operational-locations.service';
import { ProductService } from '@domain/products/services/product.service';

import { StockOperationFormComponent } from './stock-operation-form.component';

const LOCATIONS = [{ id: 'loc-1', name: 'Milano' }];

function operationalLocationsMock() {
  return {
    locations: () => LOCATIONS,
    writeLocations: () => LOCATIONS,
    actionLocations: () => LOCATIONS,
    transferTargetLocations: () => LOCATIONS,
    defaultLocation: () => LOCATIONS[0],
    suggestedWriteLocation: () => LOCATIONS[0],
    isFixedSingleStore: () => false,
    fixedSingleStoreLocationId: () => null,
    fixedSingleStoreLabel: () => null,
  };
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

    await render(StockOperationFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: {
            available: () =>
              of({ counters, proposedCounterId: counters.length > 0 ? 'cnt-1' : null }),
          },
        },
        // Nessun permesso costi: il selettore articolo non deve mostrare il costo.
        { provide: AuthService, useValue: { currentUser: () => null } },
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
        { provide: ProductService, useValue: { searchVariantSummaries: () => of([]) } },
        // Tipi documento della controparte: li chiede il blocco condiviso in
        // testata, che senza un HttpClient nel test non arriverebbe in fondo.
        { provide: ExternalDocumentTypeService, useValue: { list: () => of([]) } },
        { provide: ToastService, useValue: toast },
        {
          provide: DocumentService,
          useValue: {
            getDocumentById: vi.fn(() => of(CONFIRMED_ADJUSTMENT)),
            saveAdjustment,
            createDocument,
            updateDocument: vi.fn(),
            confirmDocument: vi.fn(),
          },
        },
      ],
    });

    return { saveAdjustment, createDocument, toast };
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

  /** Il campo Numero della testata (desktop e pannello mobile convivono). */
  function numberInput(): HTMLInputElement {
    return screen.getAllByLabelText<HTMLInputElement>('Numero')[0]!;
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

    expect(
      await screen.findAllByText('Primo libero: lo prende chi salva per primo.'),
    ).not.toHaveLength(0);

    await user.clear(numberInput());
    await user.type(numberInput(), '55');

    expect(screen.queryByText('Primo libero: lo prende chi salva per primo.')).toBeNull();
  });
});
