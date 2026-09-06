import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import type {
  Supplier,
  SupplierAttachment,
  SupplierInput,
  SupplierVariantLink,
  UpsertSupplierVariantLinkInput,
} from '@core/models/supplier.model';

import { SupplierService } from './supplier.service';

const API_BASE = 'http://localhost:3000/api/v1';

/** Fornitore come lo restituisce l'API: base minima riusata dai test. */
function supplierRow(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup-1',
    tenantId: 'tenant-1',
    isActive: true,
    name: 'Fornitore ABC',
    email: 'ordini@abc.it',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function variantLinkRow(overrides: Partial<SupplierVariantLink> = {}): SupplierVariantLink {
  return {
    id: 'link-1',
    tenantId: 'tenant-1',
    supplierId: 'sup-1',
    variantId: 'var-1',
    supplierSku: 'ABC-001',
    isPreferred: true,
    lastPurchasePriceMinor: 1250,
    minOrderQuantity: 6,
    currency: 'EUR',
    supplier: { id: 'sup-1', name: 'Fornitore ABC', code: 'F001' },
    variant: {
      id: 'var-1',
      sku: 'SKU-M-ROSSO',
      product: { id: 'prod-1', name: 'Maglia cotone' },
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function attachmentRow(overrides: Partial<SupplierAttachment> = {}): SupplierAttachment {
  return {
    id: 'att-1',
    fileName: 'listino-2026.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    createdByName: 'Luigi Amato',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function asFormData(body: unknown): FormData {
  if (!(body instanceof FormData)) {
    throw new Error('Corpo della richiesta: atteso FormData');
  }
  return body;
}

describe('SupplierService (HTTP)', () => {
  let service: SupplierService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SupplierService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
      ],
    });
    service = TestBed.inject(SupplierService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── Elenco completo ──────────────────────────────────────────────

  it('getSuppliers chiede /suppliers/all e restituisce i fornitori', async () => {
    const promise = firstValueFrom(service.getSuppliers());

    const req = httpMock.expectOne(`${API_BASE}/suppliers/all`);
    expect(req.request.method).toBe('GET');
    req.flush([supplierRow({ name: 'Fornitore ABC' })]);

    const suppliers = await promise;
    expect(suppliers).toHaveLength(1);
    expect(suppliers[0]?.name).toBe('Fornitore ABC');
  });

  it('getSuppliers restituisce un elenco vuoto senza errori', async () => {
    const promise = firstValueFrom(service.getSuppliers());

    httpMock.expectOne(`${API_BASE}/suppliers/all`).flush([]);

    await expect(promise).resolves.toEqual([]);
  });

  // ── Elenco paginato ──────────────────────────────────────────────

  it('list senza parametri non aggiunge nessuna query string', async () => {
    const promise = firstValueFrom(service.list());

    const req = httpMock.expectOne(`${API_BASE}/suppliers`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [supplierRow()], total: 1, page: 1, pageSize: 20 });

    const result = await promise;
    expect(result.data[0]?.id).toBe('sup-1');
  });

  it('list compone la query string con pagina, dimensione e ricerca', async () => {
    const promise = firstValueFrom(service.list({ page: 2, pageSize: 25, search: 'ACME' }));

    const req = httpMock.expectOne(`${API_BASE}/suppliers?page=2&pageSize=25&search=ACME`);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [], total: 0, page: 2, pageSize: 25 });

    await promise;
  });

  it('list scarta gli spazi attorno al termine di ricerca', async () => {
    const promise = firstValueFrom(service.list({ search: '   ACME   ' }));

    httpMock
      .expectOne(`${API_BASE}/suppliers?search=ACME`)
      .flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('list codifica gli spazi interni del termine di ricerca', async () => {
    const promise = firstValueFrom(service.list({ search: 'ACME srl' }));

    httpMock
      .expectOne(`${API_BASE}/suppliers?search=ACME+srl`)
      .flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('list ignora una ricerca fatta di soli spazi', async () => {
    const promise = firstValueFrom(service.list({ search: '    ' }));

    httpMock
      .expectOne(`${API_BASE}/suppliers`)
      .flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('list ignora pagina e dimensione pagina a zero', async () => {
    const promise = firstValueFrom(service.list({ page: 0, pageSize: 0 }));

    httpMock
      .expectOne(`${API_BASE}/suppliers`)
      .flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('list calcola totalPages dal totale e dalla dimensione pagina', async () => {
    const promise = firstValueFrom(service.list({ page: 2, pageSize: 3 }));

    httpMock.expectOne(`${API_BASE}/suppliers?page=2&pageSize=3`).flush({
      items: [supplierRow({ id: 'sup-4' }), supplierRow({ id: 'sup-5' })],
      total: 7,
      page: 2,
      pageSize: 3,
    });

    const result = await promise;
    expect(result.data).toHaveLength(2);
    expect(result.meta).toEqual({ page: 2, pageSize: 3, total: 7, totalPages: 3 });
  });

  it('list tiene totalPages a 1 anche senza nessun risultato', async () => {
    const promise = firstValueFrom(service.list({ page: 1, pageSize: 20 }));

    httpMock
      .expectOne(`${API_BASE}/suppliers?page=1&pageSize=20`)
      .flush({ items: [], total: 0, page: 1, pageSize: 20 });

    const result = await promise;
    expect(result.data).toEqual([]);
    expect(result.meta.totalPages).toBe(1);
  });

  // ── CRUD anagrafica ──────────────────────────────────────────────

  it('getById chiede il singolo fornitore per id', async () => {
    const promise = firstValueFrom(service.getById('sup-9'));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/sup-9`);
    expect(req.request.method).toBe('GET');
    req.flush(supplierRow({ id: 'sup-9', name: 'Fornitore XYZ' }));

    const supplier = await promise;
    expect(supplier.name).toBe('Fornitore XYZ');
  });

  it('createSupplier invia POST con il payload ricevuto', async () => {
    const input: SupplierInput = { name: 'Nuovo Fornitore', email: 'info@nuovo.it' };
    const promise = firstValueFrom(service.createSupplier(input));

    const req = httpMock.expectOne(`${API_BASE}/suppliers`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush(supplierRow({ id: 'sup-2', name: input.name, email: input.email }));

    const created = await promise;
    expect(created.id).toBe('sup-2');
  });

  it('updateSupplier invia PATCH con il solo campo modificato', async () => {
    const promise = firstValueFrom(service.updateSupplier('sup-1', { name: 'Fornitore ABC Srl' }));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/sup-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Fornitore ABC Srl' });
    req.flush(supplierRow({ name: 'Fornitore ABC Srl' }));

    const updated = await promise;
    expect(updated.name).toBe('Fornitore ABC Srl');
  });

  it('deleteSupplier invia DELETE sull-identificativo del fornitore', async () => {
    const promise = firstValueFrom(service.deleteSupplier('sup-1'));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/sup-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  // ── Collegamenti variante-fornitore ──────────────────────────────

  it('getVariantLinksBySupplier chiede i collegamenti sotto il fornitore', async () => {
    const promise = firstValueFrom(service.getVariantLinksBySupplier('sup-1'));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/sup-1/variant-links`);
    expect(req.request.method).toBe('GET');
    req.flush([variantLinkRow()]);

    const links = await promise;
    expect(links[0]?.variant.sku).toBe('SKU-M-ROSSO');
  });

  it('getVariantLinksByProduct chiede i collegamenti sotto il prodotto, non sotto il fornitore', async () => {
    const promise = firstValueFrom(service.getVariantLinksByProduct('prod-1'));

    const req = httpMock.expectOne(`${API_BASE}/products/prod-1/supplier-links`);
    expect(req.request.method).toBe('GET');
    req.flush([variantLinkRow({ isPreferred: false })]);

    const links = await promise;
    expect(links).toHaveLength(1);
    expect(links[0]?.supplier.name).toBe('Fornitore ABC');
  });

  it('upsertVariantLink invia POST con il payload di collegamento', async () => {
    const input: UpsertSupplierVariantLinkInput = {
      supplierId: 'sup-1',
      variantId: 'var-1',
      supplierSku: 'ABC-001',
      isPreferred: true,
      lastPurchasePriceMinor: 1250,
      minOrderQuantity: 6,
      currency: 'EUR',
    };
    const promise = firstValueFrom(service.upsertVariantLink(input));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/variant-links`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(input);
    req.flush(variantLinkRow());

    const link = await promise;
    expect(link.id).toBe('link-1');
  });

  it('deleteVariantLink invia DELETE sul collegamento, non sul fornitore', async () => {
    const promise = firstValueFrom(service.deleteVariantLink('link-1'));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/variant-links/link-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  // ── Allegati ─────────────────────────────────────────────────────

  it('listAttachments chiede gli allegati del fornitore', async () => {
    const promise = firstValueFrom(service.listAttachments('sup-1'));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/sup-1/attachments`);
    expect(req.request.method).toBe('GET');
    req.flush([attachmentRow()]);

    const attachments = await promise;
    expect(attachments[0]?.fileName).toBe('listino-2026.pdf');
  });

  it('listAttachments restituisce un elenco vuoto quando non ci sono allegati', async () => {
    const promise = firstValueFrom(service.listAttachments('sup-1'));

    httpMock.expectOne(`${API_BASE}/suppliers/sup-1/attachments`).flush([]);

    await expect(promise).resolves.toEqual([]);
  });

  it('uploadAttachment invia il file come FormData conservandone il nome', async () => {
    const file = new File(['bytes'], 'listino-2026.pdf', { type: 'application/pdf' });
    const promise = firstValueFrom(service.uploadAttachment('sup-1', file));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/sup-1/attachments`);
    expect(req.request.method).toBe('POST');
    const uploaded = asFormData(req.request.body).get('file');
    expect(uploaded).toBeInstanceOf(File);
    expect(uploaded instanceof File ? uploaded.name : null).toBe('listino-2026.pdf');
    req.flush(attachmentRow());

    const attachment = await promise;
    expect(attachment.id).toBe('att-1');
  });

  it('deleteAttachment invia DELETE su allegato annidato sotto il fornitore', async () => {
    const promise = firstValueFrom(service.deleteAttachment('sup-1', 'att-1'));

    const req = httpMock.expectOne(`${API_BASE}/suppliers/sup-1/attachments/att-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await expect(promise).resolves.toBeNull();
  });
});
