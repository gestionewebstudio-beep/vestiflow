import { describe, expect, it } from 'vitest';

import {
  GoodsReceiptLineState,
  lineDraftHasSignificantData,
  lineDraftIsEmpty,
  lineDraftPersistableForExplicitSave,
  resolveGoodsReceiptLineState,
  type GoodsReceiptLineDraft,
} from './goods-receipt-line-state.util';

function draft(overrides: Partial<GoodsReceiptLineDraft> = {}): GoodsReceiptLineDraft {
  return {
    id: '',
    variantId: '',
    sku: '',
    barcode: '',
    productName: '',
    quantity: 1,
    unitCost: '',
    sellingPrice: '',
    compareAtPrice: '',
    vatRatePercent: '',
    loadsStock: true,
    ...overrides,
  };
}

describe('goods-receipt-line-state.util', () => {
  describe('resolveGoodsReceiptLineState', () => {
    it('classifica la riga di comodo come EMPTY_UI anche con quantità e carico default', () => {
      expect(resolveGoodsReceiptLineState(draft())).toBe(GoodsReceiptLineState.EmptyUi);
    });

    it('classifica come SEARCHING la query digitata con ricerca attiva', () => {
      expect(
        resolveGoodsReceiptLineState(draft({ productName: 'maglia' }), { searchActive: true }),
      ).toBe(GoodsReceiptLineState.Searching);
    });

    // Creazione implicita: nome valido senza articolo collegato = la riga
    // creerà l'articolo al salvataggio, nessun gesto dedicato.
    it('classifica come CREATE_NEW il nome digitato senza ricerca attiva', () => {
      expect(resolveGoodsReceiptLineState(draft({ productName: 'maglia' }))).toBe(
        GoodsReceiptLineState.CreateNew,
      );
    });

    it('classifica come PARTIAL i dati senza nome valido né articolo', () => {
      expect(resolveGoodsReceiptLineState(draft({ productName: 'C', unitCost: '9,90' }))).toBe(
        GoodsReceiptLineState.Partial,
      );
    });

    it('classifica come VALID_LOAD_STOCK la riga collegata con carico attivo', () => {
      expect(
        resolveGoodsReceiptLineState(draft({ variantId: 'v1', quantity: 2, loadsStock: true })),
      ).toBe(GoodsReceiptLineState.ValidLoadStock);
    });

    it('classifica come VALID_NO_STOCK la riga collegata con carico disattivato', () => {
      expect(
        resolveGoodsReceiptLineState(draft({ variantId: 'v1', quantity: 2, loadsStock: false })),
      ).toBe(GoodsReceiptLineState.ValidNoStock);
    });

    it('classifica come PARTIAL la riga collegata senza quantità valida', () => {
      expect(resolveGoodsReceiptLineState(draft({ variantId: 'v1', quantity: 0 }))).toBe(
        GoodsReceiptLineState.Partial,
      );
    });
  });

  describe('lineDraftIsEmpty / lineDraftHasSignificantData', () => {
    it('riconosce la riga vuota nonostante quantity=1 e loadsStock=true', () => {
      expect(lineDraftIsEmpty(draft())).toBe(true);
      expect(lineDraftHasSignificantData(draft())).toBe(false);
    });

    it('un costo digitato rende la riga significativa', () => {
      expect(lineDraftIsEmpty(draft({ unitCost: '10,00' }))).toBe(false);
      expect(lineDraftHasSignificantData(draft({ unitCost: '10,00' }))).toBe(true);
    });
  });

  describe('lineDraftPersistableForExplicitSave', () => {
    it('esclude la riga vuota di UI', () => {
      expect(lineDraftPersistableForExplicitSave(draft())).toBe(false);
    });

    it('include la riga collegata con quantità positiva', () => {
      expect(lineDraftPersistableForExplicitSave(draft({ variantId: 'v1', quantity: 3 }))).toBe(
        true,
      );
    });

    // Creazione implicita: il solo nome digitato basta — al salvataggio
    // esplicito la riga crea l'articolo (e col carico attivo, il movimento).
    it('include la riga con solo il nome digitato (creazione implicita)', () => {
      expect(
        lineDraftPersistableForExplicitSave(draft({ productName: 'Cintura', quantity: 2 })),
      ).toBe(true);
    });

    it('include la riga con nome e dati economici', () => {
      expect(
        lineDraftPersistableForExplicitSave(
          draft({ productName: 'Cintura', quantity: 2, unitCost: '9,90' }),
        ),
      ).toBe(true);
    });

    // Solo nome senza quantità → al salvataggio esplicito si crea la sola
    // anagrafica (nessuna riga documento lato server).
    it('include la riga con nome anche a quantità zero (solo anagrafica)', () => {
      expect(
        lineDraftPersistableForExplicitSave(draft({ productName: 'Cintura', quantity: 0 })),
      ).toBe(true);
    });

    it('esclude la riga con nome troppo corto e quantità zero', () => {
      expect(lineDraftPersistableForExplicitSave(draft({ productName: 'C', quantity: 0 }))).toBe(
        false,
      );
    });

    it('esclude i dati economici a quantità zero senza nome valido', () => {
      expect(
        lineDraftPersistableForExplicitSave(
          draft({ productName: 'C', quantity: 0, unitCost: '9,90' }),
        ),
      ).toBe(false);
    });
  });
});
