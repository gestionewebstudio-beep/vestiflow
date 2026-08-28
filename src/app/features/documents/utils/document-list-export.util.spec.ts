import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DocumentStatus,
  DocumentType,
  type DocumentLine,
  type DocumentRecord,
} from '@core/models/document.model';
import type { Money } from '@core/models/money.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney, moneyToDecimalString } from '@core/utils/money.util';

import { counterpartyDocLabel } from '@domain/documents/models/document-labels.util';

import {
  GOODS_RECEIPT_LIST_EXPORT,
  QUOTE_LIST_EXPORT,
  buildDocumentListCsv,
  buildDocumentListPrintHtml,
  documentListExportFileName,
  goodsReceiptExternalDocLabel,
  type DocumentListExportConfig,
} from './document-list-export.util';

// La data si confronta con `formatDate` e non con un letterale: il testo
// dipende dal fuso della macchina, la composizione della voce no.
const DATE = '2026-05-08';
const DATE_LABEL = formatDate(DATE);

describe('counterpartyDocLabel', () => {
  it('compone tipo, numero e data in una voce sola', () => {
    expect(
      counterpartyDocLabel({
        externalDocumentTypeSnapshot: 'DDT',
        externalDocNumber: '145',
        externalDocDate: DATE,
      }),
    ).toBe(`DDT 145 del ${DATE_LABEL}`);
  });

  it('omette il tipo quando manca lo snapshot', () => {
    expect(counterpartyDocLabel({ externalDocNumber: '145', externalDocDate: DATE })).toBe(
      `145 del ${DATE_LABEL}`,
    );
  });

  it('omette la data quando non è compilata', () => {
    expect(
      counterpartyDocLabel({ externalDocumentTypeSnapshot: 'FT', externalDocNumber: '99' }),
    ).toBe('FT 99');
  });

  it('mostra la sola data quando tipo e numero mancano', () => {
    expect(counterpartyDocLabel({ externalDocDate: DATE })).toBe(DATE_LABEL);
  });

  it('ignora i campi di soli spazi', () => {
    expect(
      counterpartyDocLabel({ externalDocumentTypeSnapshot: '  ', externalDocNumber: ' 145 ' }),
    ).toBe('145');
  });

  it('restituisce stringa vuota quando i tre campi sono vuoti', () => {
    expect(counterpartyDocLabel({})).toBe('');
  });
});

// ── Doppioni ───────────────────────────────────────────────────────────────

function money(amountMinor: number, currencyCode = 'EUR'): Money {
  return { amountMinor, currencyCode };
}

function makeDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    tenantId: 'tenant-1',
    createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
    id: 'doc-1',
    type: DocumentType.GoodsReceipt,
    status: DocumentStatus.Confirmed,
    series: 'A',
    year: 2026,
    documentDate: DATE,
    currency: 'EUR',
    subtotal: money(10000),
    tax: money(2200),
    total: money(12200),
    pricesIncludeVat: false,
    createdByName: 'Mario Rossi',
    ...overrides,
  };
}

function makeLine(id: string): DocumentLine {
  return {
    id,
    lineNumber: 1,
    description: 'Maglia cotone',
    quantity: 1,
    unitPrice: money(1000),
    discountPercent: 0,
    lineTotal: money(1000),
    loadsStock: true,
  };
}

/**
 * Configurazione di prova: cinque colonne scelte per toccare tutti i rami del
 * builder — una senza aggregazione, una numerica senza aggregazione, una che
 * somma interi e una che somma denaro.
 */
const PROVA_EXPORT: DocumentListExportConfig = {
  title: 'Prova & «export»',
  filePrefix: 'prova',
  columns: [
    { header: 'Numero', cell: (doc) => doc.reference ?? '' },
    { header: 'Note', cell: (doc) => doc.notes ?? '' },
    { header: 'Sconto', numeric: true, cell: (doc) => String(doc.documentDiscountPercent ?? 0) },
    {
      header: 'Righe',
      numeric: true,
      cell: (doc) => String(doc.lineCount ?? 0),
      footer: { kind: 'sumInt', value: (doc) => doc.lineCount ?? 0 },
    },
    {
      header: 'Totale',
      numeric: true,
      cell: (doc) => formatMoney(doc.total),
      footer: { kind: 'sumMoney', money: (doc) => doc.total },
    },
  ],
};

const DOC_A = makeDoc({
  id: 'a',
  reference: 'AM-2026-0001',
  notes: 'Consegna parziale',
  lineCount: 3,
  subtotal: money(101188),
  tax: money(22262),
  total: money(123450),
});

const DOC_B = makeDoc({
  id: 'b',
  reference: 'AM-2026-0002',
  notes: '',
  lineCount: 2,
  subtotal: money(820),
  tax: money(180),
  total: money(1000),
});

// ── goodsReceiptExternalDocLabel ───────────────────────────────────────────

describe('goodsReceiptExternalDocLabel', () => {
  it('mostra il documento della controparte quando i suoi campi sono compilati', () => {
    const doc = makeDoc({
      externalDocumentTypeSnapshot: 'DDT',
      externalDocNumber: '145',
      externalDocDate: DATE,
      externalRef: 'IGNORATO',
    });
    expect(goodsReceiptExternalDocLabel(doc)).toBe(`DDT 145 del ${DATE_LABEL}`);
  });

  it('ripiega sul riferimento collegato per gli arrivi storici', () => {
    expect(goodsReceiptExternalDocLabel(makeDoc({ externalRef: '  ORD-77  ' }))).toBe('ORD-77');
  });

  it('restituisce stringa vuota quando non c’è né controparte né riferimento', () => {
    expect(goodsReceiptExternalDocLabel(makeDoc())).toBe('');
  });
});

// ── documentListExportFileName ─────────────────────────────────────────────

describe('documentListExportFileName', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('compone prefisso, data odierna ed estensione', () => {
    expect(documentListExportFileName(PROVA_EXPORT, 'csv')).toBe('prova-2026-07-21.csv');
  });

  it('usa il prefisso dichiarato dalla configurazione del tipo documento', () => {
    expect(documentListExportFileName(GOODS_RECEIPT_LIST_EXPORT, 'html')).toBe(
      'arrivi-merce-2026-07-21.html',
    );
    expect(documentListExportFileName(QUOTE_LIST_EXPORT, 'csv')).toBe('preventivi-2026-07-21.csv');
  });
});

// ── buildDocumentListCsv ───────────────────────────────────────────────────

describe('buildDocumentListCsv', () => {
  it('apre col BOM UTF-8, che è ciò che fa aprire il file già incolonnato a Excel it-IT', () => {
    expect(buildDocumentListCsv([DOC_A], PROVA_EXPORT).startsWith('\ufeff')).toBe(true);
  });

  it('scrive intestazione, righe e piè separati da CRLF e ";"', () => {
    const csv = buildDocumentListCsv([DOC_A, DOC_B], PROVA_EXPORT);
    expect(csv).toBe(
      '\ufeff' +
        [
          'Numero;Note;Sconto;Righe;Totale',
          `AM-2026-0001;Consegna parziale;0;3;${formatMoney(money(123450))}`,
          `AM-2026-0002;;0;2;${formatMoney(money(1000))}`,
          'Totale (2 documenti);;;5;1244,50',
        ].join('\r\n'),
    );
  });

  it('mette il conteggio dei documenti nella prima cella del piè', () => {
    const csv = buildDocumentListCsv([DOC_A], PROVA_EXPORT);
    expect(csv.split('\r\n').at(-1)).toContain('Totale (1 documenti)');
  });

  it('somma gli interi delle colonne che aggregano un conteggio', () => {
    const csv = buildDocumentListCsv([DOC_A, DOC_B], PROVA_EXPORT);
    expect(csv.split('\r\n').at(-1)?.split(';')[3]).toBe('5');
  });

  it('scrive il totale monetario con la virgola e senza simbolo di valuta', () => {
    const csv = buildDocumentListCsv([DOC_A, DOC_B], PROVA_EXPORT);
    expect(csv.split('\r\n').at(-1)?.split(';')[4]).toBe('1244,50');
  });

  it('lascia vuote le celle del piè delle colonne che non aggregano', () => {
    const fields = buildDocumentListCsv([DOC_A], PROVA_EXPORT).split('\r\n').at(-1)?.split(';');
    expect(fields?.[1]).toBe('');
    expect(fields?.[2]).toBe('');
  });

  it('quota i campi con punto e virgola, virgolette o a capo raddoppiando le virgolette', () => {
    const doc = makeDoc({
      reference: 'AM-1',
      notes: 'Cliente "Rossi"; Napoli\nvia A',
      lineCount: 1,
    });
    const csv = buildDocumentListCsv([doc], PROVA_EXPORT);
    expect(csv).toContain('"Cliente ""Rossi""; Napoli\nvia A"');
  });

  it('non quota i campi privi di caratteri speciali', () => {
    expect(buildDocumentListCsv([DOC_A], PROVA_EXPORT)).toContain('AM-2026-0001;Consegna parziale');
  });

  it('con elenco vuoto produce intestazione e piè a zero, senza righe', () => {
    expect(buildDocumentListCsv([], PROVA_EXPORT)).toBe(
      '\ufeff' + 'Numero;Note;Sconto;Righe;Totale\r\nTotale (0 documenti);;;0;0,00',
    );
  });

  it('esporta l’elenco arrivi merce con le sue undici colonne', () => {
    const doc = makeDoc({
      reference: 'AM-2026-0009',
      supplierName: 'ACME Forniture',
      externalDocumentTypeSnapshot: 'DDT',
      externalDocNumber: '145',
      externalDocDate: DATE,
      causalText: '  Carico da fornitore  ',
      locationName: 'Magazzino test 3',
      lineCount: 4,
    });
    const rows = buildDocumentListCsv([doc], GOODS_RECEIPT_LIST_EXPORT).split('\r\n');
    expect(rows[0]).toBe(
      '\ufeffData;Numero;Fornitore;Doc. fornitore;Causale carico;Magazzino;Righe;Imponibile;IVA;Totale;Fattura collegata',
    );
    expect(rows[1]).toBe(
      [
        DATE_LABEL,
        'AM-2026-0009',
        'ACME Forniture',
        `DDT 145 del ${DATE_LABEL}`,
        'Carico da fornitore',
        'Magazzino test 3',
        '4',
        formatMoney(money(10000)),
        formatMoney(money(2200)),
        formatMoney(money(12200)),
        '',
      ].join(';'),
    );
  });

  it('esporta l’elenco preventivi con le colonne del cliente e nessun dato di magazzino', () => {
    const doc = makeDoc({
      type: DocumentType.Quote,
      reference: 'PRE-2026-0003',
      customerName: 'Boutique Sole',
      customerCode: '  C-012  ',
      paymentTerms: '  Bonifico 30gg  ',
      lineCount: 2,
    });
    const rows = buildDocumentListCsv([doc], QUOTE_LIST_EXPORT).split('\r\n');
    expect(rows[0]).toBe(
      '\ufeffData;Numero;Cliente;Cod. cliente;Pagamento;Righe;Imponibile;IVA;Totale',
    );
    expect(rows[0]).not.toContain('Magazzino');
    expect(rows[1]).toBe(
      [
        DATE_LABEL,
        'PRE-2026-0003',
        'Boutique Sole',
        'C-012',
        'Bonifico 30gg',
        '2',
        formatMoney(money(10000)),
        formatMoney(money(2200)),
        formatMoney(money(12200)),
      ].join(';'),
    );
  });

  it('lascia vuote le colonne dei campi non compilati invece di scrivere "undefined"', () => {
    const rows = buildDocumentListCsv([makeDoc()], QUOTE_LIST_EXPORT).split('\r\n');
    expect(rows[1]).toBe(
      [
        DATE_LABEL,
        '',
        '',
        '',
        '',
        '0',
        formatMoney(money(10000)),
        formatMoney(money(2200)),
        formatMoney(money(12200)),
      ].join(';'),
    );
  });

  it('conta le righe dal payload completo quando il conteggio di lista manca', () => {
    const doc = makeDoc({ lines: [makeLine('l1'), makeLine('l2'), makeLine('l3')] });
    const rows = buildDocumentListCsv([doc], QUOTE_LIST_EXPORT).split('\r\n');
    expect(rows[1]?.split(';')[5]).toBe('3');
    expect(rows.at(-1)?.split(';')[5]).toBe('3');
  });

  it('preferisce il conteggio di lista alle righe caricate', () => {
    const doc = makeDoc({ lineCount: 7, lines: [makeLine('l1')] });
    expect(buildDocumentListCsv([doc], QUOTE_LIST_EXPORT).split('\r\n')[1]?.split(';')[5]).toBe(
      '7',
    );
  });
});

// ── buildDocumentListPrintHtml ─────────────────────────────────────────────

describe('buildDocumentListPrintHtml', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('produce una pagina HTML autonoma in italiano', () => {
    const html = buildDocumentListPrintHtml([DOC_A], PROVA_EXPORT);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="it">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('ripete il titolo nel tag title e nell’h1, con le entità al posto dei simboli', () => {
    const html = buildDocumentListPrintHtml([DOC_A], PROVA_EXPORT);
    expect(html).toContain('<title>Prova &amp; «export» — elenco selezionati</title>');
    expect(html).toContain('<h1>Prova &amp; «export» — elenco selezionati</h1>');
  });

  it('dichiara quanti documenti sono stampati e quando', () => {
    const generatedAt = new Intl.DateTimeFormat('it-IT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    const html = buildDocumentListPrintHtml([DOC_A, DOC_B], PROVA_EXPORT);
    expect(html).toContain(`<p class="meta">2 documenti · generato il ${generatedAt}</p>`);
  });

  it('marca come numeriche solo le intestazioni delle colonne dichiarate tali', () => {
    const html = buildDocumentListPrintHtml([DOC_A], PROVA_EXPORT);
    expect(html).toContain(
      '<tr><th>Numero</th><th>Note</th><th class="num">Sconto</th>' +
        '<th class="num">Righe</th><th class="num">Totale</th></tr>',
    );
  });

  it('scrive una riga di tabella per documento, con le celle numeriche allineate', () => {
    const html = buildDocumentListPrintHtml([DOC_A, DOC_B], PROVA_EXPORT);
    expect(html).toContain(
      '<tr><td>AM-2026-0001</td><td>Consegna parziale</td><td class="num">0</td>' +
        `<td class="num">3</td><td class="num">${formatMoney(money(123450))}</td></tr>`,
    );
  });

  it('sostituisce la cella vuota con un trattino invece di lasciare il buco', () => {
    const html = buildDocumentListPrintHtml([DOC_B], PROVA_EXPORT);
    expect(html).toContain('<td>—</td>');
  });

  it('trasforma in entità i caratteri che romperebbero il markup', () => {
    const doc = makeDoc({ reference: 'A&B <"x">', lineCount: 1 });
    const html = buildDocumentListPrintHtml([doc], PROVA_EXPORT);
    expect(html).toContain('<td>A&amp;B &lt;&quot;x&quot;&gt;</td>');
    expect(html).not.toContain('<td>A&B');
  });

  it('chiude la tabella con conteggio, somme e celle vuote per le colonne che non aggregano', () => {
    const html = buildDocumentListPrintHtml([DOC_A, DOC_B], PROVA_EXPORT);
    expect(html).toContain(
      '<tr><td>Totale (2 documenti)</td><td></td><td class="num"></td>' +
        `<td class="num">5</td><td class="num">${formatMoney(money(124450))}</td></tr>`,
    );
  });

  it('formatta i totali monetari del piè con il simbolo di valuta, a differenza del CSV', () => {
    const html = buildDocumentListPrintHtml([DOC_A, DOC_B], PROVA_EXPORT);
    expect(html).toContain(formatMoney(money(124450)));
    expect(html).not.toContain('>1244,50<');
  });

  it('con elenco vuoto stampa comunque intestazioni e piè a zero', () => {
    const html = buildDocumentListPrintHtml([], PROVA_EXPORT);
    expect(html).toContain('<p class="meta">0 documenti · generato il');
    expect(html).toContain('<tbody>\n\n</tbody>');
    expect(html).toContain('<td>Totale (0 documenti)</td>');
    expect(html).toContain(`<td class="num">${formatMoney(money(0))}</td>`);
  });

  it('somma gli importi nella valuta del primo documento dell’elenco', () => {
    const docs = [
      makeDoc({ id: 'a', currency: 'USD', total: money(5000, 'USD') }),
      makeDoc({ id: 'b', currency: 'USD', total: money(2500, 'USD') }),
    ];
    const html = buildDocumentListPrintHtml(docs, QUOTE_LIST_EXPORT);
    expect(html).toContain(formatMoney(money(7500, 'USD')));
  });

  it('stampa lo stato del collegamento fattura dell’arrivo merce', () => {
    const doc = makeDoc({
      linkStatus: 'linked',
      linkedPurchaseInvoice: {
        id: 'inv-1',
        externalDocNumber: '45',
        externalDocDate: DATE,
        documentDate: DATE,
      },
    });
    const html = buildDocumentListPrintHtml([doc], GOODS_RECEIPT_LIST_EXPORT);
    expect(html).toContain(`<td>Fattura forn. n. 45 del ${DATE_LABEL}</td>`);
  });

  it('lascia il trattino sullo stato finché l’arrivo non è collegato a una fattura', () => {
    const html = buildDocumentListPrintHtml(
      [makeDoc({ linkStatus: 'suspended' })],
      GOODS_RECEIPT_LIST_EXPORT,
    );
    expect(html).toContain('<td>—</td>');
  });

  it('somma righe e importi dell’elenco arrivi merce nel piè di stampa', () => {
    const docs = [
      makeDoc({
        id: 'a',
        lineCount: 3,
        subtotal: money(10000),
        tax: money(2200),
        total: money(12200),
      }),
      makeDoc({
        id: 'b',
        lineCount: 2,
        subtotal: money(5000),
        tax: money(1100),
        total: money(6100),
      }),
    ];
    const html = buildDocumentListPrintHtml(docs, GOODS_RECEIPT_LIST_EXPORT);
    expect(html).toContain('<td class="num">5</td>');
    expect(html).toContain(`<td class="num">${formatMoney(money(15000))}</td>`);
    expect(html).toContain(`<td class="num">${formatMoney(money(3300))}</td>`);
    expect(html).toContain(`<td class="num">${formatMoney(money(18300))}</td>`);
  });
});

/**
 * ⛔ **Il verso economico nel piede di CSV e stampa** (`15c` §6.2, §12.4-12.5).
 *
 * Due registri mescolano tipi di direzione opposta — Fatture (`invoice`,
 * `invoice_accompanying`, `credit_note`) e Vendite al banco (`store_sale`,
 * `store_return`) — e il piede sommava importi grezzi: una Fattura da 100 e una
 * Nota di credito da 30 davano **130**.
 *
 * ⚠️ Entrambi i registri usano `GOODS_RECEIPT_LIST_EXPORT`: solo il Preventivo
 * dichiara una configurazione propria, gli altri cadono su quel ripiego
 * (`document-list.component.ts`, `activeListExport`). Una configurazione sola
 * serve quindi tutti e due i casi di accettazione.
 */
describe('segno economico nel piede di CSV e stampa', () => {
  /** Il piede è l'ultima riga del CSV: «Totale (n documenti);…». */
  /**
   * Il decimale come lo scrive il CSV: virgola, **nessun simbolo valuta**.
   *
   * ⚠️ Le due uscite formattano diversamente — il CSV con `csvMoney`, la
   * stampa con `formatMoney` — e una prova che usasse un formato solo
   * fallirebbe su meta dei casi senza che il calcolo sia sbagliato.
   */
  const csvImporto = (minor: number): string => moneyToDecimalString(money(minor)).replace('.', ',');

  const piedeCsv = (righe: readonly DocumentRecord[]): string => {
    const linee = buildDocumentListCsv(righe, GOODS_RECEIPT_LIST_EXPORT).trim().split('\r\n');
    return linee[linee.length - 1] ?? '';
  };

  const FATTURA = makeDoc({
    id: 'f-1',
    type: DocumentType.Invoice,
    subtotal: money(8197),
    tax: money(1803),
    total: money(10000),
  });
  const NOTA_CREDITO = makeDoc({
    id: 'nc-1',
    type: DocumentType.CreditNote,
    subtotal: money(2459),
    tax: money(541),
    total: money(3000),
  });
  const VENDITA = makeDoc({ id: 'v-1', type: DocumentType.StoreSale, total: money(10000) });
  const RESO = makeDoc({ id: 'r-1', type: DocumentType.StoreReturn, total: money(3000) });

  it('⭐ CSV · Fattura 100 + Nota di credito 30 = 70', () => {
    expect(piedeCsv([FATTURA, NOTA_CREDITO])).toContain(csvImporto(7000));
  });

  it('⭐ CSV · Vendita 100 + Reso 30 = 70', () => {
    expect(piedeCsv([VENDITA, RESO])).toContain(csvImporto(7000));
  });
  /**
   * ⚠️ Un `it` per REGISTRO, non uno per entrambi: se la stampa dei due casi
   * stesse in una prova sola, cadrebbe a ogni modifica del segno e non
   * direbbe QUALE registro si è rotto — che è esattamente ciò che `15c` §13
   * chiede di poter distinguere.
   */
  it(`⭐ stampa · Fattura 100 + Nota di credito 30 = 70`, () => {
    const html = buildDocumentListPrintHtml([FATTURA, NOTA_CREDITO], GOODS_RECEIPT_LIST_EXPORT);
    expect(html).toContain(formatMoney(money(7000)));
  });

  it(`⭐ stampa · Vendita 100 + Reso 30 = 70`, () => {
    const html = buildDocumentListPrintHtml([VENDITA, RESO], GOODS_RECEIPT_LIST_EXPORT);
    expect(html).toContain(formatMoney(money(7000)));
  });

  /**
   * ⚠️ **Le tre grandezze sono firmate SEPARATAMENTE** (`15c` §6.3): il piede
   * non ricompone `totale = imponibile + IVA`, riporta gli snapshot.
   */
  it('⭐ imponibile e IVA seguono la stessa direzione del totale', () => {
    const piede = piedeCsv([FATTURA, NOTA_CREDITO]);

    expect(piede).toContain(csvImporto(8197 - 2459)); // imponibile 57,38
    expect(piede).toContain(csvImporto(1803 - 541)); // IVA 12,62
    expect(piede).toContain(csvImporto(7000)); // totale 70,00
  });

  /**
   * ⛔ **La CELLA non cambia** (`15c` §7): questa correzione disciplina le
   * aggregazioni, non la rappresentazione della riga. Una Nota di credito
   * continua a leggersi 30,00 nella sua riga — che mostri il meno è una
   * decisione separata e non presa.
   */
  it('⛔ la riga della Nota di credito resta col valore persistito, positivo', () => {
    const csv = buildDocumentListCsv([NOTA_CREDITO], GOODS_RECEIPT_LIST_EXPORT);
    const righe = csv.trim().split('\r\n');
    const rigaDocumento = righe[1] ?? '';

    expect(rigaDocumento).toContain(csvImporto(3000));
    expect(rigaDocumento).not.toContain(csvImporto(-3000));
  });

  /**
   * ⚠️ Un elenco a verso unico non cambia di una virgola: se cambiasse, il
   * segno starebbe entrando dove non serve.
   */
  it('⭐ un elenco a verso unico somma come prima', () => {
    const a = makeDoc({ id: 'a', type: DocumentType.GoodsReceipt, total: money(10000) });
    const b = makeDoc({ id: 'b', type: DocumentType.GoodsReceipt, total: money(3000) });

    expect(piedeCsv([a, b])).toContain(csvImporto(13000));
  });
});
