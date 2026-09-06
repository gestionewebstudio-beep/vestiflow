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

  it.each([2, 99])(
    'versione %s: conserva dati e identità per la consultazione, senza reinvio',
    (version) => {
      const intentId = '11111111-1111-4111-8111-111111111111';
      const key = 'vestiflow.cash.pending.v1:tenant:utente:checkout';
      const raw = JSON.stringify({
        version,
        operation: 'checkout',
        payload: { creationIntentId: intentId },
      });
      sessionStorage.setItem(key, raw);
      const state = service.watch('checkout')();
      expect(state.request).toBeNull();
      expect(state.evidence).toMatchObject({ raw, intentId });
      expect(() => service.recover('checkout')).toThrow();
      expect(sessionStorage.getItem(key)).toBe(raw);
    },
  );

  it('JSON malformato: conserva il testo ma non indovina identità dai frammenti', () => {
    const raw = '{"creationIntentId":"11111111-1111-4111-8111-111111111111"';
    sessionStorage.setItem('vestiflow.cash.pending.v1:tenant:utente:checkout', raw);
    expect(service.watch('checkout')().evidence).toMatchObject({ raw, intentId: null });
  });

  it.each([
    { lines: [null] },
    { lines: [{ ...payload.lines[0], quantity: '2' }] },
    { lines: [{ ...payload.lines[0], unitPriceMinor: null }] },
    { lines: [{ ...payload.lines[0], description: { corrotta: true } }] },
    { payments: [null] },
    { payments: [{ ...payload.payments[0], amountMinor: '14' }] },
  ])('contenuto annidato incompatibile conserva il comando senza reinviarlo: %j', (change) => {
    const raw = JSON.stringify({
      version: 1,
      operation: 'checkout',
      description: 'TEST',
      payload: { ...payload, ...change },
    });
    const key = 'vestiflow.cash.pending.v1:tenant:utente:checkout';
    sessionStorage.setItem(key, raw);
    expect(service.watch('checkout')().request).toBeNull();
    expect(() => service.recover('checkout')).toThrow(/non sono leggibili/);
    expect(sessionStorage.getItem(key)).toBe(raw);
  });

  it('storage non leggibile: mantiene l’ultima copia utile in memoria e consente una rilettura', () => {
    service.prepare('checkout', payload, 'Vendita');
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const watched = service.watch('checkout');
    expect(watched().error).toMatch(/conservare/);
    expect(watched().evidence?.raw).toContain('intento');
    read.mockRestore();
    service.refresh();
    expect(watched().error).toBeNull();
    expect(watched().request?.payload).toEqual(payload);
  });

  it('una risposta obsoleta non chiude un intento nuovo', () => {
    service.prepare('checkout', payload, 'Vendita');
    service.complete('checkout', 'intento-di-un-altro-invio');
    expect(service.recover('checkout')).toEqual(payload);
    service.complete('checkout', payload.creationIntentId);
    expect(service.recover('checkout')).toBeNull();
  });

  const intentId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const sessionId = '33333333-3333-4333-8333-333333333333';
  const key = 'vestiflow.cash.pending.v1:tenant:utente:checkout';
  const result = {
    status: 'recorded' as const,
    intentId,
    locationId,
    sessionId,
    documentId: 'documento',
    reference: 'C-1',
    documentDate: '2026-09-06',
    locationName: 'Sede',
    totalMinor: 3656,
  };
  function damaged(version = 1) {
    const raw = JSON.stringify({
      version,
      operation: 'checkout',
      payload: { creationIntentId: intentId, locationId, sessionId, lines: 'danneggiate' },
    });
    sessionStorage.setItem(key, raw);
    return service.watch('checkout')().evidence!;
  }

  it('conferma: conserva byte originali, rilegge la copia e chiude solo la pendenza identificata', () => {
    const evidence = damaged();
    expect(service.watch('returns')().error).toBeNull();
    service.acknowledgeRecorded('checkout', evidence, result);
    expect(sessionStorage.getItem(key)).toBeNull();
    const archive = sessionStorage.getItem(`${key}:recovered:${intentId}`)!;
    expect(JSON.parse(archive)).toEqual({ version: 1, originalRaw: evidence.raw, result });
    expect(() => service.acknowledgeRecorded('checkout', evidence, result)).toThrow();
    expect(sessionStorage.getItem(`${key}:recovered:${intentId}`)).toBe(archive);
  });

  it.each(['versione', 'sede', 'sessione', 'intento', 'utente', 'tenant', 'dati cambiati'])(
    '%s: nessuna chiusura o copia con identità incompatibile',
    (cause) => {
      const evidence = damaged(cause === 'versione' ? 99 : 1);
      const response = { ...result };
      if (cause === 'sede') response.locationId = 'altra';
      if (cause === 'sessione') response.sessionId = 'altra';
      if (cause === 'intento') response.intentId = 'altro';
      if (cause === 'utente') user.set({ id: 'altro', tenantId: 'tenant' });
      if (cause === 'tenant') user.set({ id: 'utente', tenantId: 'altro' });
      if (cause === 'dati cambiati') sessionStorage.setItem(key, evidence.raw + ' ');
      const before = sessionStorage.getItem(key);
      expect(() => service.acknowledgeRecorded('checkout', evidence, response)).toThrow();
      expect(sessionStorage.getItem(key)).toBe(before);
      expect(sessionStorage.length).toBe(1);
    },
  );

  it('archiviazione non disponibile non cancella l’originale né blocca gli invii reso', () => {
    const evidence = damaged();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => service.acknowledgeRecorded('checkout', evidence, result)).toThrow(/conservare/);
    } finally {
      write.mockRestore();
    }
    expect(sessionStorage.getItem(key)).toBe(evidence.raw);
    expect(service.watch('returns')().error).toBeNull();
  });

  it('non sovrascrive una copia diversa, ma riprende se la stessa copia esiste già', () => {
    const evidence = damaged();
    const archiveKey = `${key}:recovered:${intentId}`;
    sessionStorage.setItem(archiveKey, 'copia precedente protetta');
    expect(() => service.acknowledgeRecorded('checkout', evidence, result)).toThrow();
    expect(sessionStorage.getItem(archiveKey)).toBe('copia precedente protetta');
    expect(sessionStorage.getItem(key)).toBe(evidence.raw);
    sessionStorage.setItem(
      archiveKey,
      JSON.stringify({ version: 1, originalRaw: evidence.raw, result }),
    );
    service.refresh();
    service.acknowledgeRecorded('checkout', evidence, result);
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});
