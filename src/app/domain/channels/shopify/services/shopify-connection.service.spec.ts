import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import { APP_CONFIG } from '@core/config/app-config.token';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { TenantPermission } from '@core/models/tenant-permission.model';
import { TenantChannelProfile } from '@core/models/tenant-channel-profile.model';
import { UserRole } from '@core/models/user.model';
import type { User } from '@core/models/user.model';

import { ShopifyConnectionService } from './shopify-connection.service';

const API_BASE = 'http://localhost:3000/api/v1';

function authUserOwner(): User {
  return {
    id: 'u1',
    tenantId: 'tenant-1',
    email: 'owner@test.it',
    displayName: 'Owner',
    avatarUrl: null,
    role: UserRole.Owner,
    storeIds: [],
    isActive: true,
    isPlatformAdmin: false,
    tenantChannelProfile: TenantChannelProfile.Shopify,
    manualUnloadEnabled: true,
    tenantName: 'Test',
    hasAllLocationsAccess: true,
    assignedLocationIds: [],
    assignedLocations: [],
    defaultLocationId: null,
    defaultLocation: null,
    permissions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('ShopifyConnectionService (HTTP)', () => {
  let service: ShopifyConnectionService;
  let httpMock: HttpTestingController;
  const authMock = { currentUser: vi.fn(() => authUserOwner()) };

  beforeEach(() => {
    authMock.currentUser.mockImplementation(() => authUserOwner());
    TestBed.configureTestingModule({
      providers: [
        ShopifyConnectionService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: API_BASE } },
        {
          provide: AuthService,
          useValue: authMock,
        },
      ],
    });
    service = TestBed.inject(ShopifyConnectionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getConnection mappa lo stato connessione', async () => {
    const promise = firstValueFrom(service.getConnection());

    const req = httpMock.expectOne(`${API_BASE}/shopify/connection`);
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'conn-1',
      tenantId: 'tenant-1',
      status: ShopifyConnectionStatus.Connected,
      shopDomain: 'store.myshopify.com',
      scopes: ['read_products'],
      autoSyncEnabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    const result = await promise;
    expect(result.status).toBe(ShopifyConnectionStatus.Connected);
    expect(result.shopDomain).toBe('store.myshopify.com');
  });

  it('getConnection non chiama API senza ruolo titolare', async () => {
    authMock.currentUser.mockReturnValue({
      ...authUserOwner(),
      role: UserRole.Clerk,
      permissions: [TenantPermission.CatalogImportExport],
    });

    await expect(firstValueFrom(service.getConnection())).rejects.toThrow();
    httpMock.expectNone(`${API_BASE}/shopify/connection`);
  });

  it('getConnection non chiama API su un tenant solo gestionale', async () => {
    // Il controller Shopify rifiuta l'intero gruppo di rotte per profilo canale:
    // chiederglielo lo stesso significa un 403 per ogni schermata che si apre.
    authMock.currentUser.mockReturnValue({
      ...authUserOwner(),
      tenantChannelProfile: TenantChannelProfile.Gestionale,
      manualUnloadEnabled: true,
    });

    await expect(firstValueFrom(service.getConnection())).rejects.toThrow();
    httpMock.expectNone(`${API_BASE}/shopify/connection`);
  });

  it('beginAuth invia shop e restituisce authorizeUrl', async () => {
    const promise = firstValueFrom(service.beginAuth('mystore.myshopify.com'));

    const req = httpMock.expectOne(`${API_BASE}/shopify/auth/begin`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ shop: 'mystore.myshopify.com' });
    req.flush({ authorizeUrl: 'https://shopify.com/oauth' });

    expect(await promise).toEqual({ authorizeUrl: 'https://shopify.com/oauth' });
  });

  it('syncProducts invia POST al endpoint catalogo', async () => {
    const promise = firstValueFrom(service.syncProducts());

    const req = httpMock.expectOne(`${API_BASE}/shopify/sync/products`);
    expect(req.request.method).toBe('POST');
    req.flush({ imported: 2, updated: 1, failed: [], remoteProductCount: 3, unchanged: 0 });

    const result = await promise;
    expect(result.imported).toBe(2);
  });

  it('disconnect elimina la connessione', async () => {
    const promise = firstValueFrom(service.disconnect());

    const req = httpMock.expectOne(`${API_BASE}/shopify/connection`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ disconnected: true });

    expect(await promise).toEqual({ disconnected: true });
  });

  it('syncLocations invia POST e invalida cache connessione', async () => {
    const promise = firstValueFrom(service.syncLocations());

    const req = httpMock.expectOne(`${API_BASE}/shopify/sync/locations`);
    expect(req.request.method).toBe('POST');
    req.flush({ synced: true, matchedCount: 1, importedCount: 2, totalCount: 3 });

    const result = await promise;
    expect(result.importedCount).toBe(2);
  });

  it('previewShopChange legge anteprima purge', async () => {
    const promise = firstValueFrom(service.previewShopChange());

    const req = httpMock.expectOne(`${API_BASE}/shopify/shop-change/preview`);
    expect(req.request.method).toBe('GET');
    req.flush({
      currentShopDomain: 'store.myshopify.com',
      counts: {
        shopifyProducts: 10,
        shopifyVariants: 25,
        shopifyCustomers: 5,
        shopifySalesOrders: 3,
        inventoryLevels: 20,
        stockMovements: 0,
        shopifyLinkedLocations: 2,
        removableShopifyLocations: 1,
      },
      blockers: [],
    });

    const result = await promise;
    expect(result.currentShopDomain).toBe('store.myshopify.com');
    expect(result.counts.shopifyProducts).toBe(10);
  });

  it('purgeShopifyData invia payload conferma dominio', async () => {
    const body = {
      confirmShopDomain: 'store.myshopify.com',
      purgeCatalog: true,
      purgeCustomers: true,
      purgeOrders: true,
    };
    const promise = firstValueFrom(service.purgeShopifyData(body));

    const req = httpMock.expectOne(`${API_BASE}/shopify/shop-change/purge`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({
      purged: {
        products: 10,
        customers: 5,
        salesOrders: 3,
        stockMovements: 0,
        inventoryLevels: 20,
        inventoryCountLines: 0,
        locations: 2,
      },
    });

    const result = await promise;
    expect(result.purged.products).toBe(10);
  });

  describe('allineaDisponibilita — una pressione, blocchi automatici', () => {
    /** Un blocco come lo manda il server. */
    function blocco(sovrascrivi: Partial<Record<string, unknown>> = {}) {
      return {
        aligned: true,
        totale: 300,
        esaminate: 200,
        allineate: 0,
        giaAllineate: 200,
        nonAllineate: [],
        prossimo: { locationId: 'loc-1', variantId: 'var-200' },
        fine: false,
        ...sovrascrivi,
      };
    }

    function riga(motivo: string, sede = 'Magazzino 1') {
      return {
        variantId: 'var-x',
        locationId: 'loc-1',
        articolo: 'Maglia cotone',
        codiceArticolo: 'ART-1',
        variante: 'M · Rosso',
        sku: 'SKU-1',
        sede,
        motivo,
        dettaglio: 'una frase',
      };
    }

    it('⭐ incatena i blocchi da sé: chi preme non preme una seconda volta', async () => {
      const avanzamenti: { esaminate: number; completo: boolean }[] = [];
      const finito = new Promise<void>((risolvi) => {
        service.allineaDisponibilita().subscribe({
          next: (a) => avanzamenti.push({ esaminate: a.esaminate, completo: a.completo }),
          complete: () => risolvi(),
        });
      });

      // ── primo blocco: nessun cursore, e non è finito ──────────────────
      const primo = httpMock.expectOne(`${API_BASE}/shopify/sync/inventory/align`);
      expect(primo.request.method).toBe('POST');
      expect(primo.request.body).toEqual({ prossimo: null });
      primo.flush(blocco());

      // ── secondo blocco: parte DA SOLO, col cursore del primo ──────────
      const secondo = httpMock.expectOne(`${API_BASE}/shopify/sync/inventory/align`);
      expect(secondo.request.body).toEqual({
        prossimo: { locationId: 'loc-1', variantId: 'var-200' },
      });
      secondo.flush(blocco({ esaminate: 100, giaAllineate: 100, prossimo: null, fine: true }));

      await finito;

      // ⭐ Due avanzamenti, uno per blocco: l'operatore vede il giro procedere.
      expect(avanzamenti).toEqual([
        { esaminate: 200, completo: false },
        { esaminate: 300, completo: true },
      ]);
    });

    it('⭐ l elenco delle non allineate si ACCUMULA, e non ne perde nessuna', async () => {
      const promessa = new Promise<{ nonAllineate: readonly { motivo: string }[] }>((risolvi) => {
        let ultimo: never;
        service.allineaDisponibilita().subscribe({
          next: (a) => (ultimo = a as never),
          complete: () => risolvi(ultimo),
        });
      });

      httpMock
        .expectOne(`${API_BASE}/shopify/sync/inventory/align`)
        .flush(blocco({ nonAllineate: [riga('livello_non_disponibile')] }));
      httpMock.expectOne(`${API_BASE}/shopify/sync/inventory/align`).flush(
        blocco({
          nonAllineate: [riga('divergenza_accertata', 'Magazzino 2')],
          prossimo: null,
          fine: true,
        }),
      );

      const finale = await promessa;
      // ⭐ Tutte e due, da blocchi diversi: l'elenco finale è completo.
      expect(finale.nonAllineate.map((r) => r.motivo)).toEqual([
        'livello_non_disponibile',
        'divergenza_accertata',
      ]);
    });

    it('⛔ se la catena si INTERROMPE, non si dichiara completo', async () => {
      const avanzamenti: { esaminate: number; completo: boolean }[] = [];
      let fallito = false;
      const finito = new Promise<void>((risolvi) => {
        service.allineaDisponibilita().subscribe({
          next: (a) => avanzamenti.push({ esaminate: a.esaminate, completo: a.completo }),
          error: () => {
            fallito = true;
            risolvi();
          },
          complete: () => risolvi(),
        });
      });

      httpMock.expectOne(`${API_BASE}/shopify/sync/inventory/align`).flush(blocco());
      // ── il secondo blocco cade ────────────────────────────────────────
      httpMock
        .expectOne(`${API_BASE}/shopify/sync/inventory/align`)
        .flush('rete caduta', { status: 503, statusText: 'Service Unavailable' });

      await finito;

      expect(fallito).toBe(true);
      // ⛔ **L'unico avanzamento visto NON è completo**, e chi guarda deve
      //    leggere «operazione incompleta»: l'elenco che porta è parziale.
      expect(avanzamenti).toEqual([{ esaminate: 200, completo: false }]);
    });
  });
});
