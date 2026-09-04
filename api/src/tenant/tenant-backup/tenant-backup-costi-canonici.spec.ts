import { describe, expect, it } from 'vitest';

import { normalizzaCostiCanonici } from './tenant-backup-import.service';

/**
 * Un backup prodotto PRIMA della migration `20260823010000_costi_canonici_not_null`
 * porta `null` nei costi. Reinserirlo così com'è farebbe fallire il ripristino
 * con violazione di vincolo — e il ripristino è l'unica strada che un cliente ha
 * per rimettere in piedi i propri dati.
 */
describe('normalizzaCostiCanonici — backup legacy con costi null', () => {
  it('la variante di un backup vecchio entra con costo zero, non con null', () => {
    const riga = normalizzaCostiCanonici({
      id: 'var-1',
      sku: 'SKU-1',
      sellingPriceMinor: 2500,
      purchasePriceMinor: null,
    });

    expect(riga.purchasePriceMinor).toBe(0);
    expect(riga.sellingPriceMinor).toBe(2500);
  });

  it('il movimento entra con entrambi i costi a zero', () => {
    const riga = normalizzaCostiCanonici({
      id: 'mov-1',
      quantity: 3,
      unitCostMinor: null,
      totalCostMinor: null,
    });

    expect(riga.unitCostMinor).toBe(0);
    expect(riga.totalCostMinor).toBe(0);
  });

  it('il collegamento fornitore entra con ultimo prezzo zero', () => {
    expect(normalizzaCostiCanonici({ lastPurchasePriceMinor: null }).lastPurchasePriceMinor).toBe(
      0,
    );
  });

  it('un costo già valorizzato non si tocca, coda decimale compresa', () => {
    const riga = normalizzaCostiCanonici({ purchasePriceMinor: 84.4262, unitCostMinor: 0 });

    expect(riga.purchasePriceMinor).toBe(84.4262);
    expect(riga.unitCostMinor).toBe(0);
  });

  it('una chiave ASSENTE resta assente: la colonna ha il proprio DEFAULT', () => {
    const riga = normalizzaCostiCanonici({ id: 'var-2', sku: 'SKU-2' });

    expect('purchasePriceMinor' in riga).toBe(false);
  });

  /**
   * ⚠️ I costi della riga documento restano nullable per decisione esplicita:
   * `document_lines` è condivisa da tipi documento che il costo non lo gestiscono
   * affatto, e lì l'assenza ha un significato tecnico proprio.
   */
  it('NON tocca i costi opzionali della riga documento', () => {
    const riga = normalizzaCostiCanonici({
      enteredUnitCost: null,
      unitCostNet: null,
      unitCostGross: null,
      unitVatAmount: null,
    });

    expect(riga.enteredUnitCost).toBeNull();
    expect(riga.unitCostNet).toBeNull();
    expect(riga.unitCostGross).toBeNull();
    expect(riga.unitVatAmount).toBeNull();
  });

  it('senza costi da normalizzare restituisce la riga originale, senza copiarla', () => {
    const originale = { id: 'x', purchasePriceMinor: 100 };

    expect(normalizzaCostiCanonici(originale)).toBe(originale);
  });
});
