import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { PaymentOptionsService } from '@core/services/payment-options.service';
import { SupplierService } from '@features/suppliers/services/supplier.service';

import { PurchaseInvoiceFormComponent } from './purchase-invoice-form.component';
import { DocumentService } from './services/document.service';
import type { LinkableGoodsReceipt } from './models/goods-receipt-causal.model';

const SUPPLIERS = [{ id: 'sup-1', name: 'ACME Forniture' }];

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
  async function setup() {
    const documentService = {
      getDocumentById: vi.fn(),
      listLinkableGoodsReceipts: vi.fn(() => of([RECEIPT_1, RECEIPT_2])),
      savePurchaseInvoice: vi.fn(),
    };

    await render(PurchaseInvoiceFormComponent, {
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: {} }, paramMap: of(convertToParamMap({})) },
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
      ],
    });

    return { documentService };
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
});
