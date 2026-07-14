import { describe, expect, it } from 'vitest';

import {
  GoodsReceiptLineState,
  lineDraftHasSignificantData,
  lineDraftIsEmpty,
  lineDraftIsSearchQueryOnly,
  lineDraftPersistableForAutoSave,
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
    createNew: false,
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

    it('classifica come PARTIAL il testo digitato senza ricerca attiva', () => {
      expect(resolveGoodsReceiptLineState(draft({ productName: 'maglia' }))).toBe(
        GoodsReceiptLineState.Partial,
      );
    });

    it('classifica come CREATE_NEW_EXPLICIT solo dopo azione esplicita', () => {
      expect(resolveGoodsReceiptLineState(draft({ productName: 'maglia', createNew: true }))).toBe(
        GoodsReceiptLineState.CreateNewExplicit,
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

  describe('lineDraftIsSearchQueryOnly', () => {
    it('riconosce come query il solo nome digitato', () => {
      expect(lineDraftIsSearchQueryOnly(draft({ productName: 'maglia uomo' }))).toBe(true);
    });

    it('non è query se ci sono altri dati (costo)', () => {
      expect(
        lineDraftIsSearchQueryOnly(draft({ productName: 'Trasporto', unitCost: '15,00' })),
      ).toBe(false);
    });

    it('non è query se la riga è persistita, collegata o in creazione esplicita', () => {
      expect(lineDraftIsSearchQueryOnly(draft({ productName: 'x', id: 'line-1' }))).toBe(false);
      expect(lineDraftIsSearchQueryOnly(draft({ productName: 'x', variantId: 'v1' }))).toBe(false);
      expect(lineDraftIsSearchQueryOnly(draft({ productName: 'x', createNew: true }))).toBe(false);
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

    it('esclude la query di ricerca (solo nome) anche al salvataggio esplicito', () => {
      expect(
        lineDraftPersistableForExplicitSave(draft({ productName: 'Cintura', quantity: 2 })),
      ).toBe(false);
    });

    it('include la riga parziale con dati economici (senza movimento)', () => {
      expect(
        lineDraftPersistableForExplicitSave(
          draft({ productName: 'Cintura', quantity: 2, unitCost: '9,90' }),
        ),
      ).toBe(true);
    });

    it('include la riga in creazione esplicita con nome e quantità', () => {
      expect(
        lineDraftPersistableForExplicitSave(
          draft({ productName: 'Cintura', quantity: 2, createNew: true }),
        ),
      ).toBe(true);
    });

    // Punto A: solo nome senza quantità → al salvataggio esplicito si crea
    // la sola anagrafica (nessuna riga documento lato server).
    it('include la riga createNew con nome anche a quantità zero (solo anagrafica)', () => {
      expect(
        lineDraftPersistableForExplicitSave(
          draft({ productName: 'Cintura', quantity: 0, createNew: true }),
        ),
      ).toBe(true);
    });

    it('esclude la riga createNew con nome troppo corto e quantità zero', () => {
      expect(
        lineDraftPersistableForExplicitSave(
          draft({ productName: 'C', quantity: 0, createNew: true }),
        ),
      ).toBe(false);
    });

    it('esclude righe con quantità zero senza articolo', () => {
      expect(
        lineDraftPersistableForExplicitSave(
          draft({ productName: 'Cintura', quantity: 0, unitCost: '9,90' }),
        ),
      ).toBe(false);
    });
  });

  describe('lineDraftPersistableForAutoSave', () => {
    it('esclude la query di ricerca (testo digitato, nessun articolo, nessun id)', () => {
      expect(lineDraftPersistableForAutoSave(draft({ productName: 'maglia uomo' }))).toBe(false);
    });

    // Punto C: l'autosave passivo non crea MAI articoli — le righe createNew
    // senza id/variantId restano fuori dal payload anche se complete.
    it('esclude la riga createNew completa senza id: nessuna creazione da autosave', () => {
      expect(
        lineDraftPersistableForAutoSave(
          draft({ productName: 'Cintura', quantity: 2, unitCost: '9,90', createNew: true }),
        ),
      ).toBe(false);
    });

    it('include la riga con articolo collegato', () => {
      expect(lineDraftPersistableForAutoSave(draft({ variantId: 'v1', quantity: 1 }))).toBe(true);
    });

    it('include la riga parziale già persistita (id server) per non cancellarla', () => {
      expect(
        lineDraftPersistableForAutoSave(draft({ id: 'line-1', productName: 'Riga economica' })),
      ).toBe(true);
    });

    it('esclude la riga vuota anche se già persistita e poi svuotata', () => {
      expect(lineDraftPersistableForAutoSave(draft({ id: 'line-1' }))).toBe(false);
    });
  });
});
