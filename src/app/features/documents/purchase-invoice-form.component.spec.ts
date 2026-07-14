import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

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
    await user.click(screen.getByRole('button', { name: /Includi documento/i }));
    const checkboxes = await screen.findAllByRole('checkbox');
    await user.click(checkboxes[index]!);
    await user.click(screen.getByRole('button', { name: 'Includi selezionati' }));
  }

  // Il totale fattura si precompila con la somma degli arrivi inclusi (comodo
  // default): l'utente non deve ricalcolarlo a mano dal nulla, ma resta libero
  // di sovrascriverlo con l'importo reale della fattura del fornitore.
  it('precompila il totale fattura con la somma degli arrivi inclusi', async () => {
    const user = userEvent.setup();
    await setup();

    await selectSupplier(user);
    await includeReceipt(user, 0);

    const totalInput = screen.getByLabelText<HTMLInputElement>('Totale fattura');
    expect(totalInput.value).toBe('122,00');

    await includeReceipt(user, 0);
    expect(totalInput.value).toBe('183,00');
  });

  // Un valore digitato a mano dall'utente è l'importo reale della fattura e non
  // deve mai essere sovrascritto da un successivo ricalcolo automatico.
  it('non sovrascrive il totale digitato a mano quando si includono altri arrivi', async () => {
    const user = userEvent.setup();
    await setup();

    await selectSupplier(user);
    await includeReceipt(user, 0);

    const totalInput = screen.getByLabelText<HTMLInputElement>('Totale fattura');
    await user.clear(totalInput);
    await user.type(totalInput, '999,50');
    expect(totalInput.value).toBe('999,50');

    await includeReceipt(user, 0);
    expect(totalInput.value).toBe('999,50');
  });
});
