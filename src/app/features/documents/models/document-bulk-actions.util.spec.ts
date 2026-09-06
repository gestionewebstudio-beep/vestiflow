import { describe, expect, it } from 'vitest';

import { DocumentStatus, DocumentType } from '@core/models/document.model';

import {
  bulkDeleteBlockReason,
  canBulkDeleteDocuments,
  canDeleteDocument,
  DOCUMENT_TYPES_WITHOUT_BULK_DELETE,
} from './document-bulk-actions.util';

/**
 * ⛔ **Perché questa prova è stata riscritta il 30/08/2026.**
 *
 * Il client aveva DUE regole di eliminabilità che non concordavano: il menu di
 * riga guardava tipo e stato, la barra di selezione rispondeva **sempre di sì**
 * — la lista di esclusione era vuota, e vuota significava «tutto si elimina».
 *
 * Su una fattura confermata la barra offriva Elimina e l'API rispondeva `409`,
 * dopo aver fatto premere l'operatore. Le prove di prima **certificavano il
 * difetto**: asseriva `true` su un trasferimento, che l'API rifiuta se
 * confermato.
 *
 * ⭐ Le condizioni qui sotto sono quelle di `api/src/documents/documents.service.ts`
 * §delete, una per una. Se cambia là, questa prova arrossisce qui.
 */
describe('canDeleteDocument — specchio della regola API', () => {
  const doc = (
    type: DocumentType,
    status: DocumentStatus = DocumentStatus.Confirmed,
    linkStatus?: string,
  ) => ({ type, status, linkStatus });

  describe('bozza e annullato: sempre', () => {
    it.each([
      ['bozza', DocumentStatus.Draft],
      ['annullato', DocumentStatus.Cancelled],
    ])('un trasferimento %s si elimina', (_nome, status) => {
      expect(canDeleteDocument(doc(DocumentType.Transfer, status))).toBe(true);
    });
  });

  describe('confermati: solo i tipi che l’API accetta', () => {
    it.each([
      ['arrivo merce', DocumentType.GoodsReceipt],
      ['carico manuale', DocumentType.ManualLoad],
      ['carico iniziale', DocumentType.InitialLoad],
      ['registrazione fattura fornitore', DocumentType.SupplierInvoice],
      ['vendita manuale', DocumentType.ManualUnload],
      ['preventivo', DocumentType.Quote],
      ['vendita al banco', DocumentType.StoreSale],
      ['reso al banco', DocumentType.StoreReturn],
    ])('%s confermato si elimina', (_nome, type) => {
      expect(canDeleteDocument(doc(type))).toBe(true);
    });

    /**
     * ⛔ **Questi sono il difetto misurato.** La barra li offriva, l'API li
     * rifiuta con «Solo i documenti in bozza o annullati possono essere
     * eliminati».
     */
    it.each([
      ['trasferimento', DocumentType.Transfer],
      ['rettifica', DocumentType.Adjustment],
      ['DDT vendita', DocumentType.SalesDdt],
    ])('%s confermato NON si elimina', (_nome, type) => {
      expect(canDeleteDocument(doc(type))).toBe(false);
    });
  });

  /**
   * ⚠️ **Il collegamento alla fattura vale per TUTTI**, non solo per la famiglia
   * carico: l'API lo verifica dopo lo `switch`, quindi qualunque documento
   * collegato viene rifiutato. La vecchia regola del menu lo guardava solo sugli
   * arrivi merce.
   */
  it('⛔ un arrivo merce collegato a una fattura non si elimina, nemmeno in bozza', () => {
    expect(canDeleteDocument(doc(DocumentType.GoodsReceipt, DocumentStatus.Draft, 'linked'))).toBe(
      false,
    );
    expect(canDeleteDocument(doc(DocumentType.GoodsReceipt, DocumentStatus.Confirmed))).toBe(true);
  });
});

describe('canBulkDeleteDocuments', () => {
  const doc = (type: DocumentType, status: DocumentStatus = DocumentStatus.Confirmed) => ({
    type,
    status,
  });

  it('tutti eliminabili: il comando si accende', () => {
    expect(
      canBulkDeleteDocuments([doc(DocumentType.Quote), doc(DocumentType.StoreSale)]),
    ).toBe(true);
  });

  /**
   * ⚠️ Basta UNO. Un'eliminazione parziale lascerebbe l'operatore a indovinare
   * quali righe sono sparite e quali no — peggio del comando assente.
   */
  it('⚠️ basta UN documento non eliminabile perché il comando si spenga', () => {
    expect(
      canBulkDeleteDocuments([doc(DocumentType.Quote), doc(DocumentType.Transfer)]),
    ).toBe(false);
  });

  it('selezione vuota: nessun comando', () => {
    expect(canBulkDeleteDocuments([])).toBe(false);
  });

  /**
   * ⚠️ Specchio di `FLOW_ONLY_DOCUMENT_TYPES` lato API. Nessuno strumento
   * verifica che le due liste restino uguali: questa prova almeno fa arrossare
   * chi cambia quella del frontend senza accorgersene.
   */
  it('⚠️ nessun tipo è escluso a priori: il divieto viene dallo STATO, non dalla lista', () => {
    expect(DOCUMENT_TYPES_WITHOUT_BULK_DELETE).toEqual([]);
  });
});

describe('bulkDeleteBlockReason — nomina la causa, non il divieto', () => {
  const doc = (type: DocumentType, status: DocumentStatus = DocumentStatus.Confirmed, linkStatus?: string) => ({
    type,
    status,
    linkStatus,
  });

  it('selezione vuota', () => {
    expect(bulkDeleteBlockReason([])).toBe('Seleziona almeno un documento.');
  });

  it('tutto eliminabile: nessun motivo', () => {
    expect(bulkDeleteBlockReason([doc(DocumentType.Quote)])).toBeNull();
  });

  it('⭐ il collegamento alla fattura ha un messaggio suo: dice cosa fare', () => {
    const motivo = bulkDeleteBlockReason([
      doc(DocumentType.GoodsReceipt, DocumentStatus.Confirmed, 'linked'),
    ]);

    expect(motivo).toContain('scollegalo');
  });

  it('confermati non eliminabili: lo stato, non il tipo', () => {
    expect(bulkDeleteBlockReason([doc(DocumentType.Transfer)])).toContain('confermati');
  });
});
