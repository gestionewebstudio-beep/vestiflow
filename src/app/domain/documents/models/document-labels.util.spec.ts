import { describe, expect, it } from 'vitest';

import {
  DocumentStatus,
  DocumentType,
  GoodsReceiptLinkStatus,
  type LinkedPurchaseInvoiceInfo,
} from '@core/models/document.model';

import {
  type CounterpartyDocRef,
  counterpartyDocLabel,
  documentReferenceLabel,
  documentStatusDisplayLabel,
  documentStatusDisplayTone,
  documentStatusLabel,
  documentStatusLabelForType,
  documentStatusTone,
  documentTypeLabel,
  goodsReceiptLinkStatusLabel,
  goodsReceiptLinkStatusTone,
} from './document-labels.util';

/** Nessuna data emessa esternamente: il caso normale della fattura. */
const NON_EMESSA = { externallyIssuedAt: undefined } as const;

/**
 * Ora centrale della giornata: il giorno formattato resta il 17 agosto sia in
 * UTC sia nel fuso locale, così l'attesa non dipende dalla macchina che gira.
 */
const IL_17_AGOSTO = '2025-08-17T09:00:00.000Z';
// ⚠️ Numerico da 01/09/2026: le date si scrivono `GG/MM/AAAA` ovunque, come
//    nei documenti e come i filtri le accettano in digitazione.
const IL_17_AGOSTO_TESTO = '17/08/2025';
const IL_5_GIUGNO = '2026-06-05T09:00:00.000Z';
const IL_5_GIUGNO_TESTO = '05/06/2026';

function fatturaCollegata(
  overrides: Partial<LinkedPurchaseInvoiceInfo> = {},
): LinkedPurchaseInvoiceInfo {
  return {
    id: 'inv-1',
    documentDate: IL_5_GIUGNO,
    ...overrides,
  };
}

describe('documentTypeLabel', () => {
  it('ha un nome italiano per OGNI tipo documento, senza buchi', () => {
    const attese: Record<DocumentType, string> = {
      [DocumentType.SupplierOrder]: 'Ordine fornitore',
      [DocumentType.GoodsReceipt]: 'Arrivo merce',
      [DocumentType.SupplierInvoice]: 'Fattura fornitore',
      [DocumentType.ManualLoad]: 'Carico manuale',
      [DocumentType.InitialLoad]: 'Carico iniziale',
      [DocumentType.SalesDdt]: 'DDT vendita',
      [DocumentType.Transfer]: 'Trasferimento',
      // ⭐ «Vendita manuale» dal 26/08/2026: e' una vendita che riduce la
      // giacenza senza generare movimenti. Il nome vecchio — «Vendita manuale»
      // — aveva gia' fatto spegnere il Listino su quel documento, perche' chi
      // lo leggeva concludeva ragionevolmente «non e' vendita».
      [DocumentType.ManualUnload]: 'Vendita manuale',
      [DocumentType.Adjustment]: 'Rettifica',
      [DocumentType.Inventory]: 'Inventario',
      [DocumentType.Proforma]: 'Proforma',
      [DocumentType.Invoice]: 'Fattura',
      [DocumentType.InvoiceAccompanying]: 'Fattura accompagnatoria',
      [DocumentType.CreditNote]: 'Nota di credito',
      [DocumentType.StoreSale]: 'Vendita al banco',
      [DocumentType.StoreReturn]: 'Reso vendita al banco',
      [DocumentType.Quote]: 'Preventivo',
      [DocumentType.CustomerOrder]: 'Ordine cliente',
    };

    for (const tipo of Object.values(DocumentType)) {
      expect(documentTypeLabel(tipo), tipo).toBe(attese[tipo]);
    }
  });

  it('la fattura fornitore si distingue dall’accompagnatoria di vendita', () => {
    // Nel registro generico convivono: due etichette uguali renderebbero
    // impossibile capire quale delle due si sta guardando.
    expect(documentTypeLabel(DocumentType.SupplierInvoice)).not.toBe(
      documentTypeLabel(DocumentType.InvoiceAccompanying),
    );
  });
});

describe('documentStatusLabel', () => {
  it('traduce ogni stato del ciclo di vita', () => {
    const attese: Record<DocumentStatus, string> = {
      [DocumentStatus.Draft]: 'Bozza',
      [DocumentStatus.Confirmed]: 'Confermato',
      [DocumentStatus.Printed]: 'Stampato',
      [DocumentStatus.Sent]: 'Inviato',
      [DocumentStatus.Cancelled]: 'Annullato',
    };

    for (const stato of Object.values(DocumentStatus)) {
      expect(documentStatusLabel(stato), stato).toBe(attese[stato]);
    }
  });
});

describe('documentStatusTone', () => {
  it('assegna un tono di badge a ogni stato', () => {
    expect(documentStatusTone(DocumentStatus.Draft)).toBe('neutral');
    expect(documentStatusTone(DocumentStatus.Confirmed)).toBe('success');
    expect(documentStatusTone(DocumentStatus.Printed)).toBe('info');
    expect(documentStatusTone(DocumentStatus.Sent)).toBe('info');
    expect(documentStatusTone(DocumentStatus.Cancelled)).toBe('error');
  });
});

describe('documentStatusLabelForType', () => {
  const fatture = [
    DocumentType.Invoice,
    DocumentType.InvoiceAccompanying,
    DocumentType.CreditNote,
  ] as const;

  it.each(fatture)('%s inviata CON data esterna: «Emessa esternamente»', (tipo) => {
    expect(
      documentStatusLabelForType(tipo, DocumentStatus.Sent, {
        externallyIssuedAt: IL_17_AGOSTO,
      }),
    ).toBe('Emessa esternamente');
  });

  it.each(fatture)('%s inviata SENZA data esterna: «Inviata al commercialista»', (tipo) => {
    // Stato non più raggiungibile, mappato solo per i documenti storici.
    expect(documentStatusLabelForType(tipo, DocumentStatus.Sent, NON_EMESSA)).toBe(
      'Inviata al commercialista',
    );
  });

  it.each(fatture)('%s confermata o stampata è «Da emettere», non «Confermato»', (tipo) => {
    expect(documentStatusLabelForType(tipo, DocumentStatus.Confirmed, NON_EMESSA)).toBe(
      'Da emettere',
    );
    expect(documentStatusLabelForType(tipo, DocumentStatus.Printed, NON_EMESSA)).toBe(
      'Da emettere',
    );
  });

  it.each(fatture)('%s in bozza resta «Bozza»', (tipo) => {
    expect(documentStatusLabelForType(tipo, DocumentStatus.Draft, NON_EMESSA)).toBe('Bozza');
  });

  it('la fattura annullata ricade sull’etichetta generica', () => {
    expect(
      documentStatusLabelForType(DocumentType.Invoice, DocumentStatus.Cancelled, NON_EMESSA),
    ).toBe('Annullato');
  });

  it('una data di emissione esterna non cambia gli stati diversi da «inviato»', () => {
    expect(
      documentStatusLabelForType(DocumentType.Invoice, DocumentStatus.Confirmed, {
        externallyIssuedAt: IL_17_AGOSTO,
      }),
    ).toBe('Da emettere');
  });

  it('i tipi che non sono fatture di vendita usano l’etichetta generica', () => {
    expect(
      documentStatusLabelForType(DocumentType.Proforma, DocumentStatus.Confirmed, NON_EMESSA),
    ).toBe('Confermato');
    expect(
      documentStatusLabelForType(DocumentType.GoodsReceipt, DocumentStatus.Draft, NON_EMESSA),
    ).toBe('Bozza');
    expect(
      documentStatusLabelForType(DocumentType.SalesDdt, DocumentStatus.Sent, {
        externallyIssuedAt: IL_17_AGOSTO,
      }),
    ).toBe('Inviato');
  });
});

describe('documentStatusDisplayLabel', () => {
  it('il preventivo non mostra stato, tranne quando è annullato', () => {
    expect(documentStatusDisplayLabel(DocumentType.Quote, DocumentStatus.Draft)).toBeNull();
    expect(documentStatusDisplayLabel(DocumentType.Quote, DocumentStatus.Confirmed)).toBeNull();
    expect(documentStatusDisplayLabel(DocumentType.Quote, DocumentStatus.Printed)).toBeNull();
    expect(documentStatusDisplayLabel(DocumentType.Quote, DocumentStatus.Sent)).toBeNull();
    expect(documentStatusDisplayLabel(DocumentType.Quote, DocumentStatus.Cancelled)).toBe(
      'Annullato',
    );
  });

  it('i documenti operativi in bozza non portano badge', () => {
    expect(documentStatusDisplayLabel(DocumentType.GoodsReceipt, DocumentStatus.Draft)).toBeNull();
    expect(documentStatusDisplayLabel(DocumentType.Transfer, DocumentStatus.Draft)).toBeNull();
    expect(documentStatusDisplayLabel(DocumentType.SupplierOrder, DocumentStatus.Draft)).toBeNull();
  });

  it('i documenti operativi mostrano confermato e annullato', () => {
    expect(documentStatusDisplayLabel(DocumentType.GoodsReceipt, DocumentStatus.Confirmed)).toBe(
      'Confermato',
    );
    expect(documentStatusDisplayLabel(DocumentType.GoodsReceipt, DocumentStatus.Cancelled)).toBe(
      'Annullato',
    );
  });

  it('gli altri stati di un operativo ricadono sull’etichetta generica', () => {
    expect(documentStatusDisplayLabel(DocumentType.SalesDdt, DocumentStatus.Printed)).toBe(
      'Stampato',
    );
    expect(documentStatusDisplayLabel(DocumentType.SalesDdt, DocumentStatus.Sent)).toBe('Inviato');
  });

  it('senza il documento assume che non sia stata emessa esternamente', () => {
    // Il parametro `doc` ha un default: chi ha in mano solo tipo e stato deve
    // poter chiamare la funzione senza inventarsi un oggetto.
    expect(documentStatusDisplayLabel(DocumentType.Invoice, DocumentStatus.Sent)).toBe(
      'Inviata al commercialista',
    );
  });

  it('con la data di emissione esterna la fattura dice «Emessa esternamente»', () => {
    expect(
      documentStatusDisplayLabel(DocumentType.Invoice, DocumentStatus.Sent, {
        externallyIssuedAt: IL_17_AGOSTO,
      }),
    ).toBe('Emessa esternamente');
  });

  it('la fattura confermata è «Da emettere» anche in lista', () => {
    expect(documentStatusDisplayLabel(DocumentType.CreditNote, DocumentStatus.Confirmed)).toBe(
      'Da emettere',
    );
  });

  it('un documento di vendita non operativo mostra lo stato pieno', () => {
    expect(documentStatusDisplayLabel(DocumentType.Proforma, DocumentStatus.Draft)).toBe('Bozza');
    expect(documentStatusDisplayLabel(DocumentType.StoreSale, DocumentStatus.Confirmed)).toBe(
      'Confermato',
    );
  });
});

describe('documentStatusDisplayTone', () => {
  it('il preventivo non ha tono finché non è annullato', () => {
    expect(documentStatusDisplayTone(DocumentType.Quote, DocumentStatus.Draft)).toBeNull();
    expect(documentStatusDisplayTone(DocumentType.Quote, DocumentStatus.Confirmed)).toBeNull();
    expect(documentStatusDisplayTone(DocumentType.Quote, DocumentStatus.Cancelled)).toBe('error');
  });

  it('l’operativo in bozza non ha tono, gli altri stati sì', () => {
    expect(documentStatusDisplayTone(DocumentType.GoodsReceipt, DocumentStatus.Draft)).toBeNull();
    expect(documentStatusDisplayTone(DocumentType.GoodsReceipt, DocumentStatus.Confirmed)).toBe(
      'success',
    );
    expect(documentStatusDisplayTone(DocumentType.GoodsReceipt, DocumentStatus.Cancelled)).toBe(
      'error',
    );
  });

  it('i documenti non operativi seguono il tono dello stato, bozza compresa', () => {
    expect(documentStatusDisplayTone(DocumentType.Invoice, DocumentStatus.Draft)).toBe('neutral');
    expect(documentStatusDisplayTone(DocumentType.Proforma, DocumentStatus.Printed)).toBe('info');
  });

  it('etichetta e tono spariscono insieme: dove non c’è testo non c’è badge', () => {
    const casi = [
      [DocumentType.Quote, DocumentStatus.Confirmed],
      [DocumentType.GoodsReceipt, DocumentStatus.Draft],
    ] as const;

    for (const [tipo, stato] of casi) {
      expect(documentStatusDisplayLabel(tipo, stato)).toBeNull();
      expect(documentStatusDisplayTone(tipo, stato)).toBeNull();
    }
  });
});

describe('goodsReceiptLinkStatusLabel', () => {
  it('senza stato di collegamento la colonna resta vuota', () => {
    expect(goodsReceiptLinkStatusLabel({})).toBeNull();
  });

  it('sospeso non produce testo: la fattura non è ancora stata registrata', () => {
    expect(
      goodsReceiptLinkStatusLabel({ linkStatus: GoodsReceiptLinkStatus.Suspended }),
    ).toBeNull();
  });

  it('annullato dice «Annullato»', () => {
    expect(goodsReceiptLinkStatusLabel({ linkStatus: GoodsReceiptLinkStatus.Cancelled })).toBe(
      'Annullato',
    );
  });

  it('collegato: numero esterno e data esterna del documento fornitore', () => {
    expect(
      goodsReceiptLinkStatusLabel({
        linkStatus: GoodsReceiptLinkStatus.Linked,
        linkedPurchaseInvoice: fatturaCollegata({
          externalDocNumber: '45',
          externalDocDate: IL_17_AGOSTO,
        }),
      }),
    ).toBe(`Fattura forn. n. 45 del ${IL_17_AGOSTO_TESTO}`);
  });

  it('collegato senza numero esterno: ripiega sul riferimento interno', () => {
    expect(
      goodsReceiptLinkStatusLabel({
        linkStatus: GoodsReceiptLinkStatus.Linked,
        linkedPurchaseInvoice: fatturaCollegata({ reference: 'FR-0007' }),
      }),
    ).toBe(`Fattura forn. n. FR-0007 del ${IL_5_GIUGNO_TESTO}`);
  });

  it('numero e riferimento fatti di soli spazi valgono come assenti', () => {
    expect(
      goodsReceiptLinkStatusLabel({
        linkStatus: GoodsReceiptLinkStatus.Linked,
        linkedPurchaseInvoice: fatturaCollegata({ externalDocNumber: '   ', reference: '  ' }),
      }),
    ).toBe(`Fattura fornitore del ${IL_5_GIUGNO_TESTO}`);
  });

  it('numero esterno vuoto ma riferimento pieno: vince il riferimento', () => {
    expect(
      goodsReceiptLinkStatusLabel({
        linkStatus: GoodsReceiptLinkStatus.Linked,
        linkedPurchaseInvoice: fatturaCollegata({ externalDocNumber: '', reference: 'FR-9' }),
      }),
    ).toBe(`Fattura forn. n. FR-9 del ${IL_5_GIUGNO_TESTO}`);
  });

  it('senza data esterna vale la data del documento registrato', () => {
    expect(
      goodsReceiptLinkStatusLabel({
        linkStatus: GoodsReceiptLinkStatus.Linked,
        linkedPurchaseInvoice: fatturaCollegata({ externalDocNumber: '12' }),
      }),
    ).toBe(`Fattura forn. n. 12 del ${IL_5_GIUGNO_TESTO}`);
  });

  it('collegato senza dati della fattura: solo «Fattura fornitore», niente data', () => {
    expect(goodsReceiptLinkStatusLabel({ linkStatus: GoodsReceiptLinkStatus.Linked })).toBe(
      'Fattura fornitore',
    );
  });
});

describe('goodsReceiptLinkStatusTone', () => {
  it('collegato è positivo, annullato è errore, il resto non ha badge', () => {
    expect(goodsReceiptLinkStatusTone({ linkStatus: GoodsReceiptLinkStatus.Linked })).toBe(
      'success',
    );
    expect(goodsReceiptLinkStatusTone({ linkStatus: GoodsReceiptLinkStatus.Cancelled })).toBe(
      'error',
    );
    expect(goodsReceiptLinkStatusTone({ linkStatus: GoodsReceiptLinkStatus.Suspended })).toBeNull();
    expect(goodsReceiptLinkStatusTone({})).toBeNull();
  });
});

describe('counterpartyDocLabel', () => {
  it('mette tipo, numero e data in una voce sola', () => {
    const doc: CounterpartyDocRef = {
      externalDocumentTypeSnapshot: 'DDT',
      externalDocNumber: '145',
      externalDocDate: IL_17_AGOSTO,
    };

    expect(counterpartyDocLabel(doc)).toBe(`DDT 145 del ${IL_17_AGOSTO_TESTO}`);
  });

  it('restituisce stringa vuota quando non c’è nessuno dei tre campi', () => {
    // È il segnale che la riga non va stampata affatto.
    expect(counterpartyDocLabel({})).toBe('');
  });

  it('campi di soli spazi contano come assenti', () => {
    expect(
      counterpartyDocLabel({ externalDocumentTypeSnapshot: '  ', externalDocNumber: '   ' }),
    ).toBe('');
  });

  it('senza data mostra solo tipo e numero', () => {
    expect(
      counterpartyDocLabel({ externalDocumentTypeSnapshot: 'Fatt.', externalDocNumber: '9' }),
    ).toBe('Fatt. 9');
  });

  it('con la sola data mostra la data, senza il «del» che non avrebbe soggetto', () => {
    expect(counterpartyDocLabel({ externalDocDate: IL_17_AGOSTO })).toBe(IL_17_AGOSTO_TESTO);
  });

  it('con il solo tipo o il solo numero non lascia spazi doppi', () => {
    expect(counterpartyDocLabel({ externalDocumentTypeSnapshot: 'DDT' })).toBe('DDT');
    expect(counterpartyDocLabel({ externalDocNumber: '145' })).toBe('145');
  });

  it('ripulisce gli spazi ai bordi dei valori salvati', () => {
    expect(
      counterpartyDocLabel({
        externalDocumentTypeSnapshot: ' DDT ',
        externalDocNumber: ' 145 ',
      }),
    ).toBe('DDT 145');
  });

  it('l’etichetta del tipo viene dallo snapshot, anche se il tipo non esiste più', () => {
    expect(
      counterpartyDocLabel({
        externalDocumentTypeSnapshot: 'Bolla dismessa',
        externalDocNumber: '3',
        externalDocDate: IL_5_GIUGNO,
      }),
    ).toBe(`Bolla dismessa 3 del ${IL_5_GIUGNO_TESTO}`);
  });
});

describe('documentReferenceLabel', () => {
  it('quando c’è il riferimento vince su tutto', () => {
    expect(documentReferenceLabel(DocumentType.GoodsReceipt, 'AM-0001', 'AM')).toBe('AM-0001');
    expect(documentReferenceLabel(DocumentType.Invoice, 'FT-0009', 'FT')).toBe('FT-0009');
  });

  it('operativo senza riferimento: dichiara la serie e che non è numerato', () => {
    expect(documentReferenceLabel(DocumentType.GoodsReceipt, undefined, 'AM')).toBe(
      'Serie AM (non numerato)',
    );
    expect(documentReferenceLabel(DocumentType.Transfer, '', 'TR')).toBe('Serie TR (non numerato)');
  });

  it('non operativo senza riferimento: è una bozza della serie', () => {
    expect(documentReferenceLabel(DocumentType.Invoice, undefined, 'FT')).toBe('Bozza · serie FT');
    expect(documentReferenceLabel(DocumentType.Quote, '', 'PRE')).toBe('Bozza · serie PRE');
  });
});
