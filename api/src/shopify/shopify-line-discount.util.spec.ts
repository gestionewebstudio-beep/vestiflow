import { describe, expect, it } from 'vitest';

import {
  mapShopifyLineDiscountMinor,
  shopifyLineTotalMinor,
} from './shopify-line-discount.util';

describe('mapShopifyLineDiscountMinor', () => {
  it('sconto a IMPORTO sull\'ordine: total_discount è ZERO, l\'importo sta nelle allocazioni', () => {
    // ⚠️ Payload vero di #1010, letto il 15/08/2026. Sconto di 12,00 € inserito
    // come importo sull'ordine intero (`fixed_amount`, `allocation_method:
    // across`): Shopify lo ripartisce da sé sulle righe — non c'è niente da
    // spalmare a mano — ma lo scrive SOLO in `discount_allocations`.
    //
    // `total_discount` resta a `0.00`, e il registro difetti 3.9 dava i due
    // campi come alternative equivalenti: non lo sono. Usare `total_discount`
    // come fonte avrebbe lasciato il difetto in piedi esattamente su questo
    // caso, che è quello che un negozio usa per fare uno sconto in euro.
    expect(
      mapShopifyLineDiscountMinor({
        price: '25.00',
        quantity: 1,
        total_discount: '0.00',
        discount_allocations: [{ amount: '12.00', discount_application_index: 0 }],
      }),
    ).toBe(1200);
  });

  it('più sconti sulla stessa riga: si sommano', () => {
    expect(
      mapShopifyLineDiscountMinor({
        discount_allocations: [{ amount: '5.00' }, { amount: '2.50' }],
      }),
    ).toBe(750);
  });

  it('senza allocazioni ripiega su total_discount', () => {
    expect(mapShopifyLineDiscountMinor({ total_discount: '8.00' })).toBe(800);
    expect(mapShopifyLineDiscountMinor({ total_discount: '8.00', discount_allocations: [] })).toBe(
      800,
    );
  });

  it('riga senza sconto: zero, non un dato mancante', () => {
    expect(mapShopifyLineDiscountMinor({ price: '10.00' })).toBe(0);
  });
});

describe('shopifyLineTotalMinor', () => {
  it('il caso misurato: la riga deve fare il subtotale dell\'ordine', () => {
    // #1010, letto il 15/08/2026: maglietta 25,00, sconto allocato 12,00,
    // `subtotal_price` 13,00. Prima si scriveva 25,00 e la riga non faceva il
    // totale. L'imposta che Shopify dichiara sulla riga — 2,34 al 22% — è
    // calcolata sui 13,00 scontati: con il totale pieno non tornerebbe nemmeno
    // l'aliquota.
    expect(shopifyLineTotalMinor(2500, 1, 1200)).toBe(1300);
  });

  it('perché lo sconto NON si converte in percentuale', () => {
    // 16,00 su 3 pezzi da 20,00: il totale vero è 44,00. Passando per la
    // percentuale (26,6667%) il motore dell'ordine manuale sconta il prezzo
    // UNITARIO e lo arrotonda prima di moltiplicare: 14,67 × 3 = 44,01.
    // Un centesimo, strutturale — ed è il motivo per cui la riga importata
    // conserva prezzo pieno e totale effettivo invece di una percentuale.
    expect(shopifyLineTotalMinor(2000, 3, 1600)).toBe(4400);

    const perUnitRounded = Math.round(2000 * (1 - 1600 / 6000));
    expect(perUnitRounded * 3).toBe(4401);
  });

  it('lo sconto resta ricavabile per differenza, al centesimo', () => {
    const unitPriceMinor = 2000;
    const quantity = 3;
    const totalMinor = shopifyLineTotalMinor(unitPriceMinor, quantity, 1600);

    expect(unitPriceMinor * quantity - totalMinor).toBe(1600);
  });

  it('non produce mai un totale negativo', () => {
    expect(shopifyLineTotalMinor(1000, 1, 1500)).toBe(0);
  });
});
