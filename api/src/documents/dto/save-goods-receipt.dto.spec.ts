// ⚠️ I decoratori leggono i metadati via `Reflect.getMetadata`, che in Node non
// esiste finché non lo installa questo polyfill. L'applicazione lo carica
// all'avvio (NestJS lo importa per suo conto), l'ambiente di test dell'API no.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { SaveGoodsReceiptLineDto, SaveGoodsReceiptNewProductDto } from './save-goods-receipt.dto';

/**
 * **La coda decimale del denaro passa il cancello dove la colonna la regge, e
 * non passa dove ancora non la regge.**
 *
 * ⛔ Difetto misurato il 22/08/2026, e non era latente: cinque campi di questo
 * DTO erano `@IsInt()` mentre la loro colonna è già `NUMERIC(16,6)`. Un prezzo
 * nato da uno scorporo IVA — e sull'Arrivo merce il costo si digita ivato —
 * vale 2049,180328 centesimi netti: veniva **rifiutato con 422**, e la coda che
 * fa tornare il valore quando lo si rimostra ivato non poteva nemmeno entrare.
 *
 * ⚠️ La prova non si può fare dal servizio: i suoi test non passano dalla
 * `ValidationPipe`. Il rifiuto vive nei decoratori, quindi va provato lì.
 */
describe('SaveGoodsReceipt — la coda decimale al cancello', () => {
  const CODA = 2049.1803; // netto esatto di 2500 ivati al 22%, in centesimi

  const riga = (extra: Record<string, unknown>) =>
    validateSync(
      plainToInstance(SaveGoodsReceiptLineDto, { quantity: 1, ...extra }),
      { whitelist: false },
    ).flatMap((e) => Object.keys(e.constraints ?? {}).map(() => e.property));

  const nuovoArticolo = (extra: Record<string, unknown>) =>
    validateSync(
      plainToInstance(SaveGoodsReceiptNewProductDto, { ...extra }),
      { whitelist: false },
    ).map((e) => e.property);

  describe('⭐ passa dove la colonna è già NUMERIC(16,6)', () => {
    for (const campo of ['unitPriceMinor', 'enteredUnitCostMinor', 'sellingPriceMinor', 'shopifyPriceMinor']) {
      it(`«${campo}» accetta la coda`, () => {
        expect(riga({ [campo]: CODA })).not.toContain(campo);
      });
    }

    for (const campo of ['sellingPriceMinor', 'compareAtPriceMinor']) {
      it(`«${campo}» del nuovo articolo accetta la coda`, () => {
        expect(nuovoArticolo({ [campo]: CODA })).not.toContain(campo);
      });
    }
  });

  describe('⭐ e dal 22/08/2026 passa anche il costo dell’articolo nuovo', () => {
    it('«purchasePriceMinor» accetta la coda: la colonna la regge', () => {
      // ⚠️ Questo test asseriva l'OPPOSTO, e il suo commento diceva «il giorno
      // in cui la migration passa, questo test cambia insieme al decoratore —
      // ed è il promemoria che serve». È arrivato quel giorno:
      // `product_variants.purchase_price_minor` è `NUMERIC(16,6)`, e il cancello
      // che proteggeva dal troncamento silenzioso non serve più.
      expect(nuovoArticolo({ purchasePriceMinor: CODA })).not.toContain('purchasePriceMinor');
    });

    it('⛔ ma oltre 4 cifre di centesimo resta rumore, non precisione', () => {
      expect(nuovoArticolo({ purchasePriceMinor: 2049.180328 })).toContain('purchasePriceMinor');
    });
  });

  describe('⛔ e il cancello resta chiuso a ciò che non è denaro', () => {
    it('oltre 4 cifre di centesimo non è precisione, è rumore', () => {
      expect(riga({ unitPriceMinor: 2049.180328 })).toContain('unitPriceMinor');
    });

    it('un valore negativo resta rifiutato', () => {
      expect(riga({ unitPriceMinor: -1 })).toContain('unitPriceMinor');
    });

    it('⭐ e un intero tondo continua a passare', () => {
      // L'asserzione che manca sempre: che il valore GIUSTO sia accettato.
      expect(riga({ unitPriceMinor: 2500 })).not.toContain('unitPriceMinor');
    });
  });
});
