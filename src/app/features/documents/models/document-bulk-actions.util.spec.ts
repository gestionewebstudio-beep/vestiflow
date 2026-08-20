import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import {
  canBulkDeleteDocuments,
  DOCUMENT_TYPES_WITHOUT_BULK_DELETE,
} from './document-bulk-actions.util';

/**
 * ⛔ Perché questa prova esiste. Il 20/08/2026 la selezione multipla è passata
 * da due elenchi a **tutti** (`14` §4): senza una guardia di tipo, il pulsante
 * «Elimina» della barra massiva sarebbe comparso anche sulle Vendite al banco,
 * dove l'API risponde **409** — il difetto che `11` C 0 nomina per esteso.
 *
 * Non lo trova nessun compilatore: il pulsante compila, la chiamata parte, e il
 * rifiuto arriva a lavoro fatto, davanti a un cliente.
 */
describe('canBulkDeleteDocuments', () => {
  const doc = (type: DocumentType) => ({ type });

  it('⛔ Vendita e Reso al banco non si eliminano in blocco', () => {
    expect(canBulkDeleteDocuments([doc(DocumentType.StoreSale)])).toBe(false);
    expect(canBulkDeleteDocuments([doc(DocumentType.StoreReturn)])).toBe(false);
  });

  it('i tipi con eliminazione consentita restano eliminabili', () => {
    expect(canBulkDeleteDocuments([doc(DocumentType.Quote)])).toBe(true);
    expect(canBulkDeleteDocuments([doc(DocumentType.GoodsReceipt)])).toBe(true);
    expect(canBulkDeleteDocuments([doc(DocumentType.Transfer)])).toBe(true);
  });

  /**
   * ⚠️ Basta UNO. Un'eliminazione parziale lascerebbe l'operatore a indovinare
   * quali righe sono sparite e quali no — peggio del comando assente.
   */
  it('⚠️ un solo documento non eliminabile spegne il comando per tutta la selezione', () => {
    expect(canBulkDeleteDocuments([doc(DocumentType.Quote), doc(DocumentType.StoreSale)])).toBe(
      false,
    );
  });

  it('selezione vuota: nessun comando', () => {
    expect(canBulkDeleteDocuments([])).toBe(false);
  });

  /**
   * ⚠️ Specchio di `FLOW_ONLY_DOCUMENT_TYPES` lato API. Nessuno strumento
   * verifica che le due liste restino uguali: questa prova almeno fa arrossare
   * chi cambia quella del frontend senza accorgersene.
   */
  it('⚠️ l’elenco dei non eliminabili è quello dei tipi flow-only dell’API', () => {
    expect([...DOCUMENT_TYPES_WITHOUT_BULK_DELETE].sort()).toEqual(
      [DocumentType.StoreSale, DocumentType.StoreReturn].sort(),
    );
  });
});
