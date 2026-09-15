import { HttpException, InternalServerErrorException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShopifyAdminHttpClient } from './shopify-admin-http.client';
import type { ShopifyConfigService } from './shopify-config.service';
import { ShopifyRateLimiterService } from './shopify-rate-limiter.service';
import { ShopifyTrasportoException } from './shopify-trasporto.util';

/**
 * Il trasporto REST verso l'Admin API: 429 con `Retry-After`, timeout, errori transitori
 * ritentati sulle SOLE letture, scadenza complessiva, negozi indipendenti (`docs/30` #3,
 * blocco del 15/09/2026).
 *
 * ⭐ Limiti letti su shopify.dev il 15/09/2026: 429 + `Retry-After` in secondi
 *    (`admin-rest/usage/rate-limits`), bucket 40, 2/s. La logica di attesa vive nel
 *    limitatore (`shopify-rate-limiter.util.spec.ts`); qui si prova che il client la
 *    consulti e ritenti entro i limiti configurati.
 *
 * Limiti nelle prove: timeout 50 ms (di serie 15 s), 2 ritentativi di lettura, 2 per i 429,
 * scadenza 60 s (o 3 s dove serve provarla).
 */
describe('ShopifyAdminHttpClient — 429, timeout, transitori, scadenza', () => {
  const SHOP = 'shop.myshopify.com';
  const TOKEN = 'shpat_test';
  let client: ShopifyAdminHttpClient;
  let rateLimiter: {
    beforeRestRequest: ReturnType<typeof vi.fn>;
    onCallLimitHeader: ReturnType<typeof vi.fn>;
    waitForRetry: ReturnType<typeof vi.fn>;
  };

  function config(overrides: Record<string, unknown> = {}) {
    return {
      apiVersion: '2026-07',
      apiMaxRetries: 2,
      apiReadRetries: 2,
      apiTimeoutMs: 50,
      apiDeadlineMs: 60_000,
      ...overrides,
    } as unknown as ShopifyConfigService;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    rateLimiter = {
      beforeRestRequest: vi.fn().mockResolvedValue(undefined),
      onCallLimitHeader: vi.fn(),
      waitForRetry: vi.fn().mockResolvedValue(undefined),
    };
    client = new ShopifyAdminHttpClient(
      config(),
      rateLimiter as unknown as ShopifyRateLimiterService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function risposta(status: number, corpo: unknown, headers: Record<string, string> = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      json: async () => corpo,
      text: async () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
    } as unknown as Response;
  }

  function mockFetch(...risposte: Response[]) {
    const fetchMock = vi.fn();
    for (const r of risposte) {
      fetchMock.mockResolvedValueOnce(r);
    }
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
    return fetchMock;
  }

  /** Una `fetch` che non risponde mai, ma rispetta il segnale di interruzione — come undici. */
  function fetchCheNonRisponde() {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
    return fetchMock;
  }

  describe('429', () => {
    it('con Retry-After: attende quanto dice Shopify, riprova, e la risposta buona torna al chiamante', async () => {
      const fetchMock = mockFetch(
        risposta(429, '', { 'retry-after': '2.0', 'x-shopify-shop-api-call-limit': '40/40' }),
        risposta(200, { shop: { id: 1 } }, { 'x-shopify-shop-api-call-limit': '39/40' }),
      );

      await expect(client.request(SHOP, TOKEN, '/shop.json')).resolves.toEqual({
        shop: { id: 1 },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // L'attesa la decide il limitatore, col `Retry-After` letto (2 s) e il numero del tentativo.
      expect(rateLimiter.waitForRetry).toHaveBeenCalledWith(SHOP, 0, 2);
      // Il bucket letto dall'intestazione arriva al limitatore a OGNI risposta.
      expect(rateLimiter.onCallLimitHeader).toHaveBeenCalledWith(SHOP, '40/40');
      expect(rateLimiter.onCallLimitHeader).toHaveBeenCalledWith(SHOP, '39/40');
      // E prima di ogni tentativo si passa dal limitatore.
      expect(rateLimiter.beforeRestRequest).toHaveBeenCalledTimes(2);
    });

    it('senza Retry-After: si ritenta col backoff del limitatore fino a apiMaxRetries; poi 429 al chiamante', async () => {
      const fetchMock = mockFetch(risposta(429, ''), risposta(429, ''), risposta(429, ''));

      await expect(client.request(SHOP, TOKEN, '/shop.json')).rejects.toBeInstanceOf(HttpException);
      // apiMaxRetries = 2: tre richieste in tutto, due attese.
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(rateLimiter.waitForRetry).toHaveBeenNthCalledWith(1, SHOP, 0, null);
      expect(rateLimiter.waitForRetry).toHaveBeenNthCalledWith(2, SHOP, 1, null);
    });

    it('un Retry-After oltre la scadenza complessiva NON si aspetta: 429 subito al chiamante', async () => {
      client = new ShopifyAdminHttpClient(
        config({ apiDeadlineMs: 3_000 }),
        rateLimiter as unknown as ShopifyRateLimiterService,
      );
      const fetchMock = mockFetch(risposta(429, '', { 'retry-after': '100' }));

      await expect(client.request(SHOP, TOKEN, '/shop.json')).rejects.toBeInstanceOf(HttpException);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(rateLimiter.waitForRetry).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('una LETTURA che non risponde viene interrotta al timeout, ritentata apiReadRetries volte, e poi rifiutata come timeout — in un tempo limitato', async () => {
      const fetchMock = fetchCheNonRisponde();
      const partenza = Date.now();

      const errore = await client.request(SHOP, TOKEN, '/shop.json').catch((e: unknown) => e);

      expect(errore).toBeInstanceOf(ShopifyTrasportoException);
      expect((errore as ShopifyTrasportoException).causa).toBe('timeout');
      expect((errore as ShopifyTrasportoException).esitoIncerto).toBe(false);
      // 1 + 2 ritentativi = 3 chiamate da 50 ms ciascuna; le attese sono del limitatore (finto).
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(rateLimiter.waitForRetry).toHaveBeenCalledTimes(2);
      expect(Date.now() - partenza).toBeLessThan(2_000);
      // Ogni chiamata parte col segnale di interruzione.
      for (const [, init] of fetchMock.mock.calls) {
        expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
      }
    });

    it('una SCRITTURA che non risponde viene interrotta al timeout e NON ritentata: esito incerto dichiarato', async () => {
      const fetchMock = fetchCheNonRisponde();

      const errore = await client
        .request(SHOP, TOKEN, '/products.json', { method: 'POST', body: '{}' })
        .catch((e: unknown) => e);

      expect(errore).toBeInstanceOf(ShopifyTrasportoException);
      expect((errore as ShopifyTrasportoException).causa).toBe('timeout');
      expect((errore as ShopifyTrasportoException).esitoIncerto).toBe(true);
      expect((errore as Error).message).toMatch(/esito incerto/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(rateLimiter.waitForRetry).not.toHaveBeenCalled();
    });
  });

  describe('errori transitori (502/503/504, rete)', () => {
    it('un 502 su una lettura si ritenta, e la risposta buona torna al chiamante', async () => {
      const fetchMock = mockFetch(risposta(502, 'Bad Gateway'), risposta(200, { ok: 1 }));

      await expect(client.request(SHOP, TOKEN, '/shop.json')).resolves.toEqual({ ok: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(rateLimiter.waitForRetry).toHaveBeenCalledWith(SHOP, 0, null);
    });

    it('un 503 persistente su una lettura: apiReadRetries ritentativi, poi errore «temporaneo» — non un errore generico', async () => {
      const fetchMock = mockFetch(risposta(503, ''), risposta(503, ''), risposta(503, ''));

      const errore = await client.request(SHOP, TOKEN, '/shop.json').catch((e: unknown) => e);

      expect(errore).toBeInstanceOf(ShopifyTrasportoException);
      expect((errore as ShopifyTrasportoException).causa).toBe('server');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('un 502 su una SCRITTURA non si ritenta: esito incerto', async () => {
      const fetchMock = mockFetch(risposta(502, ''), risposta(200, { ok: 1 }));

      const errore = await client
        .request(SHOP, TOKEN, '/products.json', { method: 'POST', body: '{}' })
        .catch((e: unknown) => e);

      expect((errore as ShopifyTrasportoException).esitoIncerto).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('un errore di rete su una lettura si ritenta; su una scrittura no', async () => {
      const rete = new TypeError('fetch failed');
      vi.spyOn(global, 'fetch')
        .mockRejectedValueOnce(rete)
        .mockResolvedValueOnce(risposta(200, { ok: 1 }))
        .mockRejectedValueOnce(rete);

      await expect(client.request(SHOP, TOKEN, '/shop.json')).resolves.toEqual({ ok: 1 });
      const errore = await client
        .request(SHOP, TOKEN, '/products.json', { method: 'POST' })
        .catch((e: unknown) => e);
      expect((errore as ShopifyTrasportoException).causa).toBe('rete');
      expect((errore as ShopifyTrasportoException).esitoIncerto).toBe(true);
    });

    it('un 4xx è permanente: nessun ritentativo, errore leggibile', async () => {
      const fetchMock = mockFetch(risposta(422, '{"errors":"unprocessable"}'));

      await expect(client.request(SHOP, TOKEN, '/shop.json')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(rateLimiter.waitForRetry).not.toHaveBeenCalled();
    });
  });

  describe('scadenza complessiva: attese del limitatore e intera risposta comprese', () => {
    it('se l’attesa del limitatore porta oltre la scadenza: ZERO chiamate inviate, errore «scadenza», e niente parte dopo', async () => {
      client = new ShopifyAdminHttpClient(
        config({ apiDeadlineMs: 40 }),
        rateLimiter as unknown as ShopifyRateLimiterService,
      );
      // Il limitatore tiene ferma la richiesta (pausa per negozio da un 429 precedente).
      rateLimiter.beforeRestRequest.mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 80)),
      );
      const fetchMock = mockFetch(risposta(200, { ok: 1 }));
      const partenza = Date.now();

      const errore = await client.request(SHOP, TOKEN, '/shop.json').catch((e: unknown) => e);

      expect(errore).toBeInstanceOf(ShopifyTrasportoException);
      expect((errore as ShopifyTrasportoException).causa).toBe('scadenza');
      // ⛔ Il chiamante lo riceve ALLA scadenza (40 ms), non alla fine dell'attesa (80 ms).
      expect(Date.now() - partenza).toBeLessThan(70);
      expect(fetchMock).not.toHaveBeenCalled();
      // Nessuna chiamata tardiva dopo l'errore restituito al chiamante.
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('l’ultimo tentativo ha meno tempo del timeout ordinario: la chiamata è limitata al residuo (dopo l’attesa del limitatore), e il totale resta entro la scadenza', async () => {
      // Timeout ordinario 200 ms, ma alla chiamata restano ~30 ms: il limitatore ne ha
      // consumati 30 su una scadenza di 60.
      client = new ShopifyAdminHttpClient(
        config({ apiTimeoutMs: 200, apiReadRetries: 0, apiDeadlineMs: 60 }),
        rateLimiter as unknown as ShopifyRateLimiterService,
      );
      rateLimiter.beforeRestRequest.mockImplementation(
        () => new Promise<void>((resolve) => setTimeout(resolve, 30)),
      );
      const fetchMock = fetchCheNonRisponde();
      const partenza = Date.now();

      const errore = await client.request(SHOP, TOKEN, '/shop.json').catch((e: unknown) => e);
      const durata = Date.now() - partenza;

      expect(errore).toBeInstanceOf(ShopifyTrasportoException);
      expect((errore as ShopifyTrasportoException).causa).toBe('timeout');
      // Una chiamata sola, interrotta al residuo (~30 ms), non ai 200 del timeout ordinario.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(durata).toBeLessThan(60 + 30);
      // E dopo l'errore non parte più niente.
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('intestazioni ricevute, corpo bloccato o interrotto', () => {
    /** Una risposta 200 il cui corpo non arriva mai (si interrompe solo col segnale). */
    function corpoBloccato(status = 200) {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        const mai = () =>
          new Promise<never>((_resolve, reject) => {
            signal?.addEventListener('abort', () => reject(signal.reason));
          });
        return {
          ok: status < 300,
          status,
          headers: new Headers(),
          json: mai,
          text: mai,
        } as unknown as Response;
      });
      vi.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
      return fetchMock;
    }

    function corpoCheFallisce(errore: Error, status = 200) {
      const fetchMock = vi.fn(async () => ({
        ok: status < 300,
        status,
        headers: new Headers(),
        json: async () => {
          throw errore;
        },
        text: async () => {
          throw errore;
        },
      }));
      vi.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
      return fetchMock;
    }

    it('lettura, corpo bloccato: il timeout interrompe anche la lettura del corpo, si ritenta, poi «timeout»', async () => {
      const fetchMock = corpoBloccato();
      const partenza = Date.now();

      const errore = await client.request(SHOP, TOKEN, '/shop.json').catch((e: unknown) => e);

      expect((errore as ShopifyTrasportoException).causa).toBe('timeout');
      expect((errore as ShopifyTrasportoException).esitoIncerto).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(Date.now() - partenza).toBeLessThan(2_000);
    });

    it('scrittura, corpo bloccato: interrotta al timeout, NESSUN ritentativo, esito incerto (le intestazioni dicono che è arrivata)', async () => {
      const fetchMock = corpoBloccato();

      const errore = await client
        .request(SHOP, TOKEN, '/products.json', { method: 'POST', body: '{}' })
        .catch((e: unknown) => e);

      expect((errore as ShopifyTrasportoException).causa).toBe('timeout');
      expect((errore as ShopifyTrasportoException).esitoIncerto).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('lettura, corpo interrotto dalla rete: si ritenta e poi «rete»; scrittura: esito incerto senza ritentativi', async () => {
      const fetchMock = corpoCheFallisce(new TypeError('terminated'));

      const lettura = await client.request(SHOP, TOKEN, '/shop.json').catch((e: unknown) => e);
      expect((lettura as ShopifyTrasportoException).causa).toBe('rete');
      expect(fetchMock).toHaveBeenCalledTimes(3);

      fetchMock.mockClear();
      const scrittura = await client
        .request(SHOP, TOKEN, '/products.json', { method: 'POST', body: '{}' })
        .catch((e: unknown) => e);
      expect((scrittura as ShopifyTrasportoException).causa).toBe('rete');
      expect((scrittura as ShopifyTrasportoException).esitoIncerto).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('corpo non valido (JSON rotto): «risposta», nessun ritentativo; su una scrittura è comunque un esito incerto', async () => {
      const fetchMock = corpoCheFallisce(new SyntaxError('Unexpected end of JSON input'));

      const lettura = await client.request(SHOP, TOKEN, '/shop.json').catch((e: unknown) => e);
      expect((lettura as ShopifyTrasportoException).causa).toBe('risposta');
      expect((lettura as ShopifyTrasportoException).esitoIncerto).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockClear();
      const scrittura = await client
        .request(SHOP, TOKEN, '/products.json', { method: 'POST', body: '{}' })
        .catch((e: unknown) => e);
      expect((scrittura as ShopifyTrasportoException).causa).toBe('risposta');
      expect((scrittura as ShopifyTrasportoException).esitoIncerto).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('scadenza dentro la pausa del limitatore VERO (orologio controllato)', () => {
    it('errore alla scadenza prima della fine della pausa; zero fetch anche dopo; la pausa del negozio resta per le altre richieste', async () => {
      vi.useFakeTimers();
      const limitatore = new ShopifyRateLimiterService(
        config({
          apiMinIntervalMs: 0,
          apiBucketBurstRatio: 0.25,
          apiBucketHighWatermark: 0.85,
          apiColdStartIntervalMs: 0,
          apiBucketPauseMs: 5_000,
          graphqlMinIntervalMs: 0,
          graphqlCostReservePoints: 100,
        }),
      );
      client = new ShopifyAdminHttpClient(config({ apiDeadlineMs: 1_000 }), limitatore);
      const fetchMock = mockFetch(risposta(200, { ok: 1 }), risposta(200, { ok: 2 }));
      // Il negozio è in pausa per 5 s: il bucket è pieno.
      limitatore.onCallLimitHeader(SHOP, '40/40');

      let esito: unknown = 'in attesa';
      void client.request(SHOP, TOKEN, '/shop.json').then(
        (v) => (esito = v),
        (e: unknown) => (esito = e),
      );
      await vi.advanceTimersByTimeAsync(900);
      expect(esito).toBe('in attesa');
      // 1 · errore alla scadenza (1 s), prima della fine della pausa (5 s).
      await vi.advanceTimersByTimeAsync(100);
      expect(esito).toBeInstanceOf(ShopifyTrasportoException);
      expect((esito as ShopifyTrasportoException).causa).toBe('scadenza');
      expect(fetchMock).not.toHaveBeenCalled();

      // 2 · zero fetch anche facendo avanzare il tempo oltre la pausa.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fetchMock).not.toHaveBeenCalled();

      // 3 · la pausa del negozio è ancora rispettata dalle ALTRE richieste: una nuova
      //    nuova pausa da 5 s, e una nuova richiesta attende tutta la pausa prima di partire.
      limitatore.onCallLimitHeader(SHOP, '40/40'); // pausa: adesso + 5 s
      client = new ShopifyAdminHttpClient(config({ apiDeadlineMs: 60_000 }), limitatore);
      let seconda: unknown = 'in attesa';
      void client.request(SHOP, TOKEN, '/shop.json').then((v) => (seconda = v));
      await vi.advanceTimersByTimeAsync(4_900);
      expect(seconda).toBe('in attesa');
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(seconda).toEqual({ ok: 1 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('un negozio in difficoltà non ferma gli altri', () => {
    it('con il limitatore VERO: il 429 del negozio A lo fa aspettare, il negozio B risponde subito', async () => {
      vi.useFakeTimers();
      const limitatore = new ShopifyRateLimiterService(
        config({
          apiMinIntervalMs: 0,
          apiBucketBurstRatio: 0.25,
          apiBucketHighWatermark: 0.85,
          apiColdStartIntervalMs: 0,
          apiBucketPauseMs: 0,
          graphqlMinIntervalMs: 0,
          graphqlCostReservePoints: 100,
        }),
      );
      client = new ShopifyAdminHttpClient(config(), limitatore);
      let chiamateA = 0;
      const fetchMock = vi.fn(async (url: string) => {
        if (String(url).includes('a.myshopify.com')) {
          chiamateA += 1;
          return chiamateA === 1
            ? risposta(429, '', { 'retry-after': '5' })
            : risposta(200, { negozio: 'A' });
        }
        return risposta(200, { negozio: 'B' });
      });
      vi.spyOn(global, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);

      const a = client.request('a.myshopify.com', TOKEN, '/shop.json');
      const b = client.request('b.myshopify.com', TOKEN, '/shop.json');
      await vi.advanceTimersByTimeAsync(10);

      // B ha già la risposta; A sta aspettando i 5 s del suo Retry-After.
      await expect(b).resolves.toEqual({ negozio: 'B' });
      let statoA = 'in attesa';
      void a.then(() => {
        statoA = 'risposto';
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(statoA).toBe('in attesa');

      await vi.advanceTimersByTimeAsync(5_000);
      await expect(a).resolves.toEqual({ negozio: 'A' });
      expect(statoA).toBe('risposto');
    });
  });
});
