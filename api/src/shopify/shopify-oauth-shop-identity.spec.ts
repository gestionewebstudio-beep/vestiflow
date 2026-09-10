import 'reflect-metadata';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShopifyOAuthService } from './shopify-oauth.service';
import { conflittoDiConcorrenza } from './shopify-shop-identity.service';

/**
 * B1 — il CABLAGGIO dell'identita' del negozio nel callback OAuth.
 *
 * ⭐ **Le regole di identita' si provano sul database** (`identita-negozio-shopify`).
 *    Qui si prova l'altra meta': che identita', credenziale, connessione e
 *    consumo dello stato OAuth stiano nella STESSA transazione, e che un
 *    rifiuto non scriva niente.
 *
 * ⚠️ **Nessuna chiamata reale**: lo scambio del token e' un `fetch` sostituito
 *    localmente, e i due collaboratori dell'identita' sono finti.
 */
describe('OAuth Shopify — identita del negozio (B1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function creaServizio(
    opzioni: {
      readonly identita?: unknown;
      readonly letturaFallisce?: boolean;
      readonly esitoRegistrazione?: unknown;
      readonly credenzialeEsistente?: { readonly shopDomain: string } | null;
      readonly erroreTransazione?: unknown;
      /** Il profilo canale del tenant: `shopify` se non detto altrimenti. */
      readonly profilo?: 'gestionale' | 'shopify';
      /** Il profilo cambia DOPO il controllo iniziale, cioe` dentro la transazione. */
      readonly profiloDentroLaTransazione?: 'gestionale' | 'shopify';
      /** La lettura del profilo fallisce per un motivo TECNICO, non di dominio. */
      readonly letturaProfiloRotta?: unknown;
      /** Idem, ma solo dentro la transazione. */
      readonly letturaProfiloRottaInTransazione?: unknown;
    } = {},
  ) {
    const connessioneUpsert = vi.fn().mockResolvedValue({});
    const credenzialeUpsert = vi.fn().mockResolvedValue({});
    const statoDelete = vi.fn().mockResolvedValue({});
    const profilo = opzioni.profilo ?? 'shopify';
    const tx = {
      shopifyCredential: {
        findUnique: vi.fn().mockResolvedValue(opzioni.credenzialeEsistente ?? null),
        upsert: credenzialeUpsert,
      },
      shopifyConnection: { upsert: connessioneUpsert },
      shopifyOAuthState: { delete: statoDelete },
      // ⭐ Il profilo si rilegge DENTRO la transazione, dopo il lock di riga:
      //    e` il punto in cui un cambio avvenuto durante le chiamate remote
      //    viene intercettato.
      tenant: {
        findUnique: opzioni.letturaProfiloRottaInTransazione
          ? vi.fn().mockRejectedValue(opzioni.letturaProfiloRottaInTransazione)
          : vi.fn().mockResolvedValue({
              channelProfile: opzioni.profiloDentroLaTransazione ?? profilo,
            }),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ channel_profile: profilo }]),
    };
    const prisma = {
      shopifyOAuthState: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'stato-1',
          tenantId: 'tenant-1',
          shopDomain: 'prova.myshopify.com',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
      shopifyCredential: { findUnique: vi.fn().mockResolvedValue(null) },
      // Il controllo di profilo che precede QUALUNQUE chiamata a Shopify.
      tenant: {
        findUnique: opzioni.letturaProfiloRotta
          ? vi.fn().mockRejectedValue(opzioni.letturaProfiloRotta)
          : vi.fn().mockResolvedValue({ channelProfile: profilo }),
      },
      // ⭐ La transazione UNICA di B1. La finta esegue il corpo, altrimenti non
      //    si vedrebbe nulla di quello che ci succede dentro.
      $transaction: vi.fn(async (corpo: (client: typeof tx) => Promise<unknown>) => {
        if (opzioni.erroreTransazione) {
          // Il corpo gira comunque: l'errore arriva al COMMIT, come nella
          // realta`, e cio` che e` stato scritto va annullato.
          await corpo(tx).catch(() => undefined);
          throw opzioni.erroreTransazione;
        }
        return corpo(tx);
      }),
    };

    const shopifyConfig = {
      apiKey: 'chiave',
      apiSecret: 'segreto',
      apiVersion: '2026-07',
      callbackUrl: 'https://app.test/callback',
      frontendUrl: 'https://app.test',
      requestedScopes: ['read_products'],
      webhookUrl: null,
      normalizeShopDomain: (valore: string) => valore,
    };

    const shopifyConnection = {
      recordSetupWarning: vi.fn().mockResolvedValue(undefined),
      clearSetupStatus: vi.fn().mockResolvedValue(undefined),
    };

    const shopifyGraphql = {
      getShopIdentity: opzioni.letturaFallisce
        ? vi.fn().mockRejectedValue(new Error('shop non raggiungibile'))
        : vi.fn().mockResolvedValue(
            opzioni.identita ?? {
              shopGid: 'gid://shopify/Shop/9930001',
              myshopifyDomain: 'prova.myshopify.com',
            },
          ),
    };
    const shopIdentity = {
      registra: vi.fn().mockResolvedValue(
        opzioni.esitoRegistrazione ?? {
          tipo: 'registrata',
          shopId: 'shop-1',
          shopGid: 'gid://shopify/Shop/9930001',
        },
      ),
    };

    const service = new ShopifyOAuthService(
      prisma as never,
      shopifyConfig as never,
      { encrypt: vi.fn().mockReturnValue('cifrato') } as never,
      {
        assertConfigured: vi.fn(),
        getAccessScopes: vi.fn().mockResolvedValue(['read_products']),
        getShop: vi.fn().mockResolvedValue({ name: 'Negozio di prova' }),
      } as never,
      shopifyConnection as never,
      { syncFromShopify: vi.fn().mockResolvedValue({ created: 0, updated: 0 }) } as never,
      shopifyGraphql as never,
      shopIdentity as never,
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'token', scope: 'read_products' }),
      }),
    );

    return {
      service,
      prisma,
      tx,
      shopifyConnection,
      shopifyGraphql,
      shopIdentity,
      connessioneUpsert,
      credenzialeUpsert,
      statoDelete,
    };
  }

  const query = { code: 'c', state: 's', shop: 'prova.myshopify.com' };

  it('identita`, credenziale, connessione e stato OAuth stanno nella STESSA transazione', async () => {
    const { service, prisma, tx, shopIdentity, connessioneUpsert, credenzialeUpsert, statoDelete } =
      creaServizio();

    await service.handleCallback(query);

    // ⭐ Una sola transazione, e tutto dentro: l'identita` la registra il
    //    servizio ricevendo `tx`, non aprendone una propria.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(shopIdentity.registra).toHaveBeenCalledWith(tx, 'tenant-1', {
      shopGid: 'gid://shopify/Shop/9930001',
      myshopifyDomain: 'prova.myshopify.com',
    });
    expect(credenzialeUpsert).toHaveBeenCalled();
    expect(statoDelete).toHaveBeenCalled();

    const argomenti = connessioneUpsert.mock.calls[0]![0] as {
      update: { shopId?: string };
      create: { shopId?: string };
    };
    expect(argomenti.update.shopId).toBe('shop-1');
    expect(argomenti.create.shopId).toBe('shop-1');
  });

  it('⛔ profilo `gestionale`: rifiutato PRIMA di parlare con Shopify', async () => {
    // ⛔ **VestiFlow deve funzionare anche senza Shopify**, e un cliente di solo
    //    gestionale non collega il canale. Il controllo c'era solo in
    //    `beginAuth`: uno stato OAuth pendente sopravviveva al cambio di
    //    profilo, e il collegamento si completava (`DA-FARE` §23).
    const { service, shopifyGraphql, shopIdentity, prisma } = creaServizio({
      profilo: 'gestionale',
    });

    const url = await service.handleCallback(query);

    expect(url).toContain('shopify=channel_not_enabled');
    // ⭐ Nessuna chiamata al canale, e nessuna transazione aperta.
    expect(shopifyGraphql.getShopIdentity).not.toHaveBeenCalled();
    expect(shopIdentity.registra).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('⛔ profilo cambiato DURANTE le chiamate: la transazione lo intercetta', async () => {
    // ⚠️ La guardia iniziale ha gia` detto di si`: fra quella e il salvataggio
    //    ci sono due chiamate remote, e il profilo puo` cambiare li` in mezzo.
    const { service, connessioneUpsert, credenzialeUpsert, statoDelete } = creaServizio({
      profilo: 'shopify',
      profiloDentroLaTransazione: 'gestionale',
    });

    const url = await service.handleCallback(query);

    expect(url).toContain('shopify=channel_not_enabled');
    expect(credenzialeUpsert).not.toHaveBeenCalled();
    expect(connessioneUpsert).not.toHaveBeenCalled();
    expect(statoDelete).not.toHaveBeenCalled();
  });

  describe('⛔ un GUASTO non si traveste da decisione', () => {
    // ⛔ **Rilevato dal proprietario leggendo il codice.** I due `catch` erano
    //    nudi: qualunque errore nella lettura del profilo — connessione persa,
    //    timeout, driver — usciva come «canale non abilitato». Una risposta di
    //    dominio FALSA, che manda a controllare il profilo del cliente mentre il
    //    guasto e' nel database, e che sparisce dai log come un rifiuto normale.
    const guastoTecnico = Object.assign(new Error('connessione al database persa'), {
      code: 'P1001',
    });

    it('lettura del profilo rotta PRIMA delle chiamate: risale con la causa vera', async () => {
      const { service, shopifyGraphql, prisma } = creaServizio({
        letturaProfiloRotta: guastoTecnico,
      });

      await expect(service.handleCallback(query)).rejects.toThrow(/connessione al database persa/);

      // ⭐ E il collegamento non prosegue comunque: nessuna chiamata al canale.
      expect(shopifyGraphql.getShopIdentity).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lettura del profilo rotta DENTRO la transazione: risale, non diventa un rifiuto', async () => {
      const { service, connessioneUpsert, statoDelete } = creaServizio({
        letturaProfiloRottaInTransazione: guastoTecnico,
      });

      await expect(service.handleCallback(query)).rejects.toThrow(/connessione al database persa/);

      expect(connessioneUpsert).not.toHaveBeenCalled();
      expect(statoDelete).not.toHaveBeenCalled();
    });

    it('P2028 NON e` un conflitto fra collegamenti: risale con la causa vera', async () => {
      // ⛔ **Era classificato come conflitto**, e diceva all'operatore «riprova,
      //    un altro collegamento e' in corso». P2028 e' il «transaction API
      //    error» di Prisma: transazione scaduta o chiusa. Non c'e' nessun
      //    altro collegamento, e riprovare non risolve un timeout.
      const { service } = creaServizio({
        erroreTransazione: Object.assign(new Error('Transaction already closed'), {
          code: 'P2028',
        }),
      });

      await expect(service.handleCallback(query)).rejects.toThrow(/Transaction already closed/);
    });

    it('⭐ e i rifiuti VERI continuano a funzionare: profilo e conflitto riconosciuto', async () => {
      // ⛔ Una classificazione piu` stretta non deve spegnere i due esiti utili.
      const rifiuto = creaServizio({ profilo: 'gestionale' });
      await expect(rifiuto.service.handleCallback(query)).resolves.toContain(
        'shopify=channel_not_enabled',
      );

      const conflitto = creaServizio({
        erroreTransazione: Object.assign(new Error('write conflict'), { code: 'P2034' }),
      });
      await expect(conflitto.service.handleCallback(query)).resolves.toContain(
        'shopify=connection_conflict',
      );
    });
  });

  it('⛔ lettura FALLITA: la connessione NON diventa operativa, e nulla viene scritto', async () => {
    // ⛔ **Il buco riprodotto l'08/09/2026.** Con l'identita' non leggibile,
    //    `registra` non veniva chiamata affatto — e con lei spariva il controllo
    //    di appartenenza di §8.5.1.
    const { service, prisma, shopIdentity, connessioneUpsert } = creaServizio({
      letturaFallisce: true,
    });

    const url = await service.handleCallback(query);

    expect(url).toContain('shopify=shop_identity_unavailable');
    expect(shopIdentity.registra).not.toHaveBeenCalled();
    expect(connessioneUpsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('negozio di un ALTRA azienda: rifiutato, e la transazione non scrive', async () => {
    const { service, connessioneUpsert, credenzialeUpsert, statoDelete } = creaServizio({
      esitoRegistrazione: { tipo: 'rivendicato_altrove', shopGid: 'gid://shopify/Shop/9930001' },
    });

    const url = await service.handleCallback(query);

    expect(url).toContain('shopify=shop_owned_elsewhere');
    // ⛔ Il rifiuto avviene DENTRO la transazione, che rotola indietro: nessuna
    //    credenziale, nessuna connessione, e lo stato OAuth non consumato.
    expect(credenzialeUpsert).not.toHaveBeenCalled();
    expect(connessioneUpsert).not.toHaveBeenCalled();
    expect(statoDelete).not.toHaveBeenCalled();
  });

  it('negozio DIVERSO da quello gia` collegato: rifiutato senza riassegnare', async () => {
    const { service, connessioneUpsert } = creaServizio({
      esitoRegistrazione: {
        tipo: 'negozio_diverso',
        shopGid: 'gid://shopify/Shop/9930002',
        shopIdCorrente: 'shop-1',
      },
    });

    const url = await service.handleCallback(query);

    expect(url).toContain('shopify=shop_change_blocked');
    expect(connessioneUpsert).not.toHaveBeenCalled();
  });

  it('GID MALFORMATO: rifiutato come una lettura fallita, e senza scrivere', async () => {
    const { service, connessioneUpsert } = creaServizio({
      esitoRegistrazione: { tipo: 'non_acquisita', motivo: 'identita non riconoscibile' },
    });

    const url = await service.handleCallback(query);

    expect(url).toContain('shopify=shop_identity_unavailable');
    expect(connessioneUpsert).not.toHaveBeenCalled();
  });

  it('credenziale su un ALTRO dominio comparsa nel frattempo: la transazione si ferma', async () => {
    const { service, connessioneUpsert, statoDelete } = creaServizio({
      credenzialeEsistente: { shopDomain: 'altro.myshopify.com' },
    });

    const url = await service.handleCallback(query);

    // ⚠️ Non e` un esito di identita`: il cambio negozio e` gia` rifiutato PRIMA
    //    della transazione, quindi una credenziale su un altro dominio trovata
    //    qui dentro e` comparsa nel frattempo — un secondo collegamento
    //    simultaneo dello stesso tenant. Esito riprovabile, non un 409 crudo.
    expect(url).toContain('shopify=connection_conflict');
    expect(connessioneUpsert).not.toHaveBeenCalled();
    expect(statoDelete).not.toHaveBeenCalled();
  });

  describe('i CONFLITTI di concorrenza, nelle forme misurate', () => {
    // ⛔ **Le forme non sono una sola**, e assumerlo era sbagliato: su 195
    //    coppie concorrenti sul database di prova sono usciti tre codici
    //    distinti, e mai `P2002`.
    const forme = [
      {
        nome: 'P2034 di Prisma',
        errore: Object.assign(new Error('write conflict'), { code: 'P2034' }),
      },
      {
        nome: 'P2010 con 40001 (serialization_failure)',
        errore: Object.assign(new Error('serialize'), {
          code: 'P2010',
          meta: { code: '40001' },
        }),
      },
      {
        nome: 'P2010 con 23505 (unicita` sulla chiave composta)',
        errore: Object.assign(new Error('duplicate'), {
          code: 'P2010',
          meta: { code: '23505' },
        }),
      },
    ];

    for (const forma of forme) {
      it(`${forma.nome}: risposta riprovabile, e nulla resta scritto`, async () => {
        const { service } = creaServizio({ erroreTransazione: forma.errore });

        const url = await service.handleCallback(query);

        expect(url).toContain('shopify=connection_conflict');
      });
    }

    it('un errore ESTRANEO non viene scambiato per un conflitto: risale', async () => {
      // ⛔ Trattare qualunque errore come «riprova» nasconderebbe i guasti veri.
      const { service } = creaServizio({
        erroreTransazione: Object.assign(new Error('colonna inesistente'), { code: 'P2022' }),
      });

      await expect(service.handleCallback(query)).rejects.toThrow(/colonna inesistente/);
    });

    it('il riconoscitore guarda ENTRAMBE le forme, non solo il codice Prisma', () => {
      expect(conflittoDiConcorrenza({ code: 'P2034' })).toBe(true);
      expect(conflittoDiConcorrenza({ code: 'P2010', meta: { code: '40001' } })).toBe(true);
      expect(conflittoDiConcorrenza({ code: 'P2010', meta: { code: '23505' } })).toBe(true);
      expect(conflittoDiConcorrenza({ code: 'P2022' })).toBe(false);
      expect(conflittoDiConcorrenza(new Error('qualunque'))).toBe(false);
      expect(conflittoDiConcorrenza(null)).toBe(false);
    });
  });
});
