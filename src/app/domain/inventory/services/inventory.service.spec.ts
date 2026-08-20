import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CONFIG } from '@core/config/app-config.token';
import { AppErrorKind, isAppError } from '@core/models/app-error.model';
import { InventoryCountStatus } from '@core/models/inventory-count.model';
import {
  AdjustmentDirection,
  MovementOrigin,
  StockMovementType,
} from '@core/models/stock-movement.model';

import { InventoryService } from './inventory.service';

const API_BASE = 'http://localhost:3000/api/v1';
const LOCATIONS_URL = `${API_BASE}/inventory/locations`;
const LOCATIONS_CACHE_MS = 5 * 60_000;

const locationRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'loc-1',
  tenantId: 'tenant-1',
  name: 'Negozio',
  isActive: true,
  shopifySyncStatus: 'not_connected',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const countSessionRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'cnt-1',
  locationId: 'loc-1',
  name: 'Inventario luglio',
  notes: null,
  status: InventoryCountStatus.InProgress,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  completedAt: null,
  createdByName: 'Mario Rossi',
  location: { name: 'Negozio' },
  _count: { lines: 3 },
  ...overrides,
});

const levelRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'lvl-1',
  tenantId: 'tenant-1',
  variantId: 'var-1',
  locationId: 'loc-1',
  onHand: 10,
  available: 8,
  committed: 1,
  incoming: 0,
  reserved: 1,
  minThreshold: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** Restringe il body di una richiesta a FormData senza ricorrere a cast opachi. */
function asFormData(body: unknown): FormData {
  if (!(body instanceof FormData)) {
    throw new Error('Il body della richiesta non e una FormData.');
  }
  return body;
}

describe('InventoryService (HTTP)', () => {
  let service: InventoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: APP_CONFIG,
          useValue: {
            apiBaseUrl: API_BASE,
          },
        },
      ],
    });
    service = TestBed.inject(InventoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  // ── Location e cache ────────────────────────────────────────────────

  it('getLocations mappa le location dall API', async () => {
    const promise = firstValueFrom(service.getLocations());

    const req = httpMock.expectOne(LOCATIONS_URL);
    req.flush([locationRow()]);

    const locations = await promise;
    expect(locations.length).toBe(1);
    expect(locations[0]?.name).toBe('Negozio');
  });

  it('getLocations serve la seconda lettura dalla cache senza ripetere la chiamata', async () => {
    const first = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow()]);
    await first;

    const second = await firstValueFrom(service.getLocations());

    httpMock.expectNone(LOCATIONS_URL);
    expect(second[0]?.id).toBe('loc-1');
  });

  it('getLocations ricarica le location quando la cache e scaduta', async () => {
    const startedAt = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(startedAt);

    const first = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow()]);
    await first;

    now.mockReturnValue(startedAt + LOCATIONS_CACHE_MS + 1);

    const second = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow({ name: 'Magazzino' })]);

    expect((await second)[0]?.name).toBe('Magazzino');
  });

  it('invalidateLocationsCache costringe la lettura successiva a rifare la chiamata', async () => {
    const first = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow()]);
    await first;

    service.invalidateLocationsCache();

    const second = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow({ name: 'Outlet' })]);

    expect((await second)[0]?.name).toBe('Outlet');
  });

  it('watchLocationsInvalidated emette a ogni invalidazione della cache', () => {
    const emissioni: number[] = [];
    const sub = service.watchLocationsInvalidated().subscribe(() => emissioni.push(1));

    service.invalidateLocationsCache();
    service.invalidateLocationsCache();
    sub.unsubscribe();

    expect(emissioni.length).toBe(2);
  });

  it('setLicensedLocations invia PUT con gli id e invalida la cache location', async () => {
    const primed = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow()]);
    await primed;

    const promise = firstValueFrom(service.setLicensedLocations(['loc-1', 'loc-2']));
    const req = httpMock.expectOne(`${API_BASE}/inventory/locations/licensed`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ locationIds: ['loc-1', 'loc-2'] });
    req.flush({
      licensedLocationCount: 2,
      licensedLocationActiveCount: 1,
      locationSelectionLocked: true,
      locationSelectionChangeGranted: false,
      canChangeLicensedLocations: false,
    });

    const esito = await promise;
    expect(esito.licensedLocationCount).toBe(2);
    expect(esito.locationSelectionLocked).toBe(true);

    const reloaded = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow()]);
    await reloaded;
  });

  it('getLocationById legge dalla cache delle location', async () => {
    const locations = firstValueFrom(service.getLocations());
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow()]);
    await locations;

    const location = await firstValueFrom(service.getLocationById('loc-1'));
    expect(location.name).toBe('Negozio');
  });

  it('getLocationById fallisce con NotFound se la location non e nella lista', async () => {
    const promise = firstValueFrom(service.getLocationById('loc-inesistente'));
    httpMock.expectOne(LOCATIONS_URL).flush([locationRow()]);

    const errore: unknown = await promise.then(
      () => new Error('la chiamata doveva fallire'),
      (reason: unknown) => reason,
    );

    expect(isAppError(errore)).toBe(true);
    if (isAppError(errore)) {
      expect(errore.kind).toBe(AppErrorKind.NotFound);
      expect(errore.status).toBe(404);
      expect(errore.message).toBe('Location non trovata.');
    }
  });

  // ── Giacenze ────────────────────────────────────────────────────────

  it('getLevels mappa le giacenze', async () => {
    const promise = firstValueFrom(service.getLevels());

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels`),
    );
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    req.flush({ items: [levelRow()], total: 1, page: 1, pageSize: 50 });

    const levels = await promise;
    expect(levels.data[0]?.available).toBe(8);
    expect(levels.meta.total).toBe(1);
  });

  it('getLevels passa filtri server-side', async () => {
    const promise = firstValueFrom(
      service.getLevels({ page: 1, pageSize: 20, locationId: 'loc-1', lowStockOnly: true }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels`),
    );
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('lowStockOnly')).toBe('true');
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('getLevels passa ricerca libera e variante', async () => {
    const promise = firstValueFrom(service.getLevels({ search: 'SKU-1', variantId: 'var-9' }));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels`),
    );
    expect(req.request.params.get('search')).toBe('SKU-1');
    expect(req.request.params.get('variantId')).toBe('var-9');
    expect(req.request.params.get('lowStockOnly')).toBeNull();
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('getLevelsByVariant chiede una pagina sola da 100 e restituisce le sole righe', async () => {
    const promise = firstValueFrom(service.getLevelsByVariant('var-1'));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels`),
    );
    expect(req.request.params.get('variantId')).toBe('var-1');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('100');
    req.flush({ items: [levelRow()], total: 1, page: 1, pageSize: 100 });

    const righe = await promise;
    expect(righe.length).toBe(1);
    expect(righe[0]?.locationId).toBe('loc-1');
  });

  it('getLevelsByLocation filtra per location e restituisce le sole righe', async () => {
    const promise = firstValueFrom(service.getLevelsByLocation('loc-1'));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels`),
    );
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('pageSize')).toBe('100');
    req.flush({ items: [levelRow({ id: 'lvl-2' })], total: 1, page: 1, pageSize: 100 });

    const righe = await promise;
    expect(righe.length).toBe(1);
  });

  it('updateLevelMinThreshold invia PATCH', async () => {
    const promise = firstValueFrom(service.updateLevelMinThreshold('lvl-1', 5));

    const req = httpMock.expectOne(`${API_BASE}/inventory/levels/lvl-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ minThreshold: 5 });
    req.flush(levelRow({ minThreshold: 5 }));

    const level = await promise;
    expect(level.minThreshold).toBe(5);
  });

  it('getLocationInventoryReport legge il riepilogo per location', async () => {
    const promise = firstValueFrom(service.getLocationInventoryReport());

    const req = httpMock.expectOne(`${API_BASE}/inventory/reports/location-summary`);
    expect(req.request.method).toBe('GET');
    req.flush([
      {
        locationId: 'loc-1',
        locationName: 'Negozio',
        trackedVariants: 12,
        availableUnits: 40,
        lowStockCount: 2,
        stockValueMinor: 129900,
        currencyCode: 'EUR',
      },
    ]);

    const righe = await promise;
    expect(righe.length).toBe(1);
    expect(righe[0]?.stockValueMinor).toBe(129900);
  });

  it('getReservations passa variante e location come parametri', async () => {
    const promise = firstValueFrom(service.getReservations('var-1', 'loc-1'));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/reservations`),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('variantId')).toBe('var-1');
    expect(req.request.params.get('locationId')).toBe('loc-1');
    req.flush([
      {
        id: 'res-1',
        orderNumber: 'ORD-1',
        channel: 'manual',
        quantity: 2,
        sku: 'SKU-1',
        locationName: 'Negozio',
        placedAt: '2026-07-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
      },
    ]);

    const impegni = await promise;
    expect(impegni.length).toBe(1);
    expect(impegni[0]?.quantity).toBe(2);
  });

  // ── Situazione ──────────────────────────────────────────────────────

  it('getSituation mappa le righe e passa i filtri server-side', async () => {
    const promise = firstValueFrom(
      service.getSituation({ stockStatus: 'low', supplierId: 'sup-1', category: 'Giacche' }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/situation`),
    );
    expect(req.request.params.get('stockStatus')).toBe('low');
    expect(req.request.params.get('supplierId')).toBe('sup-1');
    expect(req.request.params.get('category')).toBe('Giacche');
    req.flush({
      items: [
        {
          variantId: 'var-1',
          productId: 'prod-1',
          title: 'Blazer — M',
          articleCode: '00001',
          sku: 'SKU-1',
          category: 'Giacche',
          supplierId: 'sup-1',
          supplierName: 'Manifattura Rossi',
          currency: 'EUR',
          sellingPriceMinor: 4900,
          purchasePriceMinor: 2000,
          available: 3,
          onHand: 4,
          committed: 1,
          incoming: 2,
          minThreshold: 5,
          totalIn: 10,
          totalOut: 7,
          stockStatus: 'low',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    const response = await promise;
    expect(response.data[0]).toMatchObject({ code: '00001', status: 'low', available: 3 });
    expect(response.meta.total).toBe(1);
  });

  it('getSituation passa location e ricerca libera', async () => {
    const promise = firstValueFrom(service.getSituation({ locationId: 'loc-1', search: 'blazer' }));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/situation`),
    );
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('search')).toBe('blazer');
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('getSituation senza query usa la prima pagina e la dimensione di default', async () => {
    const promise = firstValueFrom(service.getSituation());

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/situation`),
    );
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.get('locationId')).toBeNull();
    expect(req.request.params.get('supplierId')).toBeNull();
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });

    const response = await promise;
    expect(response.data).toEqual([]);
  });

  // ── Movimenti ───────────────────────────────────────────────────────

  it('registerMovement invia POST e mappa la risposta', async () => {
    const promise = firstValueFrom(
      service.registerMovement({
        type: StockMovementType.Load,
        variantId: 'var-1',
        sku: 'SKU-1',
        locationId: 'loc-1',
        quantity: 3,
        createdBy: 'user-1',
        createdByName: 'Test',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/movements`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      type: StockMovementType.Load,
      variantId: 'var-1',
      locationId: 'loc-1',
      quantity: 3,
    });

    req.flush({
      id: 'mov-1',
      tenantId: 'tenant-1',
      type: StockMovementType.Load,
      variantId: 'var-1',
      sku: 'SKU-1',
      locationId: 'loc-1',
      quantity: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdByName: 'API',
    });

    const movement = await promise;
    expect(movement.id).toBe('mov-1');
    expect(movement.quantity).toBe(3);
  });

  it('registerMovement porta destinazione, verso e motivo nel body', async () => {
    const promise = firstValueFrom(
      service.registerMovement({
        type: StockMovementType.Adjustment,
        variantId: 'var-1',
        sku: 'SKU-1',
        locationId: 'loc-1',
        targetLocationId: 'loc-2',
        direction: AdjustmentDirection.Decrease,
        reason: 'Merce danneggiata',
        quantity: 1,
        createdBy: 'user-1',
        createdByName: 'Test',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/movements`);
    expect(req.request.body).toMatchObject({
      targetLocationId: 'loc-2',
      direction: AdjustmentDirection.Decrease,
      reason: 'Merce danneggiata',
    });
    req.flush({
      id: 'mov-3',
      tenantId: 'tenant-1',
      type: StockMovementType.Adjustment,
      variantId: 'var-1',
      sku: 'SKU-1',
      locationId: 'loc-1',
      targetLocationId: 'loc-2',
      direction: AdjustmentDirection.Decrease,
      reason: 'Merce danneggiata',
      quantity: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdByName: 'API',
    });

    const movement = await promise;
    expect(movement.direction).toBe(AdjustmentDirection.Decrease);
    expect(movement.reason).toBe('Merce danneggiata');
  });

  it('getMovements mappa la lista paginata', async () => {
    const promise = firstValueFrom(service.getMovements());

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/movements`),
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      items: [
        {
          id: 'mov-2',
          tenantId: 'tenant-1',
          type: StockMovementType.Unload,
          variantId: 'var-1',
          sku: 'SKU-1',
          locationId: 'loc-1',
          quantity: 2,
          createdAt: '2026-01-02T00:00:00.000Z',
          createdByName: 'Test User',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });

    const movements = await promise;
    expect(movements.data.length).toBe(1);
    expect(movements.data[0]?.type).toBe(StockMovementType.Unload);
    expect(movements.meta.total).toBe(1);
  });

  /**
   * ⛔ **`page` e `pageSize` NON si mandano più.** Il registro movimenti non
   * pagina: l'API risponde con l'intero risultato del filtro, e a delimitarlo è
   * il periodo. Mandarli sarebbe il «parametro accettato e ignorato» — quello
   * che il codice dei Corrispettivi avverte di non reintrodurre.
   */
  it('⛔ getMovements passa i filtri e NON manda page/pageSize', async () => {
    const promise = firstValueFrom(
      service.getMovements({
        locationId: 'loc-1',
        type: StockMovementType.Sale,
      }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/movements`),
    );
    expect(req.request.params.has('page')).toBe(false);
    expect(req.request.params.has('pageSize')).toBe(false);
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('type')).toBe(StockMovementType.Sale);
    req.flush({ items: [], total: 0, page: 2, pageSize: 10 });

    const response = await promise;
    expect(response.data).toEqual([]);
    expect(response.meta.page).toBe(2);
  });

  it('getMovements passa origine, variante, controparte, operatore e periodo', async () => {
    const promise = firstValueFrom(
      service.getMovements({
        search: 'SKU-1',
        origin: MovementOrigin.Shopify,
        variantId: 'var-1',
        partyId: 'cust-1',
        createdBy: 'Mario Rossi',
        from: '2026-07-01',
        to: '2026-07-31',
      }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/movements`),
    );
    expect(req.request.params.get('search')).toBe('SKU-1');
    expect(req.request.params.get('origin')).toBe(MovementOrigin.Shopify);
    expect(req.request.params.get('variantId')).toBe('var-1');
    expect(req.request.params.get('partyId')).toBe('cust-1');
    expect(req.request.params.get('createdBy')).toBe('Mario Rossi');
    expect(req.request.params.get('from')).toBe('2026-07-01');
    expect(req.request.params.get('to')).toBe('2026-07-31');
    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });

    await promise;
  });

  it('getMovementOperators legge gli operatori distinti', async () => {
    const promise = firstValueFrom(service.getMovementOperators());

    const req = httpMock.expectOne(`${API_BASE}/inventory/movements/operators`);
    expect(req.request.method).toBe('GET');
    req.flush(['Mario Rossi', 'Shopify']);

    await expect(promise).resolves.toEqual(['Mario Rossi', 'Shopify']);
  });

  it('registerMovementBatch invia POST con tutte le righe', async () => {
    const promise = firstValueFrom(
      service.registerMovementBatch({
        type: StockMovementType.Load,
        operationDate: '2026-07-01',
        locationId: 'loc-1',
        reason: 'Acquisto merce',
        partyId: 'sup-1',
        partyName: 'Manifattura Rossi',
        lines: [{ variantId: 'var-1', quantity: 2, unitAmountMinor: 900 }],
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/movements/batch`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({
      type: StockMovementType.Load,
      locationId: 'loc-1',
      lines: [{ variantId: 'var-1', quantity: 2, unitAmountMinor: 900 }],
    });
    req.flush({ created: 1 });

    await expect(promise).resolves.toEqual({ created: 1 });
  });

  // ── Inventario fisico ───────────────────────────────────────────────

  it('listInventoryCounts chiede una pagina da 100 e mappa le sessioni', async () => {
    const promise = firstValueFrom(service.listInventoryCounts());

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/counts`),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('100');
    req.flush({ items: [countSessionRow()], total: 1, page: 1, pageSize: 100 });

    const sessioni = await promise;
    expect(sessioni.length).toBe(1);
    expect(sessioni[0]?.locationName).toBe('Negozio');
    expect(sessioni[0]?.lineCount).toBe(3);
    expect(sessioni[0]?.status).toBe(InventoryCountStatus.InProgress);
  });

  it('getInventoryCount mappa la sessione con le righe contate e le differenze', async () => {
    const promise = firstValueFrom(service.getInventoryCount('cnt-1'));

    const req = httpMock.expectOne(`${API_BASE}/inventory/counts/cnt-1`);
    expect(req.request.method).toBe('GET');
    req.flush(
      countSessionRow({
        _count: undefined,
        lines: [
          {
            id: 'line-1',
            variantId: 'var-1',
            sku: 'SKU-1',
            productName: 'Blazer',
            systemQuantity: 4,
            countedQuantity: 4,
          },
          {
            id: 'line-2',
            variantId: 'var-2',
            sku: 'SKU-2',
            productName: 'Camicia',
            systemQuantity: 2,
            countedQuantity: 5,
          },
          {
            id: 'line-3',
            variantId: 'var-3',
            sku: 'SKU-3',
            productName: 'Gonna',
            systemQuantity: 1,
            countedQuantity: null,
          },
        ],
      }),
    );

    const sessione = await promise;
    expect(sessione.lineCount).toBe(3);
    expect(sessione.linesCounted).toBe(2);
    expect(sessione.linesWithDelta).toBe(1);
    expect(sessione.lines?.[1]?.countedQuantity).toBe(5);
  });

  it('createInventoryCount invia POST con location, nome e note', async () => {
    const promise = firstValueFrom(
      service.createInventoryCount({
        locationId: 'loc-1',
        name: 'Inventario luglio',
        notes: 'Solo scaffale A',
      }),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/counts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      locationId: 'loc-1',
      name: 'Inventario luglio',
      notes: 'Solo scaffale A',
    });
    req.flush(countSessionRow());

    const sessione = await promise;
    expect(sessione.id).toBe('cnt-1');
  });

  it('updateInventoryCountLine invia PATCH sulla riga della sessione', async () => {
    const promise = firstValueFrom(service.updateInventoryCountLine('cnt-1', 'line-1', 7));

    const req = httpMock.expectOne(`${API_BASE}/inventory/counts/cnt-1/lines/line-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ countedQuantity: 7 });
    req.flush({
      id: 'line-1',
      variantId: 'var-1',
      sku: 'SKU-1',
      productName: 'Blazer',
      systemQuantity: 4,
      countedQuantity: 7,
    });

    const riga = await promise;
    expect(riga.countedQuantity).toBe(7);
    expect(riga.productName).toBe('Blazer');
  });

  it('submitInventoryCount porta la sessione in revisione', async () => {
    const promise = firstValueFrom(service.submitInventoryCount('cnt-1'));

    const req = httpMock.expectOne(`${API_BASE}/inventory/counts/cnt-1/submit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(countSessionRow({ status: InventoryCountStatus.Review }));

    const sessione = await promise;
    expect(sessione.status).toBe(InventoryCountStatus.Review);
  });

  it('finalizeInventoryCount chiude la sessione e riporta il documento generato', async () => {
    const promise = firstValueFrom(service.finalizeInventoryCount('cnt-1'));

    const req = httpMock.expectOne(`${API_BASE}/inventory/counts/cnt-1/finalize`);
    expect(req.request.method).toBe('POST');
    req.flush(
      countSessionRow({
        status: InventoryCountStatus.Completed,
        completedAt: '2026-07-02T00:00:00.000Z',
        documentId: 'doc-1',
      }),
    );

    const sessione = await promise;
    expect(sessione.status).toBe(InventoryCountStatus.Completed);
    expect(sessione.documentId).toBe('doc-1');
    expect(sessione.completedAt).toBe('2026-07-02T00:00:00.000Z');
  });

  it('cancelInventoryCount annulla la sessione', async () => {
    const promise = firstValueFrom(service.cancelInventoryCount('cnt-1'));

    const req = httpMock.expectOne(`${API_BASE}/inventory/counts/cnt-1/cancel`);
    expect(req.request.method).toBe('POST');
    req.flush(countSessionRow({ status: InventoryCountStatus.Cancelled }));

    const sessione = await promise;
    expect(sessione.status).toBe(InventoryCountStatus.Cancelled);
  });

  it('deleteInventoryCount invia DELETE sulla sessione', async () => {
    const promise = firstValueFrom(service.deleteInventoryCount('cnt-1'));

    const req = httpMock.expectOne(`${API_BASE}/inventory/counts/cnt-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await expect(promise).resolves.toBeNull();
  });

  // ── Import / export ─────────────────────────────────────────────────

  it('previewInventoryImport carica il file e restituisce il riepilogo', async () => {
    const file = new File(['sku;qta'], 'giacenze.csv', { type: 'text/csv' });
    const promise = firstValueFrom(service.previewInventoryImport(file));

    const req = httpMock.expectOne(`${API_BASE}/inventory/levels/import/preview`);
    expect(req.request.method).toBe('POST');
    const inviato = asFormData(req.request.body);
    expect(inviato.get('file')).toBeInstanceOf(File);
    req.flush({
      rows: [
        {
          key: 'SKU-1|loc-1',
          rowNumber: 2,
          variantTitle: 'Blazer — M',
          sku: 'SKU-1',
          locationName: 'Negozio',
          currentAvailable: 3,
          newAvailable: 5,
          delta: 2,
          status: 'ready',
        },
      ],
      summary: { total: 1, ready: 1, unchanged: 0, errors: 0 },
    });

    const preview = await promise;
    expect(preview.summary.ready).toBe(1);
    expect(preview.rows[0]?.delta).toBe(2);
  });

  it('importInventoryCsv invia solo le chiavi selezionate', async () => {
    const file = new File(['sku;qta'], 'giacenze.csv', { type: 'text/csv' });
    const promise = firstValueFrom(
      service.importInventoryCsv(file, ['SKU-1|loc-1', 'SKU-2|loc-1']),
    );

    const req = httpMock.expectOne(`${API_BASE}/inventory/levels/import`);
    expect(req.request.method).toBe('POST');
    const inviato = asFormData(req.request.body);
    expect(inviato.getAll('keys[]')).toEqual(['SKU-1|loc-1', 'SKU-2|loc-1']);
    req.flush({ updated: 2, unchanged: 0, skipped: 0, failed: 0, rows: [] });

    const esito = await promise;
    expect(esito.updated).toBe(2);
  });

  it('importInventoryCsv senza selezione non manda alcuna chiave', async () => {
    const file = new File(['sku;qta'], 'giacenze.csv', { type: 'text/csv' });
    const promise = firstValueFrom(service.importInventoryCsv(file));

    const req = httpMock.expectOne(`${API_BASE}/inventory/levels/import`);
    const inviato = asFormData(req.request.body);
    expect(inviato.getAll('keys[]')).toEqual([]);
    req.flush({ updated: 0, unchanged: 0, skipped: 0, failed: 0, rows: [] });

    await promise;
  });

  it('importInventoryCsv con elenco chiavi vuoto non manda alcuna chiave', async () => {
    const file = new File(['sku;qta'], 'giacenze.csv', { type: 'text/csv' });
    const promise = firstValueFrom(service.importInventoryCsv(file, []));

    const req = httpMock.expectOne(`${API_BASE}/inventory/levels/import`);
    const inviato = asFormData(req.request.body);
    expect(inviato.getAll('keys[]')).toEqual([]);
    req.flush({ updated: 0, unchanged: 0, skipped: 0, failed: 0, rows: [] });

    await promise;
  });

  it('exportInventoryCsv chiede un blob e passa tutti i filtri', async () => {
    const promise = firstValueFrom(
      service.exportInventoryCsv({
        locationId: 'loc-1',
        search: 'blazer',
        stockStatus: 'low',
        columns: 'sku,available',
      }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels/export/csv`),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('search')).toBe('blazer');
    expect(req.request.params.get('stockStatus')).toBe('low');
    expect(req.request.params.get('columns')).toBe('sku,available');
    req.flush(new Blob(['sku;available'], { type: 'text/csv' }));

    const blob = await promise;
    expect(blob.type).toContain('text/csv');
  });

  it('exportInventoryCsv senza filtri non aggiunge parametri', async () => {
    const promise = firstValueFrom(service.exportInventoryCsv({}));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/levels/export/csv`),
    );
    expect(req.request.params.keys()).toEqual([]);
    req.flush(new Blob([''], { type: 'text/csv' }));

    await promise;
  });

  it('exportCorrispettiviCsv passa canale, location e periodo', async () => {
    const promise = firstValueFrom(
      service.exportCorrispettiviCsv({
        locationId: 'loc-1',
        origin: MovementOrigin.VestiflowPos,
        from: '2026-07-01',
        to: '2026-07-31',
      }),
    );

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/movements/export/corrispettivi`),
    );
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('locationId')).toBe('loc-1');
    expect(req.request.params.get('origin')).toBe(MovementOrigin.VestiflowPos);
    expect(req.request.params.get('from')).toBe('2026-07-01');
    expect(req.request.params.get('to')).toBe('2026-07-31');
    req.flush(new Blob(['data;totale'], { type: 'text/csv' }));

    const blob = await promise;
    expect(blob.type).toContain('text/csv');
  });

  it('exportCorrispettiviCsv senza filtri non aggiunge parametri', async () => {
    const promise = firstValueFrom(service.exportCorrispettiviCsv({}));

    const req = httpMock.expectOne((request) =>
      request.url.startsWith(`${API_BASE}/inventory/movements/export/corrispettivi`),
    );
    expect(req.request.params.keys()).toEqual([]);
    req.flush(new Blob([''], { type: 'text/csv' }));

    await promise;
  });
});
