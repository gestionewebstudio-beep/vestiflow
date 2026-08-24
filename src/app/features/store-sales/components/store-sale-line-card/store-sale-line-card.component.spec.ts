import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { StoreSaleDocumentLine } from '@domain/store-sales/models/store-sale-document-line.model';

import { StoreSaleLineCardComponent } from './store-sale-line-card.component';

const RIGA: StoreSaleDocumentLine = {
  uiId: 'nuova-1',
  serverLineId: null,
  variantId: 'var-1',
  sku: 'MAG-001',
  // ⛔ Qui c'era «Maglietta Basic — M / Bianco»: la variante impastata nel
  // nome, cioe' il difetto che questa colonna elimina. Il fixture lo
  // riproduceva, quindi lo confermava.
  description: 'Maglietta Basic',
  variantLabel: 'M / Bianco',
  persistedDescription: null,
  quantity: 2,
  unitPriceMinor: 2000,
  discountPercent: 10,
  vatCodeId: 'vat-22',
  persistedVatCodeId: null,
  vatRatePercent: 22,
  loadsStock: true,
  onHand: 5,
  committed: 2,
  available: 3,
};

async function setup(
  options: { readonly line?: StoreSaleDocumentLine; readonly open?: boolean } = {},
) {
  const rendered = await render(StoreSaleLineCardComponent, {
    inputs: {
      line: options.line ?? RIGA,
      lineIndex: 0,
      open: options.open ?? false,
      priceValue: '20,00',
      priceLabel: 'Prezzo netto',
      lineTotal: '36,00 €',
      vatOptions: [{ value: 'vat-22', label: '22%' }],
      stockToggleLabel: 'Scarica giacenze',
      availabilityHint: '',
    },
  });
  return rendered;
}

describe('StoreSaleLineCardComponent', () => {
  it('a card chiusa restano i valori che si toccano di più', async () => {
    await setup();

    expect(screen.getByLabelText('Quantità')).toBeTruthy();
    expect(screen.getByLabelText('Prezzo netto')).toBeTruthy();
    expect(screen.getByText('36,00 €')).toBeTruthy();
    // Il corpo è chiuso: sconto e IVA non ci sono ancora.
    expect(screen.queryByLabelText('Sconto')).toBeNull();
  });

  it('⭐ lo SKU resta leggibile a card chiusa', async () => {
    // `11` C, 19/08: al banco, con taglie e colori, lo SKU è quello che fa
    // verificare a colpo d'occhio di aver preso la variante giusta.
    await setup();

    expect(screen.getByText(/MAG-001/)).toBeTruthy();
  });

  it('la disponibilità resta leggibile a card chiusa', async () => {
    await setup();

    expect(screen.getByText(/Disp\. 3/)).toBeTruthy();
  });

  it('l’avviso di disponibilità si legge sulla card, senza aprirla', async () => {
    const rendered = await render(StoreSaleLineCardComponent, {
      inputs: {
        line: { ...RIGA, quantity: 9 },
        lineIndex: 0,
        open: false,
        priceValue: '20,00',
        priceLabel: 'Prezzo netto',
        lineTotal: '162,00 €',
        vatOptions: [],
        stockToggleLabel: 'Scarica giacenze',
        availabilityHint: 'Quantità superiore alla disponibilità.',
      },
    });

    expect(rendered.container.textContent).toContain('Quantità superiore alla disponibilità.');
  });

  it('aperta, il corpo porta descrizione, sconto, IVA e la spunta', async () => {
    await setup({ open: true });

    expect(screen.getByLabelText('Descrizione')).toBeTruthy();
    expect(screen.getByLabelText('Sconto')).toBeTruthy();
    expect(screen.getByLabelText('Scarica giacenze')).toBeTruthy();
  });

  it('⭐ l’etichetta della spunta arriva da fuori: la card non conosce il modo', async () => {
    const rendered = await render(StoreSaleLineCardComponent, {
      inputs: {
        line: RIGA,
        lineIndex: 0,
        open: true,
        priceValue: '20,00',
        priceLabel: 'Prezzo netto',
        lineTotal: '36,00 €',
        vatOptions: [],
        stockToggleLabel: 'Carica giacenze',
        availabilityHint: '',
      },
    });

    expect(screen.getByLabelText('Carica giacenze')).toBeTruthy();
    expect(rendered.container.textContent).not.toContain('Scarica giacenze');
  });

  it('lo stepper emette il passo, non modifica la riga da sé', async () => {
    // La riga è un dato immutabile: la card chiede, la maschera decide.
    const quantityStepped = vi.fn();
    await render(StoreSaleLineCardComponent, {
      inputs: {
        line: RIGA,
        lineIndex: 0,
        open: false,
        priceValue: '20,00',
        priceLabel: 'Prezzo netto',
        lineTotal: '36,00 €',
        vatOptions: [],
        stockToggleLabel: 'Scarica giacenze',
        availabilityHint: '',
      },
      on: { quantityStepped },
    });

    await userEvent.click(screen.getByLabelText('Aumenta quantità'));

    expect(quantityStepped).toHaveBeenCalledWith(1);
  });

  it('a quantità 1 il passo indietro è spento', async () => {
    await setup({ line: { ...RIGA, quantity: 1 } });

    expect(screen.getByLabelText<HTMLButtonElement>('Diminuisci quantità').disabled).toBe(true);
  });
});
