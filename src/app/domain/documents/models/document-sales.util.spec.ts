import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import {
  isInvoiceAccompanyingDocumentType,
  isSalesInvoiceDocumentType,
  supportsLinkedSalesDdt,
} from './document-sales.util';

/**
 * ⛔ **Fattura accompagnatoria: mai DDT** (`12` §matrice, confermato dal
 * proprietario il 22/08/2026 — la matrice non si riapre sulla base del codice).
 *
 * L'accompagnatoria **sostituisce** il DDT nella stessa uscita: agganciarne uno
 * è la stessa contraddizione di una Fattura dentro un DDT.
 */
describe('supportsLinkedSalesDdt', () => {
  it('⛔ l’accompagnatoria NON aggancia DDT', () => {
    expect(supportsLinkedSalesDdt(DocumentType.InvoiceAccompanying)).toBe(false);
  });

  it('⭐ la Fattura sì: è la fattura differita', () => {
    // DDT durante il periodo, Fattura che li riepiloga. Alimenta i riferimenti
    // nell'XML FatturaPA e la riga «Riferimento DDT» in stampa: è la ragione
    // per cui il collegamento esiste, ed è legittima.
    expect(supportsLinkedSalesDdt(DocumentType.Invoice)).toBe(true);
  });

  it('⛔ la Nota di credito nemmeno, e non per un divieto testuale', () => {
    // ⚠️ Qui c'era l'asserzione OPPOSTA, con la motivazione «nessuna regola
    // scritta le vieta il collegamento». Non basta: la matrice dice che la NC
    // non usa «Includi documento» e nasce da Fattura o Accompagnatoria — un DDT
    // non è una sua sorgente. Verificato che non le serva a niente: non genera
    // XML FatturaPA, e in stampa i DDT che la riguardano sono quelli della
    // fattura originaria.
    //
    // ⭐ Se un giorno servissero fiscalmente, si recuperano attraverso la
    // relazione con la fattura di origine (`sourceDocumentId`), non aprendo un
    // ingresso DDT → Nota di credito: il primo conserva la catena, il secondo
    // inventa una sorgente che il modello documentale non prevede.
    expect(supportsLinkedSalesDdt(DocumentType.CreditNote)).toBe(false);
  });

  it('⛔ NON è la famiglia intera, ed è la distinzione che mancava', () => {
    // `isSalesInvoiceDocumentType` è giusta per XML, numeratore e azioni
    // fiscali. La maschera la usava anche per il Riferimento DDT, e offriva
    // l'aggancio dove la matrice lo vieta: il codice permetteva ciò che la
    // specifica proibisce.
    expect(isSalesInvoiceDocumentType(DocumentType.InvoiceAccompanying)).toBe(true);
    expect(isInvoiceAccompanyingDocumentType(DocumentType.InvoiceAccompanying)).toBe(true);
    expect(supportsLinkedSalesDdt(DocumentType.InvoiceAccompanying)).toBe(false);
  });

  it('⛔ e non risponde “sì” a chi non è della famiglia', () => {
    for (const type of [DocumentType.SalesDdt, DocumentType.Quote, DocumentType.StoreSale]) {
      expect(supportsLinkedSalesDdt(type), String(type)).toBe(false);
    }
  });
});
