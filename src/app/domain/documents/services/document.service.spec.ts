import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, TimeoutError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import {
  AdjustmentDirection,
  DocumentStatus,
  DocumentType,
  GoodsReceiptLinkStatus,
} from '@core/models/document.model';

import type { DocumentApiRow } from './document-api.mapper';
import { DocumentService } from './document.service';

const API_BASE = 'http://localhost:3000/api/v1';

/** Riga documento come la restituisce l'API: solo i campi obbligatori. */
function apiRow(overrides: Partial<DocumentApiRow> = {}): DocumentApiRow {
  return {
    id: 'doc-1',
    tenantId: 'tenant-1',
    type: DocumentType.GoodsReceipt,
    status: DocumentStatus.Confirmed,
    series: 'A',
    number: 42,
    year: 2026,
    reference: 'AM-A-0042',
    documentDate: '2026-08-01',
    currency: 'EUR',
    subtotalMinor: 10000,
    taxMinor: 2200,
    totalMinor: 12200,
    pricesIncludeVat: false,
    createdByName: 'Luigi',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('DocumentService (HTTP)', () => {
  let service: DocumentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DocumentService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(DocumentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // `ignoreCancelled`: le sole richieste annullate sono quelle che il test
    // sul timeout lascia cadere apposta; tutte le altre restano verificate.
    httpMock.verify({ ignoreCancelled: true });
    vi.useRealTimers();
  });

  // ── Elenco ────────────────────────────────────────────────────────────────

  it('getDocuments senza query chiede la prima pagina da venti righe', async () => {
    const promise = firstValueFrom(service.getDocuments());

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    // Nessun filtro assente deve comparire come parametro vuoto: il server li
    // legge come filtri veri e restituirebbe un elenco diverso.
    expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize']);

    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    await promise;
  });

  it('getDocuments porta ogni filtro valorizzato nei parametri', async () => {
    const promise = firstValueFrom(
      service.getDocuments({
        page: 3,
        pageSize: 50,
        search: 'rossi',
        type: DocumentType.SalesDdt,
        types: [DocumentType.InvoiceDraft, DocumentType.CreditNote],
        status: DocumentStatus.Draft,
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        customerId: 'cust-1',
        locationId: 'loc-1',
        supplierId: 'sup-1',
        linkStatus: GoodsReceiptLinkStatus.Suspended,
        externalDocumentTypeId: 'ext-1',
        settlement: 'pending',
        paymentMethod: 'MP05',
        createdById: 'user-1',
        pendingInvoice: true,
      }),
    );

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents`);
    const params = req.request.params;
    expect(params.get('page')).toBe('3');
    expect(params.get('pageSize')).toBe('50');
    expect(params.get('search')).toBe('rossi');
    expect(params.get('type')).toBe('sales_ddt');
    // Piu' tipi viaggiano in UN parametro separato da virgole.
    expect(params.get('types')).toBe('invoice_draft,credit_note');
    expect(params.get('status')).toBe('draft');
    expect(params.get('dateFrom')).toBe('2026-01-01');
    expect(params.get('dateTo')).toBe('2026-12-31');
    expect(params.get('customerId')).toBe('cust-1');
    expect(params.get('locationId')).toBe('loc-1');
    expect(params.get('supplierId')).toBe('sup-1');
    expect(params.get('linkStatus')).toBe('suspended');
    expect(params.get('externalDocumentTypeId')).toBe('ext-1');
    expect(params.get('settlement')).toBe('pending');
    expect(params.get('paymentMethod')).toBe('MP05');
    expect(params.get('createdById')).toBe('user-1');
    expect(params.get('pendingInvoice')).toBe('1');

    req.flush({ items: [], total: 0, page: 3, pageSize: 50 });
    await promise;
  });

  it('getDocuments non manda i filtri vuoti: elenco tipi vuoto e pendingInvoice falso', async () => {
    const promise = firstValueFrom(
      service.getDocuments({ types: [], search: '', pendingInvoice: false }),
    );

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents`);
    expect(req.request.params.has('types')).toBe(false);
    expect(req.request.params.has('search')).toBe(false);
    expect(req.request.params.has('pendingInvoice')).toBe(false);

    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    await promise;
  });

  it('getDocuments mappa le righe in modelli e calcola le pagine totali', async () => {
    const promise = firstValueFrom(service.getDocuments({ page: 1, pageSize: 20 }));

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents`);
    req.flush({
      items: [apiRow({ id: 'doc-9', totalMinor: 5000 })],
      total: 45,
      page: 1,
      pageSize: 20,
    });

    const result = await promise;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('doc-9');
    expect(result.data[0]?.total).toEqual({ amountMinor: 5000, currencyCode: 'EUR' });
    expect(result.meta.total).toBe(45);
    expect(result.meta.totalPages).toBe(3);
  });

  // ── Operatori ─────────────────────────────────────────────────────────────

  it('getOperators senza tipi non manda il parametro dei tipi', async () => {
    const promise = firstValueFrom(service.getOperators());

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents/operators`);
    expect(req.request.params.has('types')).toBe(false);
    req.flush([{ id: 'user-1', name: 'Luigi' }]);

    await expect(promise).resolves.toEqual([{ id: 'user-1', name: 'Luigi' }]);
  });

  it('getOperators restringe ai tipi della pagina, uniti da virgole', async () => {
    const promise = firstValueFrom(
      service.getOperators([DocumentType.Quote, DocumentType.Proforma]),
    );

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents/operators`);
    expect(req.request.params.get('types')).toBe('quote,proforma');
    req.flush([]);

    await expect(promise).resolves.toEqual([]);
  });

  // ── Lettura singola ───────────────────────────────────────────────────────

  it('getDocumentById legge il documento per id e ne mappa importi e righe', async () => {
    const promise = firstValueFrom(service.getDocumentById('doc-7'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-7`);
    expect(req.request.method).toBe('GET');
    req.flush(
      apiRow({
        id: 'doc-7',
        documentDiscountPercent: '2.5',
        lines: [
          {
            id: 'line-1',
            lineNumber: 1,
            description: 'Maglia cotone',
            quantity: 3,
            unitPriceMinor: '3333.5',
            discountPercent: '7',
            enteredUnitCost: '12.34',
            lineTotalMinor: 9299,
            loadsStock: true,
          },
        ],
      }),
    );

    const document = await promise;
    expect(document.id).toBe('doc-7');
    expect(document.subtotal).toEqual({ amountMinor: 10000, currencyCode: 'EUR' });
    // Lo sconto arriva come stringa (Decimal serializzato): diventa numero.
    expect(document.documentDiscountPercent).toBe(2.5);
    expect(document.lines?.[0]?.unitPrice).toEqual({
      amountMinor: 3333.5,
      currencyCode: 'EUR',
    });
    expect(document.lines?.[0]?.enteredUnitCostMinor).toBe(1234);
    expect(document.lines?.[0]?.isReference).toBe(false);
  });

  // ── Numerazione e cronologia ──────────────────────────────────────────────

  it('previewDocumentNumber senza opzioni chiede solo il tipo', async () => {
    const promise = firstValueFrom(service.previewDocumentNumber(DocumentType.GoodsReceipt));

    const req = httpMock.expectOne(
      (request) => request.url === `${API_BASE}/documents/preview-number`,
    );
    expect(req.request.params.get('type')).toBe('goods_receipt');
    expect(req.request.params.keys()).toEqual(['type']);
    req.flush({ reference: 'AM-A-0043', previewNumber: 43, series: 'A' });

    await expect(promise).resolves.toEqual({
      reference: 'AM-A-0043',
      previewNumber: 43,
      series: 'A',
    });
  });

  it('previewDocumentNumber manda serie, sede e data: decidono il contatore', async () => {
    const promise = firstValueFrom(
      service.previewDocumentNumber(DocumentType.SalesDdt, {
        series: 'B',
        locationId: 'loc-2',
        documentDate: '2026-03-04',
      }),
    );

    const req = httpMock.expectOne(
      (request) => request.url === `${API_BASE}/documents/preview-number`,
    );
    expect(req.request.params.get('series')).toBe('B');
    expect(req.request.params.get('locationId')).toBe('loc-2');
    expect(req.request.params.get('documentDate')).toBe('2026-03-04');
    req.flush({ reference: 'DDT-B-0001', previewNumber: 1, series: 'B' });

    await promise;
  });

  it('checkChronology manda la serie anche quando e nulla: senza serie e un contatore vero', async () => {
    const promise = firstValueFrom(
      service.checkChronology(DocumentType.GoodsReceipt, null, 12, '2026-05-05'),
    );

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents/chronology`);
    expect(req.request.params.get('series')).toBe('');
    expect(req.request.params.get('number')).toBe('12');
    expect(req.request.params.get('documentDate')).toBe('2026-05-05');
    expect(req.request.params.has('excludeId')).toBe(false);
    req.flush({ conflicts: [], dismissed: false });

    await expect(promise).resolves.toEqual({ conflicts: [], dismissed: false });
  });

  it('checkChronology esclude il documento in modifica quando l id e noto', async () => {
    const promise = firstValueFrom(
      service.checkChronology(DocumentType.GoodsReceipt, 'A', 12, '2026-05-05', 'doc-1'),
    );

    const req = httpMock.expectOne((request) => request.url === `${API_BASE}/documents/chronology`);
    expect(req.request.params.get('excludeId')).toBe('doc-1');
    req.flush({
      conflicts: [
        {
          id: 'doc-2',
          number: 11,
          documentDate: '2026-05-06',
          reference: 'AM-A-0011',
          direction: 'precede',
        },
      ],
      dismissed: false,
    });

    const esito = await promise;
    expect(esito.conflicts[0]?.direction).toBe('precede');
  });

  it('dismissChronologyWarning spegne l avviso con una POST a corpo vuoto', async () => {
    const promise = firstValueFrom(service.dismissChronologyWarning(DocumentType.Adjustment));

    const req = httpMock.expectOne(
      (request) => request.url === `${API_BASE}/documents/chronology/dismiss`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    expect(req.request.params.get('type')).toBe('adjustment');
    req.flush(null);

    await promise;
  });

  it('getRevisions legge lo storico revisioni del documento', async () => {
    const promise = firstValueFrom(service.getRevisions('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/revisions`);
    req.flush([
      {
        id: 'rev-1',
        revisionNumber: 1,
        summary: 'Creazione',
        changedByName: 'Luigi',
        createdAt: '2026-08-01T10:00:00.000Z',
      },
    ]);

    const revisions = await promise;
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.summary).toBe('Creazione');
  });

  // ── Salvataggi ────────────────────────────────────────────────────────────

  it('createDocument invia il corpo cosi come lo riceve e mappa la risposta', async () => {
    const body = {
      type: DocumentType.Quote,
      documentDate: '2026-08-10',
      customerId: 'cust-1',
      lines: [{ description: 'Maglia', quantity: 2 }],
    };
    const promise = firstValueFrom(service.createDocument(body));

    const req = httpMock.expectOne(`${API_BASE}/documents`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(apiRow({ id: 'doc-new', type: DocumentType.Quote }));

    const document = await promise;
    expect(document.id).toBe('doc-new');
    expect(document.type).toBe(DocumentType.Quote);
  });

  it('saveGoodsReceipt senza articoli creati restituisce un elenco vuoto, non undefined', async () => {
    const promise = firstValueFrom(
      service.saveGoodsReceipt({
        type: DocumentType.GoodsReceipt,
        documentDate: '2026-08-10',
        supplierId: 'sup-1',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/documents/goods-receipt/save`);
    expect(req.request.method).toBe('POST');
    req.flush({ document: apiRow(), warnings: ['Quantita oltre la disponibilita'] });

    const result = await promise;
    expect(result.document.id).toBe('doc-1');
    expect(result.warnings).toEqual(['Quantita oltre la disponibilita']);
    expect(result.createdProducts).toEqual([]);
  });

  it('saveGoodsReceipt riporta gli articoli creati insieme al documento', async () => {
    const promise = firstValueFrom(
      service.saveGoodsReceipt({
        id: 'doc-1',
        type: DocumentType.GoodsReceipt,
        documentDate: '2026-08-10',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/documents/goods-receipt/save`);
    req.flush({
      document: apiRow(),
      warnings: [],
      createdProducts: [
        { lineIndex: 0, productId: 'prod-1', variantId: 'var-1', sku: 'SKU-1', barcode: null },
      ],
    });

    const result = await promise;
    expect(result.createdProducts).toHaveLength(1);
    expect(result.createdProducts[0]?.variantId).toBe('var-1');
  });

  it('saveTransfer usa l endpoint dedicato del trasferimento confermato', async () => {
    const body = {
      id: 'doc-1',
      documentDate: '2026-08-10',
      locationId: 'loc-1',
      targetLocationId: 'loc-2',
      lines: [{ id: 'line-1', description: 'Maglia', quantity: 1 }],
    };
    const promise = firstValueFrom(service.saveTransfer(body));

    const req = httpMock.expectOne(`${API_BASE}/documents/transfer/save`);
    expect(req.request.method).toBe('POST');
    // Gli id riga viaggiano: sono cio' che aggiorna il movimento invece di
    // duplicarlo (`docs/09-specifica-movimenti-per-riga.md`).
    expect(req.request.body).toEqual(body);
    req.flush(apiRow({ type: DocumentType.Transfer }));

    const document = await promise;
    expect(document.type).toBe(DocumentType.Transfer);
  });

  it('saveAdjustment usa l endpoint dedicato della rettifica confermata', async () => {
    const promise = firstValueFrom(
      service.saveAdjustment({
        id: 'doc-1',
        documentDate: '2026-08-10',
        locationId: 'loc-1',
        adjustmentDirection: AdjustmentDirection.Decrease,
        internalComment: 'Rottura',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/documents/adjustment/save`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ adjustmentDirection: 'decrease' });
    req.flush(apiRow({ type: DocumentType.Adjustment, adjustmentDirection: 'decrease' }));

    const document = await promise;
    expect(document.adjustmentDirection).toBe('decrease');
  });

  it('savePurchaseInvoice conserva il confronto con i totali degli arrivi merce', async () => {
    const promise = firstValueFrom(
      service.savePurchaseInvoice({
        supplierId: 'sup-1',
        documentDate: '2026-08-10',
        goodsReceiptIds: ['doc-2'],
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/documents/purchase-invoice/save`);
    expect(req.request.method).toBe('POST');
    req.flush({
      document: apiRow({ type: DocumentType.SupplierInvoice }),
      receiptsTotalMinor: 12200,
      totalsMatch: true,
    });

    const result = await promise;
    expect(result.document.type).toBe(DocumentType.SupplierInvoice);
    expect(result.receiptsTotalMinor).toBe(12200);
    expect(result.totalsMatch).toBe(true);
  });

  // ── Arrivi merce collegabili ──────────────────────────────────────────────

  it('listLinkableGoodsReceipts mappa importi e quote IVA nella valuta della riga', async () => {
    const promise = firstValueFrom(service.listLinkableGoodsReceipts('sup-1'));

    const req = httpMock.expectOne(
      (request) => request.url === `${API_BASE}/documents/linkable-goods-receipts`,
    );
    expect(req.request.params.get('supplierId')).toBe('sup-1');
    expect(req.request.params.has('excludeInvoiceId')).toBe(false);
    req.flush([
      {
        id: 'doc-2',
        number: 7,
        reference: 'AM-A-0007',
        documentDate: '2026-07-01',
        causalText: 'DDT 12',
        internalComment: null,
        subtotalMinor: 10000,
        taxMinor: 2200,
        totalMinor: 12200,
        currency: 'EUR',
        locationName: 'Magazzino test 3',
        vatBreakdown: [{ ratePercent: 22, netMinor: 10000, vatMinor: 2200 }],
      },
    ]);

    const receipts = await promise;
    expect(receipts[0]?.total).toEqual({ amountMinor: 12200, currencyCode: 'EUR' });
    expect(receipts[0]?.locationName).toBe('Magazzino test 3');
    // I null dell'API diventano assenze, non stringhe vuote.
    expect(receipts[0]?.internalComment).toBeUndefined();
    expect(receipts[0]?.vatBreakdown?.[0]?.vat).toEqual({
      amountMinor: 2200,
      currencyCode: 'EUR',
    });
  });

  it('listLinkableGoodsReceipts esclude la fattura in modifica e regge le quote IVA assenti', async () => {
    const promise = firstValueFrom(service.listLinkableGoodsReceipts('sup-1', 'doc-9'));

    const req = httpMock.expectOne(
      (request) => request.url === `${API_BASE}/documents/linkable-goods-receipts`,
    );
    expect(req.request.params.get('excludeInvoiceId')).toBe('doc-9');
    req.flush([
      {
        id: 'doc-3',
        number: null,
        reference: null,
        documentDate: '2026-07-02',
        causalText: null,
        subtotalMinor: 0,
        taxMinor: 0,
        totalMinor: 0,
        currency: 'EUR',
      },
    ]);

    const receipts = await promise;
    expect(receipts[0]?.number).toBeUndefined();
    expect(receipts[0]?.reference).toBeUndefined();
    expect(receipts[0]?.vatBreakdown).toBeUndefined();
  });

  // ── Modifica, prezzi, intestazione ────────────────────────────────────────

  it('updateDocument manda una PATCH sul documento, con i null che svuotano', async () => {
    const promise = firstValueFrom(
      service.updateDocument('doc-1', { externalDocNumber: null, notes: 'Aggiornata' }),
    );

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ externalDocNumber: null, notes: 'Aggiornata' });
    req.flush(apiRow({ notes: 'Aggiornata' }));

    const document = await promise;
    expect(document.notes).toBe('Aggiornata');
  });

  it('listSupplierPriceDiffs riporta le differenze di costo e la politica del tenant', async () => {
    const promise = firstValueFrom(service.listSupplierPriceDiffs('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/supplier-price-diffs`);
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [{ variantId: 'var-1', previousMinor: null, nextMinor: 2500 }],
      policy: 'ask',
    });

    const result = await promise;
    expect(result.policy).toBe('ask');
    expect(result.items[0]?.previousMinor).toBeNull();
  });

  it('getPrintHeader chiede al server l intestazione gia composta', async () => {
    const promise = firstValueFrom(service.getPrintHeader('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/print-header`);
    req.flush({
      legalName: 'Acme SRL',
      lines: ['Via Roma 1', 'P.IVA 01234567890'],
      footer: 'REA NA-123456',
    });

    const header = await promise;
    expect(header.legalName).toBe('Acme SRL');
    expect(header.lines).toHaveLength(2);
    expect(header.footer).toBe('REA NA-123456');
  });

  it('getPriceModePreference estrae il booleano dalla risposta', async () => {
    const promise = firstValueFrom(service.getPriceModePreference(DocumentType.SalesDdt));

    const req = httpMock.expectOne(`${API_BASE}/users/me/document-price-mode/sales_ddt`);
    expect(req.request.method).toBe('GET');
    req.flush({ pricesIncludeVat: true });

    await expect(promise).resolves.toBe(true);
  });

  // ── Export ────────────────────────────────────────────────────────────────

  it('exportPdf scarica il PDF come blob', async () => {
    const promise = firstValueFrom(service.exportPdf('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/export/pdf`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF-test'], { type: 'application/pdf' }));

    const blob = await promise;
    expect(blob.type).toContain('application/pdf');
  });

  it('exportXml scarica la FatturaPA come blob', async () => {
    const promise = firstValueFrom(service.exportXml('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/export/xml`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['<FatturaElettronica/>'], { type: 'application/xml' }));

    const blob = await promise;
    expect(blob.type).toContain('application/xml');
  });

  // ── Allegati ──────────────────────────────────────────────────────────────

  it('listAttachments elenca gli allegati del documento', async () => {
    const promise = firstValueFrom(service.listAttachments('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/attachments`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        id: 'att-1',
        fileName: 'ddt.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        createdByName: 'Luigi',
        createdAt: '2026-08-01T10:00:00.000Z',
      },
    ]);

    const attachments = await promise;
    expect(attachments[0]?.fileName).toBe('ddt.pdf');
  });

  it('uploadAttachment invia il file in FormData col suo nome', async () => {
    const file = new File(['contenuto'], 'ddt.pdf', { type: 'application/pdf' });
    const promise = firstValueFrom(service.uploadAttachment('doc-1', file));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/attachments`);
    expect(req.request.method).toBe('POST');
    const body: unknown = req.request.body;
    expect(body).toBeInstanceOf(FormData);
    const inviato = body instanceof FormData ? body.get('file') : null;
    expect(inviato).toBeInstanceOf(File);
    expect(inviato instanceof File ? inviato.name : null).toBe('ddt.pdf');
    req.flush({
      id: 'att-1',
      fileName: 'ddt.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 9,
      createdByName: 'Luigi',
      createdAt: '2026-08-01T10:00:00.000Z',
    });

    const attachment = await promise;
    expect(attachment.id).toBe('att-1');
  });

  it('renameAttachment cambia solo il nome mostrato', async () => {
    const promise = firstValueFrom(service.renameAttachment('doc-1', 'att-1', 'bolla.pdf'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/attachments/att-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ fileName: 'bolla.pdf' });
    req.flush({
      id: 'att-1',
      fileName: 'bolla.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 9,
      createdByName: 'Luigi',
      createdAt: '2026-08-01T10:00:00.000Z',
    });

    const attachment = await promise;
    expect(attachment.fileName).toBe('bolla.pdf');
  });

  it('downloadAttachment passa dall API e chiede i byte come blob', async () => {
    const promise = firstValueFrom(service.downloadAttachment('doc-1', 'att-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/attachments/att-1/download`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['bytes'], { type: 'application/pdf' }));

    const blob = await promise;
    expect(blob.size).toBeGreaterThan(0);
  });

  it('deleteAttachment elimina l allegato indicato', async () => {
    const promise = firstValueFrom(service.deleteAttachment('doc-1', 'att-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/attachments/att-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  // ── Azioni ────────────────────────────────────────────────────────────────

  it('cancelDocument annulla con una POST a corpo vuoto e rilegge il documento', async () => {
    const promise = firstValueFrom(service.cancelDocument('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(
      apiRow({ status: DocumentStatus.Cancelled, cancelledAt: '2026-08-02T09:00:00.000Z' }),
    );

    const document = await promise;
    expect(document.status).toBe(DocumentStatus.Cancelled);
    expect(document.cancelledAt).toBe('2026-08-02T09:00:00.000Z');
  });

  it('convertPrefill chiede il precompilato senza creare il documento', async () => {
    const promise = firstValueFrom(service.convertPrefill('doc-1', DocumentType.InvoiceDraft));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/convert-prefill`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ targetType: 'invoice_draft' });
    req.flush({
      type: DocumentType.InvoiceDraft,
      documentDate: '2026-08-10',
      sourceDocumentId: 'doc-1',
      sourceDocumentType: DocumentType.SalesDdt,
      lines: [],
    });

    const prefill = await promise;
    // Il tipo dell'origine e' cio' che compone la riga di riferimento.
    expect(prefill.sourceDocumentType).toBe(DocumentType.SalesDdt);
    expect(prefill.sourceDocumentId).toBe('doc-1');
  });

  it('deleteDocument elimina il documento per id', async () => {
    const promise = firstValueFrom(service.deleteDocument('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  // ── Timeout ───────────────────────────────────────────────────────────────

  it('una chiamata che non risponde entro quindici secondi fallisce', async () => {
    vi.useFakeTimers();
    const promise = firstValueFrom(service.getDocumentById('doc-1'));

    httpMock.expectOne(`${API_BASE}/documents/doc-1`);
    vi.advanceTimersByTime(15_001);

    await expect(promise).rejects.toBeInstanceOf(TimeoutError);
  });

  it('gli export hanno un minuto: a quindici secondi sono ancora in attesa', async () => {
    vi.useFakeTimers();
    const promise = firstValueFrom(service.exportPdf('doc-1'));

    const req = httpMock.expectOne(`${API_BASE}/documents/doc-1/export/pdf`);
    vi.advanceTimersByTime(20_000);
    expect(req.cancelled).toBe(false);

    req.flush(new Blob(['%PDF-lungo'], { type: 'application/pdf' }));
    const blob = await promise;
    expect(blob.size).toBeGreaterThan(0);
  });
});
