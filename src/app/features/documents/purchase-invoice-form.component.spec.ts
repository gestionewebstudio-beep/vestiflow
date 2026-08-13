import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import type { DocumentRecord } from '@core/models/document.model';
import { PaymentOptionsService } from '@core/services/payment-options.service';
import { ToastService } from '@core/services/toast.service';
import { SupplierService } from '@domain/suppliers/services/supplier.service';

import { PurchaseInvoiceFormComponent } from './purchase-invoice-form.component';
import { DocumentService } from '@domain/documents/services/document.service';
import { DocumentCountersService } from '@domain/documents/services/document-counters.service';
import { ExternalDocumentTypeService } from '@domain/documents/services/external-document-type.service';
import { DocumentSettingsService } from './services/document-settings.service';
import type { SavePurchaseInvoiceBody } from '@domain/documents/services/document-api.mapper';
import type { DocumentCounterView } from '@domain/documents/models/document-counter.model';
import type { ExternalDocumentType } from '@domain/documents/models/external-document-type.model';
import type { LinkableGoodsReceipt } from '@domain/documents/models/goods-receipt-causal.model';

const SUPPLIERS = [{ id: 'sup-1', name: 'ACME Forniture' }];

/** Numerazione predefinita: all'apertura della maschera il primo libero è 42. */
const COUNTER: DocumentCounterView = {
  id: 'cnt-1',
  type: DocumentType.SupplierInvoice,
  series: null,
  locationId: null,
  locationName: null,
  isDefault: true,
  nextNumber: 42,
  documentCount: 41,
};

/** Tipi documento della controparte come li restituisce il seed di sistema. */
const EXTERNAL_TYPES: readonly ExternalDocumentType[] = [
  { id: 'edt-ddt', name: 'DDT', shortLabel: 'DDT', isSystem: true, isActive: true, sortOrder: 0 },
  {
    id: 'edt-fattura',
    name: 'Fattura',
    shortLabel: 'Fatt.',
    isSystem: true,
    isActive: true,
    sortOrder: 1,
  },
];

const RECEIPT_1: LinkableGoodsReceipt = {
  id: 'gr-1',
  number: 1,
  reference: 'DDT-1',
  documentDate: '2026-01-10',
  causalText: 'Acquisto merce',
  subtotal: { amountMinor: 10000, currencyCode: 'EUR' },
  tax: { amountMinor: 2200, currencyCode: 'EUR' },
  total: { amountMinor: 12200, currencyCode: 'EUR' },
  vatBreakdown: [
    {
      ratePercent: 22,
      net: { amountMinor: 10000, currencyCode: 'EUR' },
      vat: { amountMinor: 2200, currencyCode: 'EUR' },
    },
  ],
};

const RECEIPT_2: LinkableGoodsReceipt = {
  id: 'gr-2',
  number: 2,
  reference: 'DDT-2',
  documentDate: '2026-01-12',
  causalText: 'Acquisto merce',
  subtotal: { amountMinor: 5000, currencyCode: 'EUR' },
  tax: { amountMinor: 1100, currencyCode: 'EUR' },
  total: { amountMinor: 6100, currencyCode: 'EUR' },
  vatBreakdown: [
    {
      ratePercent: 22,
      net: { amountMinor: 5000, currencyCode: 'EUR' },
      vat: { amountMinor: 1100, currencyCode: 'EUR' },
    },
  ],
};

describe('PurchaseInvoiceFormComponent', () => {
  interface SetupOptions {
    /** Contatori restituiti da GET /document-counters: alimentano la proposta. */
    readonly counters?: readonly DocumentCounterView[];
    /** Numero che il server assegna davvero al salvataggio. */
    readonly assignedNumber?: number;
  }

  async function setup(options: SetupOptions = {}) {
    const counters = options.counters ?? [];
    const showInfo = vi.fn();
    const documentService = {
      // Controllo cronologico (§4): serie in ordine, nessun avviso.
      checkChronology: () => of({ anomalies: [], dismissed: false }),
      dismissChronologyWarning: () => of(void 0),
      getDocumentById: vi.fn(),
      listLinkableGoodsReceipts: vi.fn(() => of([RECEIPT_1, RECEIPT_2])),
      // Della registrazione salvata la maschera legge solo il numero assegnato:
      // è il confronto con quello mostrato che decide se avvisare l'operatore.
      savePurchaseInvoice: vi.fn((_body: SavePurchaseInvoiceBody) =>
        of({
          document: {
            id: 'pi-1',
            number: options.assignedNumber ?? 1,
          } as unknown as DocumentRecord,
          receiptsTotalMinor: 0,
          totalsMatch: true,
        }),
      ),
    };

    await render(PurchaseInvoiceFormComponent, {
      providers: [
        {
          provide: DocumentCountersService,
          useValue: {
            available: () => of({ counters, proposedCounterId: counters[0]?.id ?? null }),
          },
        },
        // Rotta jolly: dopo il salvataggio la maschera torna all'elenco, e una
        // navigazione senza rotte da agganciare fallirebbe in modo rumoroso.
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ActivatedRoute,
          useValue: {
            // `queryParamMap` serve davvero: la maschera lo legge in
            // `afterNextRender` per il precompilato da «Duplica documento», e
            // senza, l'eccezione interrompe il blocco — portandosi via anche i
            // passi successivi, fra cui la proposta del tipo controparte.
            snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
            queryParamMap: of(convertToParamMap({})),
          },
        },
        {
          provide: SupplierService,
          useValue: { getSuppliers: () => of(SUPPLIERS) },
        },
        {
          provide: PaymentOptionsService,
          useValue: { list: () => of([]) },
        },
        { provide: DocumentService, useValue: documentService },
        // Tipi del documento della controparte: li chiedono sia la testata
        // (componente condiviso) sia la proposta «Fattura» sui documenti nuovi.
        {
          provide: ExternalDocumentTypeService,
          useValue: { list: () => of(EXTERNAL_TYPES) },
        },
        // Serie del numero: una sola configurata → label statica.
        {
          provide: DocumentSettingsService,
          useValue: { getSettings: () => of([]) },
        },
        { provide: ToastService, useValue: { showInfo, showError: vi.fn() } },
      ],
    });

    return { documentService, showInfo };
  }

  /** Il campo Numero vive in due viste (mobile + desktop): stesso controllo. */
  async function numberInput(): Promise<HTMLInputElement> {
    const inputs = await screen.findAllByLabelText<HTMLInputElement>('Numero');
    return inputs[0]!;
  }

  async function saveInvoice(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getAllByRole('button', { name: 'Salva documento' })[0]!);
  }

  async function selectSupplier(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Fornitore' }));
    await user.click(screen.getByRole('option', { name: 'ACME Forniture' }));
  }

  async function includeReceipt(user: ReturnType<typeof userEvent.setup>, index: number) {
    await user.click(screen.getByRole('button', { name: /Includi arrivo merce/i }));
    const checkboxes = await screen.findAllByRole('checkbox');
    await user.click(checkboxes[index]!);
    await user.click(screen.getByRole('button', { name: 'Includi selezionati' }));
  }

  // Le righe registrazione si generano automaticamente raggruppando gli
  // imponibili degli arrivi inclusi per aliquota IVA, con il riferimento
  // automatico agli arrivi (spec RIGHE REGISTRAZIONE).
  it('raggruppa gli arrivi inclusi in righe per aliquota con riferimento automatico', async () => {
    const user = userEvent.setup();
    await setup();

    await selectSupplier(user);
    await includeReceipt(user, 0);
    expect(screen.getByText('Rif. Arrivo merce 1 del 10/01/2026')).toBeTruthy();

    // Il secondo arrivo ha la stessa aliquota: la riga resta una, sommata.
    await includeReceipt(user, 0);
    expect(screen.getByText('Rif. Arrivo merce 1 del 10/01/2026, 2 del 12/01/2026')).toBeTruthy();
  });

  // Una riga manuale calcola l'importo IVA da netto × aliquota; il valore
  // resta comunque modificabile dall'operatore.
  it('calcola l’IVA della riga manuale da importo netto e aliquota', async () => {
    const user = userEvent.setup();
    await setup();

    await user.click(screen.getByRole('button', { name: /Aggiungi riga manuale/i }));

    await user.type(screen.getByLabelText('Importo netto riga manuale 1'), '100');
    await user.type(screen.getByLabelText('Aliquota IVA riga manuale 1'), '22');

    const vatInput = screen.getByLabelText<HTMLInputElement>('Importo IVA riga manuale 1');
    expect(vatInput.value).toBe('22,00');
  });

  // Le scadenze si precompilano con il residuo non coperto; la spunta
  // "Saldato" propone oggi come data saldo (spec PAGAMENTO).
  it('precompila la scadenza con il residuo e la data saldo alla spunta Saldato', async () => {
    const user = userEvent.setup();
    await setup();

    await selectSupplier(user);
    await includeReceipt(user, 0);

    await user.click(screen.getByRole('button', { name: /Aggiungi scadenza/i }));
    const amountInput = screen.getByLabelText<HTMLInputElement>('Importo scadenza 1');
    expect(amountInput.value).toBe('122,00');

    await user.click(screen.getByLabelText('Scadenza 1 saldata'));
    const settledDate = screen.getByLabelText<HTMLInputElement>('Data saldo scadenza 1');
    expect(settledDate.value).not.toBe('');
  });

  // ── Il numero proposto non torna al server come imposizione ─────────────
  //
  // Il numero che la maschera mostra all'apertura è il primo libero: una
  // proposta, non una scelta. Rimandarlo al salvataggio lo trasformava in
  // un'imposizione, e il secondo operatore si prendeva un dialogo di conflitto
  // per un numero che non aveva mai digitato — glielo aveva scritto la maschera.
  it('non manda il numero proposto: lo assegna il server', async () => {
    const user = userEvent.setup();
    const { documentService, showInfo } = await setup({
      counters: [COUNTER],
      assignedNumber: 42,
    });

    const numero = await numberInput();
    await waitFor(() => expect(numero.value).toBe('42'));

    await selectSupplier(user);
    await saveInvoice(user);

    expect(documentService.savePurchaseInvoice.mock.calls[0]![0].number).toBeUndefined();
    // Il server ha confermato il 42: non c'è nulla da segnalare all'operatore.
    expect(showInfo).not.toHaveBeenCalled();
  });

  // Il numero digitato a mano resta una scelta dell'operatore, e va difesa: si
  // manda, e se è occupato il dialogo di conflitto ha qualcosa da dire.
  it('manda il numero digitato dall’operatore', async () => {
    const user = userEvent.setup();
    const { documentService } = await setup();

    await user.type(await numberInput(), '77');

    await selectSupplier(user);
    await saveInvoice(user);

    expect(documentService.savePurchaseInvoice.mock.calls[0]![0].number).toBe(77);
  });

  // Numero proposto e numero assegnato possono divergere: fra l'apertura e il
  // salvataggio un altro operatore può aver preso il 42. Non è un errore, ma
  // chi l'aveva già trascritto su carta deve sapere di avere il numero sbagliato.
  it('avvisa quando il server assegna un numero diverso da quello proposto', async () => {
    const user = userEvent.setup();
    const { showInfo } = await setup({ counters: [COUNTER], assignedNumber: 46 });

    const numero = await numberInput();
    await waitFor(() => expect(numero.value).toBe('42'));

    await selectSupplier(user);
    await saveInvoice(user);

    expect(showInfo).toHaveBeenCalledWith(
      'Salvato con il n. 46: il 42 è stato preso da un altro operatore.',
    );
  });
});
