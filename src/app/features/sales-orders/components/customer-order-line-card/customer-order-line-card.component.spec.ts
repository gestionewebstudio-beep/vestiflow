import { FormControl, FormGroup } from '@angular/forms';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CustomerOrderLineCardVm } from '../../models/customer-order-line-card.model';
import { CustomerOrderLineCardComponent } from './customer-order-line-card.component';

function makeLine(overrides: Partial<Record<string, unknown>> = {}) {
  return new FormGroup({
    productName: new FormControl('Maglietta cotone', { nonNullable: true }),
    articleCode: new FormControl('ART-01', { nonNullable: true }),
    sku: new FormControl('SKU-01', { nonNullable: true }),
    barcode: new FormControl('', { nonNullable: true }),
    quantity: new FormControl(2, { nonNullable: true }),
    unitPrice: new FormControl('19,90', { nonNullable: true }),
    discount: new FormControl('', { nonNullable: true }),
    serialNumbersText: new FormControl('', { nonNullable: true }),
    commitsStock: new FormControl(true, { nonNullable: true }),
    ...overrides,
  });
}

const VM: CustomerOrderLineCardVm = {
  index: 0,
  variantLabel: 'M · Rosso',
  articleCode: 'ART-01',
  unitOfMeasure: 'pz',
  stockAvailable: '7',
  availabilityHint: null,
  availabilityCritical: false,
  complete: true,
  totalLabel: '€ 39,80',
  discountedUnitLabel: '€ 19,90',
  purchaseCostLabel: '€ 8,00',
  priceLabel: 'Prezzo',
  vatOptions: [{ value: '22', label: '22%' }],
  vatValue: '22',
  suggestions: [],
  suggestionsOpen: false,
  suggestAbove: false,
  activeSuggestionIndex: 0,
  readOnly: false,
  commitsLabel: 'Impegna magazzino',
  showSerials: false,
  showPurchaseCost: true,
};

async function setup(
  vm: Partial<CustomerOrderLineCardVm> = {},
  open = false,
  layout: 'order' | 'registry' = 'order',
) {
  const line = makeLine();
  const on = {
    toggled: vi.fn(),
    removeRequested: vi.fn(),
    removed: vi.fn(),
    duplicated: vi.fn(),
    quantityStepped: vi.fn(),
    codeCommitted: vi.fn(),
    suggestionPicked: vi.fn(),
    vatSelected: vi.fn(),
    commitsChanged: vi.fn(),
  };
  await render(CustomerOrderLineCardComponent, {
    inputs: { line, vm: { ...VM, ...vm }, open, layout },
    on,
  });
  return { line, on };
}

describe('CustomerOrderLineCardComponent', () => {
  it('a card chiusa restano leggibili i valori primari: nome, codice, quantita, prezzo, totale', async () => {
    await setup();

    expect(screen.getByText('Maglietta cotone')).toBeVisible();
    expect(screen.getByText('Cod. ART-01')).toBeVisible();
    expect(screen.getByLabelText('Quantità')).toHaveValue(2);
    expect(screen.getByLabelText('Prezzo unitario')).toHaveValue('19,90');
    expect(screen.getByText('€ 39,80')).toBeVisible();
  });

  it('lo stepper non tocca il controllo: il form applica il minimo e marca il documento', async () => {
    const user = userEvent.setup();
    const { line, on } = await setup();

    await user.click(screen.getByRole('button', { name: 'Aumenta quantità' }));

    expect(on.quantityStepped).toHaveBeenCalledWith(1);
    // La card non ha deciso da sola: la quantita' e' ancora quella di partenza.
    expect(line.controls.quantity.value).toBe(2);
  });

  it('prezzo e quantita si modificano senza aprire la card', async () => {
    const user = userEvent.setup();
    const { line } = await setup();

    await user.clear(screen.getByLabelText('Prezzo unitario'));
    await user.type(screen.getByLabelText('Prezzo unitario'), '25,00');

    expect(line.controls.unitPrice.value).toBe('25,00');
  });

  it('da chiusa il corpo non c’e’: sconto e IVA restano fuori dalla vista primaria', async () => {
    await setup();

    expect(screen.queryByLabelText('Sconto')).toBeNull();
    expect(screen.queryByLabelText('EAN')).toBeNull();
  });

  it('da aperta compaiono i campi secondari', async () => {
    await setup({}, true);

    expect(screen.getByLabelText('Sconto')).toBeVisible();
    expect(screen.getByLabelText('EAN')).toBeVisible();
  });

  it('«Impegna magazzino» sparisce sui preventivi, dove non c’e’ niente da impegnare', async () => {
    await setup({ commitsLabel: null }, true);

    expect(screen.queryByLabelText('Impegna magazzino')).toBeNull();
  });

  it('l’avviso di disponibilita informa e non blocca: i campi restano modificabili', async () => {
    await setup({
      availabilityHint: 'Quantità oltre la disponibile (7)',
      availabilityCritical: true,
    });

    expect(screen.getByRole('status')).toHaveTextContent('Quantità oltre la disponibile (7)');
    expect(screen.getByLabelText('Quantità')).toBeEnabled();
  });

  it('in sola lettura i comandi sono spenti, ma i valori restano leggibili', async () => {
    await setup({ readOnly: true });

    expect(screen.getByRole('button', { name: 'Aumenta quantità' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Elimina riga' })).toBeDisabled();
    expect(screen.getByText('€ 39,80')).toBeVisible();
  });

  it('la testata «order» chiede conferma prima di eliminare', async () => {
    const user = userEvent.setup();
    const { on } = await setup({}, false, 'order');

    await user.click(screen.getByRole('button', { name: 'Elimina riga' }));

    expect(on.removeRequested).toHaveBeenCalled();
    expect(on.removed).not.toHaveBeenCalled();
  });

  it('la testata «registry» elimina diretta: la riga non e’ ancora un impegno', async () => {
    const user = userEvent.setup();
    const { on } = await setup({}, false, 'registry');

    await user.click(screen.getByRole('button', { name: 'Rimuovi riga' }));

    expect(on.removed).toHaveBeenCalled();
  });

  it('il pick dal pannello suggerimenti traduce l’indice nell’id variante', async () => {
    const user = userEvent.setup();
    const { on } = await setup(
      {
        suggestions: [
          { variantId: 'v-1', title: 'Maglietta — M', detail: 'SKU-01' },
          { variantId: 'v-2', title: 'Maglietta — L', detail: 'SKU-02' },
        ],
        suggestionsOpen: true,
      },
      true,
    );

    await user.click(screen.getByText('Maglietta — L'));

    expect(on.suggestionPicked).toHaveBeenCalledWith('v-2');
  });

  it('Invio su un campo codice chiede al form di cercare il prodotto', async () => {
    const user = userEvent.setup();
    const { on } = await setup({}, true);

    await user.type(screen.getByLabelText('SKU'), '{Enter}');

    expect(on.codeCommitted).toHaveBeenCalledWith('sku');
  });
});
