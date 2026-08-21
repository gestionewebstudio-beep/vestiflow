import { describe, expect, it } from 'vitest';

import { DocumentType } from '@core/models/document.model';

import {
  canBulkDeleteDocuments,
  DOCUMENT_TYPES_WITHOUT_BULK_DELETE,
} from './document-bulk-actions.util';

/**
 * ⛔ Perché questa prova esiste. Il 20/08/2026 la selezione multipla è passata
 * da due elenchi a **tutti** (`14` §4): senza una guardia di tipo, il pulsante
 * «Elimina» della barra massiva sarebbe comparso su documenti che l'API
 * rifiuta — un rifiuto che arriva a lavoro fatto, davanti a un cliente.
 *
 * ⭐ **Il 22/08/2026 la guardia si è svuotata, e le prove sono state ROVESCIATE**
 * invece che cancellate: Vendita e Reso al banco erano l'unico contenuto
 * dell'elenco, e col passo 14 si eliminano — l'eliminazione neutralizza i propri
 * movimenti e restituisce la merce (`11` A2). Un elenco che li escludeva ancora
 * avrebbe spento un comando che ora funziona.
 */
describe('canBulkDeleteDocuments', () => {
  const doc = (type: DocumentType) => ({ type });

  it('⭐ Vendita e Reso al banco SI eliminano, anche in blocco', () => {
    expect(canBulkDeleteDocuments([doc(DocumentType.StoreSale)])).toBe(true);
    expect(canBulkDeleteDocuments([doc(DocumentType.StoreReturn)])).toBe(true);
  });

  it('i tipi con eliminazione consentita restano eliminabili', () => {
    expect(canBulkDeleteDocuments([doc(DocumentType.Quote)])).toBe(true);
    expect(canBulkDeleteDocuments([doc(DocumentType.GoodsReceipt)])).toBe(true);
    expect(canBulkDeleteDocuments([doc(DocumentType.Transfer)])).toBe(true);
  });

  /**
   * ⚠️ Basta UNO. Un'eliminazione parziale lascerebbe l'operatore a indovinare
   * quali righe sono sparite e quali no — peggio del comando assente. La regola
   * resta, e resta provata: cambia solo che oggi nessun tipo la fa scattare.
   */
  it('⚠️ «basta uno» resta la regola, ma oggi NON è esercitabile — e lo dice', () => {
    // Con l'elenco vuoto nessun documento la fa scattare: la riga che la
    // implementa è l'`every` della funzione, e questa prova tornerà a
    // esercitarla il giorno che un tipo rientra nell'elenco. Fingerla con un
    // tipo inventato proverebbe il cast, non la regola.
    expect(DOCUMENT_TYPES_WITHOUT_BULK_DELETE).toHaveLength(0);
    expect(canBulkDeleteDocuments([doc(DocumentType.Quote), doc(DocumentType.StoreSale)])).toBe(
      true,
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
  it('⚠️ oggi nessun tipo è escluso: l’API non rifiuta più nessuna eliminazione', () => {
    expect(DOCUMENT_TYPES_WITHOUT_BULK_DELETE).toEqual([]);
  });
});
