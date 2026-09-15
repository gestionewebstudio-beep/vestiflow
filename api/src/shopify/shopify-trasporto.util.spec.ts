import { describe, expect, it } from 'vitest';

import {
  attesaDopoThrottlingSeconds,
  BudgetTrasporto,
  causaDelCorpoFallito,
  causaDellaFetchFallita,
  eccezioneDiTrasporto,
  isRifiutoPerThrottling,
  isStatoTransitorio,
  oltreLaScadenza,
} from './shopify-trasporto.util';

describe('shopify-trasporto.util', () => {
  it('502/503/504 sono transitori; 500, 4xx e 2xx no', () => {
    expect([502, 503, 504].map(isStatoTransitorio)).toEqual([true, true, true]);
    expect([500, 404, 422, 200].map(isStatoTransitorio)).toEqual([false, false, false, false]);
  });

  it('la fetch fallita: AbortError/TimeoutError è il nostro timeout, il resto è rete', () => {
    expect(causaDellaFetchFallita(new DOMException('aborted', 'TimeoutError'))).toBe('timeout');
    expect(causaDellaFetchFallita(new DOMException('aborted', 'AbortError'))).toBe('timeout');
    expect(causaDellaFetchFallita(new TypeError('fetch failed'))).toBe('rete');
    expect(causaDellaFetchFallita('boh')).toBe('rete');
  });

  it('l’eccezione dice la causa, e sulle scritture dichiara l’esito incerto nel testo', () => {
    const lettura = eccezioneDiTrasporto('timeout', false, 'GET /shop.json');
    expect(lettura.causa).toBe('timeout');
    expect(lettura.esitoIncerto).toBe(false);
    expect(lettura.message).not.toMatch(/esito incerto/);

    const scrittura = eccezioneDiTrasporto('server', true, 'POST /products.json, HTTP 502');
    expect(scrittura.esitoIncerto).toBe(true);
    expect(scrittura.message).toMatch(/esito incerto: verifica sul negozio/);
  });

  it('la scadenza complessiva conta il tempo già passato più l’attesa pianificata', () => {
    const inizio = 1_000_000;
    expect(oltreLaScadenza(inizio, 5_000, 60_000, inizio + 50_000)).toBe(false);
    expect(oltreLaScadenza(inizio, 15_000, 60_000, inizio + 50_000)).toBe(true);
    expect(oltreLaScadenza(inizio, 100_000, 60_000, inizio)).toBe(true);
  });

  it('il corpo fallito: JSON rotto è «risposta», il resto segue la fetch (timeout / rete)', () => {
    expect(causaDelCorpoFallito(new SyntaxError('Unexpected end of JSON input'))).toBe('risposta');
    expect(causaDelCorpoFallito(new DOMException('aborted', 'TimeoutError'))).toBe('timeout');
    expect(causaDelCorpoFallito(new TypeError('terminated'))).toBe('rete');
  });

  it('il budget: residuo, attesa oltre la scadenza, segnale limitato al residuo, nessun segnale a tempo finito', () => {
    const inizio = 1_000_000;
    const budget = new BudgetTrasporto(60_000, 15_000, inizio);
    expect(budget.residuoMs(inizio + 10_000)).toBe(50_000);
    expect(budget.oltre(5_000, inizio + 50_000)).toBe(false);
    expect(budget.oltre(15_000, inizio + 50_000)).toBe(true);
    // Residuo più ampio del timeout: segnale presente (dura il timeout).
    expect(budget.segnale(inizio + 10_000)).toBeInstanceOf(AbortSignal);
    // Residuo più corto del timeout: segnale presente (dura il residuo).
    expect(budget.segnale(inizio + 59_000)).toBeInstanceOf(AbortSignal);
    // Tempo finito: nessun segnale, la chiamata non parte.
    expect(budget.segnale(inizio + 60_000)).toBeNull();
    expect(budget.residuoMs(inizio + 70_000)).toBe(0);
  });

  it('rifiuto per throttling: SOLO senza data e con tutti gli errori THROTTLED', () => {
    const throttled = { extensions: { code: 'THROTTLED' } };
    expect(isRifiutoPerThrottling({ errors: [throttled] })).toBe(true);
    expect(isRifiutoPerThrottling({ data: null, errors: [throttled, throttled] })).toBe(true);
    // Parziale: qualcosa è stato eseguito.
    expect(isRifiutoPerThrottling({ data: { x: 1 }, errors: [throttled] })).toBe(false);
    // Altro errore insieme: non è (solo) throttling.
    expect(
      isRifiutoPerThrottling({ errors: [throttled, { extensions: { code: 'ACCESS_DENIED' } }] }),
    ).toBe(false);
    expect(isRifiutoPerThrottling({ errors: [] })).toBe(false);
    expect(isRifiutoPerThrottling({})).toBe(false);
  });

  it('l’attesa dopo il throttling: deficit / restoreRate, almeno 1 s; senza throttleStatus decide il backoff', () => {
    expect(
      attesaDopoThrottlingSeconds({
        requestedQueryCost: 400,
        throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 100, restoreRate: 100 },
      }),
    ).toBe(3);
    expect(
      attesaDopoThrottlingSeconds({
        requestedQueryCost: 50,
        throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 10, restoreRate: 100 },
      }),
    ).toBe(1);
    // Senza il costo richiesto si assume di dover riempire il secchio.
    expect(
      attesaDopoThrottlingSeconds({
        throttleStatus: { maximumAvailable: 1000, currentlyAvailable: 0, restoreRate: 50 },
      }),
    ).toBe(20);
    expect(attesaDopoThrottlingSeconds(null)).toBeNull();
    expect(attesaDopoThrottlingSeconds({ requestedQueryCost: 10 })).toBeNull();
  });
});
