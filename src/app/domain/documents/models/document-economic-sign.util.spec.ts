import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';
import type { Money } from '@core/models/money.model';

import {
  MIXED_REGISTER_ECONOMIC_SIGN,
  documentEconomicSign,
  hasDeclaredEconomicSign,
  signedDocumentMoney,
} from './document-economic-sign.util';

const euro = (amountMinor: number): Money => ({ amountMinor, currencyCode: 'EUR' });

describe('documentEconomicSign', () => {
  /** I cinque tipi normativi di `15c` §3, e sono l'intero perimetro. */
  it('⭐ i tipi dei registri misti hanno la direzione della matrice', () => {
    expect(documentEconomicSign(DocumentType.Invoice)).toBe(1);
    expect(documentEconomicSign(DocumentType.InvoiceAccompanying)).toBe(1);
    expect(documentEconomicSign(DocumentType.CreditNote)).toBe(-1);
    expect(documentEconomicSign(DocumentType.StoreSale)).toBe(1);
    expect(documentEconomicSign(DocumentType.StoreReturn)).toBe(-1);
  });

  /**
   * ⛔ **La mappa copre CINQUE tipi, non diciotto.**
   *
   * Qui la prova chiedeva che ogni `DocumentType` avesse una direzione
   * dichiarata, e la mappa gliela dava: Trasferimento, Rettifica, Inventario e
   * Ordine fornitore risultavano documenti economicamente `+1`. Era una
   * direzione **dedotta**, non decisa, su tipi che in un registro misto non
   * sono mai stati.
   */
  it('⛔ nessuna direzione dichiarata fuori dal perimetro misto', () => {
    expect(Object.keys(MIXED_REGISTER_ECONOMIC_SIGN).sort()).toEqual(
      [
        DocumentType.Invoice,
        DocumentType.InvoiceAccompanying,
        DocumentType.CreditNote,
        DocumentType.StoreSale,
        DocumentType.StoreReturn,
      ].sort(),
    );

    for (const tipo of [
      DocumentType.Transfer,
      DocumentType.Adjustment,
      DocumentType.Inventory,
      DocumentType.SupplierOrder,
      DocumentType.GoodsReceipt,
      DocumentType.Quote,
    ]) {
      expect(hasDeclaredEconomicSign(tipo)).toBe(false);
    }
  });

  /**
   * ⛔ **Fuori dal perimetro lo snapshot torna INVARIATO**, e non moltiplicato
   * per uno.
   *
   * Qui la prova chiedeva che `documentEconomicSign` restituisse `1` o `-1`
   * per OGNI `DocumentType`, e la funzione lo faceva con un ripiego: era la
   * direzione economica attribuita per fallback che `15c` §3 e §12.1 vietano.
   * Ora quella chiamata non compila nemmeno, e la proprietà da provare è
   * un’altra: il valore persistito passa senza che nessuno lo interpreti.
   */
  it('⭐ fuori dal perimetro lo snapshot passa invariato', () => {
    for (const tipo of Object.values(DocumentType)) {
      if (hasDeclaredEconomicSign(tipo)) {
        continue;
      }
      const snapshot = euro(1234);
      expect(signedDocumentMoney(tipo, snapshot), `${tipo}`).toEqual(snapshot);
    }
  });

  /**
   * ⚠️ Solo due tipi sottraggono, e vanno inchiodati per ESCLUSIONE: se un
   * domani qualcuno mettesse `-1` su un tipo che aggiunge, un totale
   * cambierebbe segno senza che nessuna prova positiva se ne accorga.
   */
  it('⛔ sottraggono soltanto Nota di credito e Reso al banco', () => {
    const negativi = Object.values(DocumentType).filter(
      (t) => signedDocumentMoney(t, euro(100)).amountMinor < 0,
    );
    expect(new Set(negativi)).toEqual(new Set([DocumentType.CreditNote, DocumentType.StoreReturn]));
  });
});

describe('signedDocumentMoney', () => {
  it('⭐ il contributo firmato non tocca il valore persistito, ne cambia il verso', () => {
    const persistito = euro(3000);

    expect(signedDocumentMoney(DocumentType.Invoice, persistito)).toEqual(euro(3000));
    expect(signedDocumentMoney(DocumentType.CreditNote, persistito)).toEqual(euro(-3000));
    expect(persistito).toEqual(euro(3000));
  });

  it('⭐ conserva la valuta', () => {
    const usd: Money = { amountMinor: 500, currencyCode: 'USD' };
    expect(signedDocumentMoney(DocumentType.StoreReturn, usd).currencyCode).toBe('USD');
  });

  /** Il caso di accettazione di `15c` §12.2 e §12.4, sulla sola autorità. */
  it('⭐ Fattura 100 + Nota di credito 30 = 70', () => {
    const somma =
      signedDocumentMoney(DocumentType.Invoice, euro(10000)).amountMinor +
      signedDocumentMoney(DocumentType.CreditNote, euro(3000)).amountMinor;
    expect(somma).toBe(7000);
  });

  it('⭐ Vendita 100 + Reso 30 = 70', () => {
    const somma =
      signedDocumentMoney(DocumentType.StoreSale, euro(10000)).amountMinor +
      signedDocumentMoney(DocumentType.StoreReturn, euro(3000)).amountMinor;
    expect(somma).toBe(7000);
  });

  /**
   * ⚠️ **Le tre grandezze si firmano SEPARATAMENTE** (`15c` §6.3): imponibile,
   * IVA e totale sono snapshot già chiusi dal documento, e non si ricompone
   * `totale = imponibile + IVA`. La prova usa numeri che NON tornano fra loro,
   * apposta: se qualcuno ricomponesse, cadrebbe.
   */
  it('⛔ firma ogni grandezza separatamente, senza ricomporre il totale', () => {
    const imponibile = signedDocumentMoney(DocumentType.CreditNote, euro(2459));
    const iva = signedDocumentMoney(DocumentType.CreditNote, euro(541));
    const totale = signedDocumentMoney(DocumentType.CreditNote, euro(2999));

    expect(imponibile.amountMinor).toBe(-2459);
    expect(iva.amountMinor).toBe(-541);
    expect(totale.amountMinor).toBe(-2999);
    expect(totale.amountMinor).not.toBe(imponibile.amountMinor + iva.amountMinor);
  });

  /**
   * Falsificazione 6 di `15c` §13: il contributo dipende solo dallo snapshot
   * ricevuto. Se leggesse un prezzo corrente, un cambio di listino cambierebbe
   * il passato.
   */
  it('⛔ il contributo dipende SOLO dallo snapshot ricevuto, mai da un valore esterno', () => {
    const aMarzo = signedDocumentMoney(DocumentType.CreditNote, euro(2500));
    const aSettembre = signedDocumentMoney(DocumentType.CreditNote, euro(3100));

    expect(aMarzo.amountMinor).toBe(-2500);
    expect(aSettembre.amountMinor).toBe(-3100);
    expect(aMarzo.amountMinor).not.toBe(aSettembre.amountMinor);
  });

  it('⛔ è pura: stesso ingresso, stesso risultato, nessuna mutazione', () => {
    const snapshot = euro(4200);

    const primo = signedDocumentMoney(DocumentType.StoreReturn, snapshot);
    const secondo = signedDocumentMoney(DocumentType.StoreReturn, snapshot);

    expect(primo).toEqual(secondo);
    expect(snapshot).toEqual(euro(4200));
  });
});
