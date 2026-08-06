import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { ShopifyConnection } from '@core/models/shopify-connection.model';
import { ShopifyConnectionStatus } from '@core/models/shopify-connection.model';
import { AppErrorKind } from '@core/models/app-error.model';

import { ShopifyConnectionService } from '../services/shopify-connection.service';
import { ShopifyConnectionStore } from './shopify-connection.store';

const CONNECTED = {
  id: 'conn-1',
  tenantId: 'tenant-1',
  status: ShopifyConnectionStatus.Connected,
  shopDomain: 'demo.myshopify.com',
} as ShopifyConnection;

describe('ShopifyConnectionStore', () => {
  const getConnection = vi.fn();
  const currentUser = signal<unknown>({
    id: 'u1',
    role: 'owner',
    tenantChannelProfile: 'shopify',
  });

  function makeStore(): ShopifyConnectionStore {
    TestBed.configureTestingModule({
      providers: [
        { provide: ShopifyConnectionService, useValue: { getConnection } },
        { provide: AuthService, useValue: { currentUser } },
      ],
    });
    const store = TestBed.inject(ShopifyConnectionStore);
    // Lo store parte da `toObservable`, che emette dentro un effect: senza un
    // giro di change detection resterebbe fermo su «loading».
    TestBed.tick();
    return store;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.clearAllMocks();
    getConnection.mockReturnValue(of(CONNECTED));
    currentUser.set({ id: 'u1', role: 'owner', tenantChannelProfile: 'shopify' });
  });

  it('con Shopify nel profilo e permesso, legge la connessione', () => {
    const store = makeStore();

    expect(store.available()).toBe(true);
    expect(store.connected()).toBe(true);
    expect(store.connection()?.shopDomain).toBe('demo.myshopify.com');
  });

  it('senza Shopify nel profilo non chiama l’API: il cancello viene prima della rete', () => {
    currentUser.set({ id: 'u1', role: 'owner', tenantChannelProfile: 'standalone' });
    const store = makeStore();

    expect(store.available()).toBe(false);
    expect(store.notFound()).toBe(true);
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('senza il permesso di gestire la connessione, nemmeno la legge', () => {
    currentUser.set({ id: 'u1', role: 'clerk', tenantChannelProfile: 'shopify' });
    const store = makeStore();

    expect(store.available()).toBe(false);
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('connection esclude not_connected: lì si mostra il form, non un negozio', () => {
    getConnection.mockReturnValue(
      of({ ...CONNECTED, status: ShopifyConnectionStatus.NotConnected }),
    );
    const store = makeStore();

    expect(store.connection()).toBeNull();
    expect(store.connectable()).toBe(true);
  });

  it('un 404 non e’ un errore: e’ un tenant che Shopify non l’ha mai collegato', () => {
    getConnection.mockReturnValue(
      throwError(() => ({ kind: AppErrorKind.NotFound, message: 'x' })),
    );
    const store = makeStore();

    expect(store.notFound()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.connectable()).toBe(true);
  });

  it('reload rilegge dal server: chi osserva lo store vede lo stesso aggiornamento', () => {
    const store = makeStore();
    expect(getConnection).toHaveBeenCalledTimes(1);

    getConnection.mockReturnValue(of({ ...CONNECTED, autoSyncEnabled: true }));
    store.reload();
    TestBed.tick();

    expect(getConnection).toHaveBeenCalledTimes(2);
    expect(store.connection()?.autoSyncEnabled).toBe(true);
  });
});
