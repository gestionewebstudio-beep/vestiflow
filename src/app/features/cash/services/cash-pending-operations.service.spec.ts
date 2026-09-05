import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '@core/auth';
import type { CashCheckoutPayload } from '@domain/cash/models/cash.model';
import { CashPendingOperationsService } from './cash-pending-operations.service';

const payload: CashCheckoutPayload = {
  locationId: 'sede',
  sessionId: 'sessione',
  creationIntentId: 'intento',
  lines: [
    {
      variantId: 'variante',
      quantity: 1,
      unitPriceMinor: 12.3456,
      discountPercent: 7,
      vatCodeId: 'iva',
      description: 'Originale',
    },
  ],
  payments: [{ paymentOptionId: 'carta', amountMinor: 14, confirmed: true }],
};

describe('invii Cassa conservati nel browser', () => {
  const user = signal({ id: 'utente', tenantId: 'tenant' });
  let service: CashPendingOperationsService;
  beforeEach(() => {
    sessionStorage.clear();
    user.set({ id: 'utente', tenantId: 'tenant' });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser: user } }],
    });
    service = TestBed.inject(CashPendingOperationsService);
  });

  it('persistenza precedente al POST e copia indipendente di ogni campo', () => {
    const input = structuredClone(payload);
    const request = service.prepare('checkout', input, 'Vendita originale');
    expect(sessionStorage.length).toBe(1);
    expect(request).toEqual(payload);
    expect(request).not.toBe(input);
    expect(service.recover('checkout')).toEqual(payload);
    expect(() =>
      service.prepare('checkout', { ...payload, creationIntentId: 'nuovo' }, 'Altra vendita'),
    ).toThrow(/precedente/);
  });

  it.each([0, 500, 503])('errore HTTP %i conserva tutto', (status) => {
    service.prepare('checkout', payload, 'Vendita');
    service.failed('checkout', payload.creationIntentId, new HttpErrorResponse({ status }), false);
    expect(service.recover('checkout')).toEqual(payload);
  });

  it.each([
    'creation_intent_mismatch',
    'creation_intent_in_progress',
    'creation_intent_result_missing',
  ])('%s non autorizza un nuovo invio', (code) => {
    service.prepare('checkout', payload, 'Vendita');
    service.failed(
      'checkout',
      payload.creationIntentId,
      new HttpErrorResponse({ status: 409, error: { code } }),
      false,
    );
    expect(service.recover('checkout')).toEqual(payload);
  });

  it('un rifiuto nel recupero non cancella un precedente esito incerto', () => {
    service.prepare('checkout', payload, 'Vendita');
    service.failed(
      'checkout',
      payload.creationIntentId,
      new HttpErrorResponse({ status: 403 }),
      true,
    );
    expect(service.recover('checkout')).toEqual(payload);
  });

  it('tenant e utente diversi non leggono e non chiudono il comando altrui', () => {
    service.prepare('checkout', payload, 'Vendita');
    const watched = service.watch('checkout');
    user.set({ id: 'altro', tenantId: 'tenant' });
    expect(watched().request).toBeNull();
    user.set({ id: 'utente', tenantId: 'altro' });
    expect(service.recover('checkout')).toBeNull();
    service.complete('checkout', payload.creationIntentId);
    user.set({ id: 'utente', tenantId: 'tenant' });
    expect(watched().request?.payload).toEqual(payload);
  });

  it('dati corrotti bloccano la creazione invece di perdere l’intento', () => {
    service.prepare('checkout', payload, 'Vendita');
    sessionStorage.setItem(sessionStorage.key(0)!, '{non leggibile');
    expect(service.watch('checkout')().error).toMatch(/non sono leggibili/);
    expect(() => service.prepare('checkout', payload, 'Altra')).toThrow(/non sono leggibili/);
    expect(sessionStorage.length).toBe(1);
  });

  it('storage non scrivibile impedisce il primo invio', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => service.prepare('checkout', payload, 'Vendita')).toThrow(/conservare/);
    } finally {
      write.mockRestore();
    }
  });

  it('una risposta obsoleta non chiude un intento nuovo', () => {
    service.prepare('checkout', payload, 'Vendita');
    service.complete('checkout', 'intento-di-un-altro-invio');
    expect(service.recover('checkout')).toEqual(payload);
    service.complete('checkout', payload.creationIntentId);
    expect(service.recover('checkout')).toBeNull();
  });
});
