import type { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShopifyOAuthService } from '../../shopify/shopify-oauth.service';
import {
  conflittoDiConcorrenza,
  ShopifyShopIdentityService,
} from '../../shopify/shopify-shop-identity.service';
import {
  attendiBloccoCausatoDa,
  trattieniLaProssimaTransazione,
  type TransazioneTrattenuta,
} from './concorrenza.util';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * B1 — l'acquisizione dell'identita' certa del negozio (§8.5.8 fase 2, §8.5.1).
 *
 * ⭐ **Sul database vero**: le regole che contano qui sono unicita' globale,
 *    idempotenza e concorrenza, e nessuna delle tre si prova con un finto
 *    client — direbbe di si' a tutte.
 *
 * ⚠️ **Nessuna chiamata a Shopify**: l'identita' arriva come valore, che e'
 *    esattamente cio' che il client GraphQL restituisce.
 */
describe('Identita del negozio Shopify — acquisizione e registrazione', () => {
  let prisma: PrismaClient;
  let identita: ShopifyShopIdentityService;

  const GID = 'gid://shopify/Shop/9920001';
  const GID_ALTRO = 'gid://shopify/Shop/9920002';

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    identita = new ShopifyShopIdentityService();
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma);
      await prisma.$disconnect();
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
  });

  /** Ripristini da eseguire a fine prova, in ordine inverso. */
  let daRipristinare: Array<() => void> = [];

  afterEach(() => {
    while (daRipristinare.length > 0) {
      daRipristinare.pop()!();
    }
    daRipristinare = [];
    // ⛔ **Lo stub di `fetch` e` GLOBALE, e senza questo sopravvive al file.**
    //    I file di integrazione girano in sequenza nello stesso processo: un
    //    `fetch` finto lasciato acceso raggiunge le prove successive — fra cui
    //    il ripristino da backup, che passa dallo Storage. E` la spiegazione
    //    piu' probabile del fallimento intermittente registrato in
    //    `DA-FARE` §21, e resta un'ipotesi finche' non si riproduce.
    vi.unstubAllGlobals();
  });

  /**
   * `registra` vive ora DENTRO la transazione del chiamante (§22): qui la si
   * avvolge, con lo stesso isolamento che usa il callback.
   */
  async function registraInTransazione(
    tenantId: string,
    valori: { readonly shopGid: string; readonly myshopifyDomain: string | null },
  ) {
    return prisma.$transaction(async (tx) => identita.registra(tx, tenantId, valori), {
      isolationLevel: 'Serializable',
    });
  }

  /** La connessione del tenant, come la scrive OAuth. */
  async function creaConnessione(tenantId: string, shopId?: string): Promise<void> {
    await prisma.shopifyConnection.create({
      data: {
        tenantId,
        status: 'connected',
        shopDomain: 'prova.myshopify.com',
        ...(shopId ? { shopId } : {}),
      },
    });
  }

  // ── 1 · L'identita' viene dal GID ────────────────────────────────────────

  it('1a · registra il negozio dal GID, con il dominio come FOTOGRAFIA', async () => {
    const esito = await registraInTransazione(IDS.tenantA, {
      shopGid: GID,
      myshopifyDomain: 'prova.myshopify.com',
    });

    expect(esito.tipo).toBe('registrata');
    const riga = await prisma.shopifyShop.findUniqueOrThrow({ where: { shopGid: GID } });
    expect(riga.tenantId).toBe(IDS.tenantA);
    expect(riga.myshopifyDomain).toBe('prova.myshopify.com');
    expect(riga.lastSeenAt).not.toBeNull();
  });

  it('1b · un GID di forma sbagliata non entra, e lo dice', async () => {
    for (const sbagliato of ['prova.myshopify.com', 'gid://shopify/Product/1', '12345', '']) {
      const esito = await registraInTransazione(IDS.tenantA, {
        shopGid: sbagliato,
        myshopifyDomain: null,
      });
      expect(esito.tipo).toBe('non_acquisita');
    }
    expect(await prisma.shopifyShop.count()).toBe(0);
  });

  // ── 2 · Riconnessione allo stesso negozio ────────────────────────────────

  it('2a · riconnettersi allo STESSO negozio riusa la riga, senza doppioni', async () => {
    const prima = await registraInTransazione(IDS.tenantA, {
      shopGid: GID,
      myshopifyDomain: 'prova.myshopify.com',
    });
    const rigaPrima = await prisma.shopifyShop.findUniqueOrThrow({ where: { shopGid: GID } });

    const dopo = await registraInTransazione(IDS.tenantA, {
      shopGid: GID,
      myshopifyDomain: 'prova-rinominato.myshopify.com',
    });

    expect(dopo).toEqual(prima);
    expect(await prisma.shopifyShop.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    const rigaDopo = await prisma.shopifyShop.findUniqueOrThrow({ where: { shopGid: GID } });
    // ⭐ `firstSeenAt` non si riscrive: e` quando quel negozio e` comparso.
    expect(rigaDopo.firstSeenAt.toISOString()).toBe(rigaPrima.firstSeenAt.toISOString());
    // ⭐ Il dominio invece si rinfresca: e` una fotografia, non un'identita`.
    expect(rigaDopo.myshopifyDomain).toBe('prova-rinominato.myshopify.com');
  });

  // ── 3 · Appartenenza a un altro tenant, e negozio diverso ────────────────

  it('3a · un negozio gia` di un ALTRO tenant viene rifiutato, senza fondere niente', async () => {
    await registraInTransazione(IDS.tenantB, { shopGid: GID, myshopifyDomain: null });

    const esito = await registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null });

    expect(esito.tipo).toBe('rivendicato_altrove');
    // ⛔ Nessuna riassegnazione: la riga resta dell'altro tenant.
    const riga = await prisma.shopifyShop.findUniqueOrThrow({ where: { shopGid: GID } });
    expect(riga.tenantId).toBe(IDS.tenantB);
    expect(await prisma.shopifyShop.count()).toBe(1);
  });

  it('3b · una connessione che punta gia` a un ALTRO negozio non viene riassegnata', async () => {
    const primo = await registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null });
    if (primo.tipo !== 'registrata') throw new Error('atteso registrata');
    await creaConnessione(IDS.tenantA, primo.shopId);

    const esito = await registraInTransazione(IDS.tenantA, {
      shopGid: GID_ALTRO,
      myshopifyDomain: null,
    });

    expect(esito.tipo).toBe('negozio_diverso');
    // ⛔ Il cambio negozio ha una transazione sua (§8.5.1): qui non si scrive
    //    nemmeno la riga del negozio nuovo, o resterebbe orfana e ambigua.
    expect(await prisma.shopifyShop.count({ where: { shopGid: GID_ALTRO } })).toBe(0);
    const connessione = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    expect(connessione.shopId).toBe(primo.shopId);
  });

  it('3c · la stessa connessione, riconnessa allo STESSO negozio, non e` un cambio', async () => {
    const primo = await registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null });
    if (primo.tipo !== 'registrata') throw new Error('atteso registrata');
    await creaConnessione(IDS.tenantA, primo.shopId);

    const esito = await registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null });

    expect(esito).toEqual(primo);
  });

  // ── 4 · Richieste ripetute e concorrenti ─────────────────────────────────

  it('4a · due registrazioni CONCORRENTI dello stesso negozio non creano doppioni', async () => {
    const [uno, due] = await Promise.all([
      registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null }),
      registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null }),
    ]);

    expect(uno.tipo).toBe('registrata');
    expect(due.tipo).toBe('registrata');
    // ⭐ La stessa riga per entrambe: la seconda non ha inventato un'identita`.
    expect(uno).toEqual(due);
    expect(await prisma.shopifyShop.count({ where: { shopGid: GID } })).toBe(1);
  });

  it('4b · due tenant DIVERSI sullo stesso negozio, in concorrenza: uno solo passa', async () => {
    const esiti = await Promise.allSettled([
      registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null }),
      registraInTransazione(IDS.tenantB, { shopGid: GID, myshopifyDomain: null }),
    ]);

    const registrate = esiti.filter((e) => e.status === 'fulfilled' && e.value.tipo === 'registrata');
    // ⛔ §8.5.1: lo stesso negozio non puo` appartenere a due aziende insieme.
    //    A imporlo e` l'unicita` GLOBALE nel database, non un controllo a monte.
    expect(registrate).toHaveLength(1);
    // ⚠️ L'altra puo` uscire in DUE modi, ed e` misurato: come rifiuto
    //    applicativo (`rivendicato_altrove`) quando arriva a leggere la riga
    //    gia` scritta, o come CONFLITTO riprovabile quando le due si
    //    incrociano prima. Pretendere sempre la prima forma renderebbe la
    //    prova instabile per un motivo che non c'entra col merito.
    const altra = esiti.find((e) => !(e.status === 'fulfilled' && e.value.tipo === 'registrata'))!;
    const respinta =
      altra.status === 'fulfilled'
        ? altra.value.tipo === 'rivendicato_altrove'
        : conflittoDiConcorrenza(altra.reason);
    expect(respinta).toBe(true);
    expect(await prisma.shopifyShop.count({ where: { shopGid: GID } })).toBe(1);
  });

  // ── 5 · Il passaggio graduale ────────────────────────────────────────────

  it('5a · una connessione PREESISTENTE resta valida senza identita`', async () => {
    // ⭐ E` il caso di ogni connessione gia` in essere: `shop_id` nullable, e
    //    nessun vincolo che la rompa. La fase 5 arrivera` dopo il backfill.
    await creaConnessione(IDS.tenantA);

    const connessione = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    expect(connessione.shopId).toBeNull();
    expect(connessione.status).toBe('connected');
  });

  it('5b · registrare l identita` NON collega da se` la connessione', async () => {
    // ⚠️ E` deliberato, ed e` il difetto che ha fatto correggere il disegno:
    //    alla PRIMA connessione la riga non esiste ancora, quindi agganciarla
    //    qui lascerebbe `shop_id` a NULL proprio nel caso piu` comune. Il
    //    collegamento lo scrive OAuth, insieme alla connessione.
    await creaConnessione(IDS.tenantA);

    const esito = await registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null });

    expect(esito.tipo).toBe('registrata');
    const connessione = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    expect(connessione.shopId).toBeNull();
  });

  // ── 6 · L'INTERO callback, sul database vero ─────────────────────────────

  /**
   * Il servizio OAuth completo, con Prisma VERO e le sole risposte Shopify
   * simulate.
   *
   * ⚠️ **Nessuna chiamata reale**: lo scambio del token e' un `fetch`
   *    sostituito, e i due client Shopify sono finti. Tutto il resto — la
   *    transazione, i vincoli, la concorrenza — e' il database.
   */
  function creaOAuth(opzioni: {
    readonly shopGid: string;
    readonly getShopFallisce?: boolean;
  }) {
    const config = {
      apiKey: 'chiave',
      apiSecret: 'segreto',
      apiVersion: '2026-07',
      callbackUrl: 'https://app.test/callback',
      frontendUrl: 'https://app.test',
      requestedScopes: ['read_products'],
      webhookUrl: null,
      normalizeShopDomain: (valore: string) => valore,
    };
    return new ShopifyOAuthService(
      prisma as never,
      config as never,
      { encrypt: () => 'cifrato' } as never,
      {
        assertConfigured: () => undefined,
        getAccessScopes: async () => ['read_products'],
        getShop: async () => {
          if (opzioni.getShopFallisce) {
            throw new Error('shop.json non raggiungibile');
          }
          return { name: 'Negozio di prova' };
        },
      } as never,
      { recordSetupWarning: async () => undefined, clearSetupStatus: async () => undefined } as never,
      { syncFromShopify: async () => ({ created: 0, updated: 0 }) } as never,
      { getShopIdentity: async () => ({ shopGid: opzioni.shopGid, myshopifyDomain: null }) } as never,
      new ShopifyShopIdentityService() as never,
    );
  }

  /** Lo stato OAuth che il callback consuma. */
  async function creaStato(tenantId: string, dominio: string, stato: string): Promise<void> {
    await prisma.shopifyOAuthState.create({
      data: { tenantId, state: stato, shopDomain: dominio, expiresAt: new Date(Date.now() + 60_000) },
    });
  }

  function fingiScambioToken(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'token', scope: 'read_products' }),
      }),
    );
  }

  /**
   * Interpone sulla transazione REALE: lascia correre le scritture e fa cadere
   * l'ultimo enunciato.
   *
   * ⭐ **Il corpo e` quello vero e le scritture toccano il database davvero**:
   *    e` la differenza fra provare il rollback e provare che non si e` scritto.
   */
  function fallisciDopoLeScritture(): { credenziale: boolean; connessione: boolean } {
    const avvenute = { credenziale: false, connessione: false };
    const client = prisma as unknown as {
      $transaction: (...argomenti: unknown[]) => Promise<unknown>;
    };
    const originale = client.$transaction.bind(prisma);
    daRipristinare.push(() => {
      client.$transaction = originale;
    });
    client.$transaction = async (corpo: unknown, opzioni?: unknown) => {
      if (typeof corpo !== 'function') {
        return originale(corpo, opzioni);
      }
      client.$transaction = originale;
      return originale(async (tx: Record<string, unknown>) => {
        const spiato = new Proxy(tx, {
          get(bersaglio, chiave) {
            if (chiave === 'shopifyCredential' || chiave === 'shopifyConnection') {
              const delegato = Reflect.get(bersaglio, chiave) as {
                upsert: (a: unknown) => Promise<unknown>;
              };
              return {
                ...delegato,
                findUnique: (a: unknown) =>
                  (delegato as unknown as { findUnique: (b: unknown) => Promise<unknown> })
                    .findUnique(a),
                upsert: async (argomenti: unknown) => {
                  const esito = await delegato.upsert(argomenti);
                  if (chiave === 'shopifyCredential') avvenute.credenziale = true;
                  else avvenute.connessione = true;
                  return esito;
                },
              };
            }
            if (chiave === 'shopifyOAuthState') {
              // ⛔ L'ULTIMO enunciato della transazione: cade qui, a scritture
              //    gia` avvenute.
              return {
                delete: async () => {
                  throw new Error('caduta dopo le scritture');
                },
              };
            }
            return Reflect.get(bersaglio, chiave);
          },
        });
        return (corpo as (t: unknown) => Promise<unknown>)(spiato);
      }, opzioni);
    };
    return avvenute;
  }

  /**
   * Trattiene la transazione del callback appena prima del commit.
   *
   * ⭐ **L'attrezzo vive in `concorrenza.util`**, non qui: al secondo file
   *    che ne ha bisogno — la prova del cambio profilo di `senza-shopify` —
   *    copiarlo avrebbe significato due versioni della stessa meccanica, e la
   *    seconda sarebbe invecchiata da sola.
   */
  function sospendiDentroLaTransazione(): TransazioneTrattenuta {
    return trattieniLaProssimaTransazione(prisma, daRipristinare);
  }

  /** Identita`, credenziale e connessione: devono parlare dello STESSO negozio. */
  async function coerenza(tenantId: string) {
    const connessione = await prisma.shopifyConnection.findUnique({ where: { tenantId } });
    const credenziale = await prisma.shopifyCredential.findUnique({ where: { tenantId } });
    const negozio = connessione?.shopId
      ? await prisma.shopifyShop.findUnique({ where: { id: connessione.shopId } })
      : null;
    return {
      dominioCredenziale: credenziale?.shopDomain ?? null,
      dominioConnessione: connessione?.shopDomain ?? null,
      gidNegozio: negozio?.shopGid ?? null,
    };
  }

  it('6a · il callback scrive identita`, credenziale e connessione COERENTI', async () => {
    fingiScambioToken();
    await creaStato(IDS.tenantA, 'prova.myshopify.com', 'stato-a');
    const oauth = creaOAuth({ shopGid: GID });

    await oauth.handleCallback({ code: 'c', state: 'stato-a', shop: 'prova.myshopify.com' });

    const stato = await coerenza(IDS.tenantA);
    expect(stato.dominioCredenziale).toBe('prova.myshopify.com');
    expect(stato.dominioConnessione).toBe('prova.myshopify.com');
    expect(stato.gidNegozio).toBe(GID);
    // ⭐ E lo stato OAuth e` stato consumato nella stessa transazione.
    expect(await prisma.shopifyOAuthState.count({ where: { state: 'stato-a' } })).toBe(0);
  });

  it('6b · un errore PRIMA della transazione non scrive nulla', async () => {
    fingiScambioToken();
    await creaStato(IDS.tenantA, 'prova.myshopify.com', 'stato-b');
    // ⭐ `getShop` sta PRIMA della transazione: se cade, non si scrive nulla.
    const oauth = creaOAuth({ shopGid: GID, getShopFallisce: true });

    await expect(
      oauth.handleCallback({ code: 'c', state: 'stato-b', shop: 'prova.myshopify.com' }),
    ).rejects.toThrow(/shop.json/);

    expect(await prisma.shopifyCredential.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await prisma.shopifyConnection.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    // ⚠️ Lo stato OAuth NON e` stato consumato: scade da se`, e il tentativo si
    //    puo` ripetere senza restare bloccati.
    expect(await prisma.shopifyOAuthState.count({ where: { state: 'stato-b' } })).toBe(1);
    // ⭐ **E la riga del negozio NON resta**, che e` la correzione di §22:
    //    l'identita` nasce dentro la stessa transazione della connessione, e un
    //    tentativo fallito non lascia niente. Prima restava, e respingeva un
    //    altro tenant che quel negozio lo possedeva davvero — vedi `6d`.
    expect(await prisma.shopifyShop.count({ where: { shopGid: GID } })).toBe(0);
  });

  it('6b-bis · errore DENTRO la transazione, dopo scritture riuscite: torna tutto indietro', async () => {
    // ⛔ **`6b` da sola non basta**, ed e` il rafforzamento chiesto: li` l'errore
    //    cade PRIMA della transazione, quindi non c'e` niente da annullare. Qui
    //    credenziale e connessione vengono scritte DAVVERO, e a cadere e` cio`
    //    che viene dopo — l'unico modo di vedere se il rollback esiste.
    fingiScambioToken();
    await creaStato(IDS.tenantA, 'prova.myshopify.com', 'stato-bb');
    const scritture = fallisciDopoLeScritture();
    const oauth = creaOAuth({ shopGid: GID });

    await expect(
      oauth.handleCallback({ code: 'c', state: 'stato-bb', shop: 'prova.myshopify.com' }),
    ).rejects.toThrow(/caduta dopo le scritture/);

    // ⭐ Le due scritture sono avvenute per davvero, dentro la transazione…
    expect(scritture.credenziale).toBe(true);
    expect(scritture.connessione).toBe(true);
    // …e sono TUTTE tornate allo stato iniziale.
    expect(await prisma.shopifyCredential.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await prisma.shopifyConnection.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await prisma.shopifyOAuthState.count({ where: { state: 'stato-bb' } })).toBe(1);
  });

  it('6c · due collegamenti CONCORRENTI a negozi diversi: esattamente UNO si completa', async () => {
    // ⛔ **Qui l'incrocio era lasciato al caso**, e l'asserzione era «al piu`
    //    uno riuscito» — che e` verde anche se falliscono ENTRAMBI, cioe`
    //    anche se il collegamento non funziona affatto. Rafforzata l'08/09/2026:
    //    l'incrocio e` forzato, e se ne pretende ESATTAMENTE uno completato.
    fingiScambioToken();
    await creaStato(IDS.tenantA, 'uno.myshopify.com', 'stato-1');
    await creaStato(IDS.tenantA, 'due.myshopify.com', 'stato-2');

    // ⭐ Il primo si ferma DENTRO la propria transazione, a scritture fatte, e
    //    riparte solo quando il secondo risulta bloccato da lui.
    const sospensione = sospendiDentroLaTransazione();

    const primo = creaOAuth({ shopGid: GID }).handleCallback({
      code: 'c',
      state: 'stato-1',
      shop: 'uno.myshopify.com',
    });
    primo.catch(() => undefined);

    // ⛔ **Anche l'attesa del PID puo` non arrivare mai a un pid**, ed e` il
    //    caso indicato dal proprietario: se la prima transazione cade prima di
    //    dichiararsi, qui si finiva appesi. Ora rifiuta — e va comunque
    //    ripreso e atteso tutto, o la prima resta sospesa coi suoi lock.
    let pidPrimo: number;
    try {
      pidPrimo = await sospensione.pidPronto;
    } catch (caduta) {
      sospensione.riprendi();
      await Promise.allSettled([primo]);
      throw caduta;
    }
    const secondo = creaOAuth({ shopGid: GID_ALTRO }).handleCallback({
      code: 'c',
      state: 'stato-2',
      shop: 'due.myshopify.com',
    });
    secondo.catch(() => undefined);

    // ⛔ **`riprendi()` e l'attesa delle due operazioni devono avvenire SEMPRE.**
    //    Riprodotto l'08/09/2026: se `attendiBloccoCausatoDa` va in timeout,
    //    l'eccezione saltava entrambi — e la prima transazione restava sospesa
    //    coi propri lock finche` non scadeva da se`, dentro una suite che nel
    //    frattempo continua. Un attrezzo di prova non puo` lasciare aperta una
    //    transazione proprio mentre si indaga su transazioni lasciate aperte.
    //
    // ⚠️ **E non e' la causa dell'instabilita' di §21-bis**: quella prova non
    //    esisteva ancora quando il difetto e` stato osservato la prima volta.
    let erroreAttesa: unknown;
    try {
      await attendiBloccoCausatoDa(prisma, pidPrimo);
    } catch (caduta) {
      erroreAttesa = caduta;
    }
    sospensione.riprendi();
    const esiti = await Promise.allSettled([primo, secondo]);
    if (erroreAttesa !== undefined) {
      throw erroreAttesa;
    }

    // ── Riuscita e rifiuto sono cose diverse, e si distinguono ──────────────
    const url = esiti.map((e) => (e.status === 'fulfilled' ? e.value : null));
    const completati = url.filter((u) => u?.includes('shopify=connected'));
    // ⚠️ **`connection_conflict` e` un rifiuto RESTITUITO, non un errore
    //    lanciato**, ed e` la forma che l'incrocio produce davvero: la
    //    transazione rotola indietro e il callback risponde «riprova». Fuori da
    //    questo elenco la prova falliva pur essendo corretto il comportamento.
    const rifiutati = url.filter(
      (u) =>
        u !== null &&
        (u.includes('shop_change_blocked') ||
          u.includes('shop_owned_elsewhere') ||
          u.includes('shop_identity_unavailable') ||
          u.includes('connection_conflict')),
    );
    const errori = esiti.filter((e) => e.status === 'rejected');

    // ⛔ ESATTAMENTE uno completato: «entrambi falliti» non e` un esito valido.
    expect(completati).toHaveLength(1);
    expect(rifiutati.length + errori.length).toBe(1);

    // ⭐ E lo stato finale e` quello del vincitore, in tutte e tre le righe.
    const stato = await coerenza(IDS.tenantA);
    expect(stato.dominioCredenziale).toBe(stato.dominioConnessione);
    const atteso = stato.dominioConnessione === 'uno.myshopify.com' ? GID : GID_ALTRO;
    expect(stato.gidNegozio).toBe(atteso);
  });

  it(
    '6c-bis · se la prima transazione CADE prima di dichiararsi, la prova termina',
    async () => {
      // ⛔ **Il caso indicato dal proprietario**: «le prove concorrenti devono
      //    terminare e liberare le risorse anche se falliscono PRIMA di
      //    dichiarare il proprio PID, non soltanto durante l'attesa del
      //    blocco».
      //
      // ⚠️ **Il difetto non e' una prova rossa: e' una prova che non finisce.**
      //    Senza la correzione, `await pidPronto` resta appeso per sempre e il
      //    file muore per timeout portandosi dietro il resto della suite. Il
      //    tempo massimo qui e' basso apposta.
      fingiScambioToken();
      await creaStato(IDS.tenantA, 'uno.myshopify.com', 'stato-caduta');
      const sospensione = sospendiDentroLaTransazione();

      // Identita` malformata: il corpo della transazione lancia PRIMA di
      // arrivare alla riga che dichiara il pid.
      const chiamata = creaOAuth({ shopGid: 'non-un-gid' }).handleCallback({
        code: 'c',
        state: 'stato-caduta',
        shop: 'uno.myshopify.com',
      });
      chiamata.catch(() => undefined);

      await expect(sospensione.pidPronto).rejects.toThrow();
      sospensione.riprendi();

      // ⭐ E il collegamento risponde con un rifiuto comprensibile, senza aver
      //    lasciato niente scritto.
      await expect(chiamata).resolves.toContain('shopify=shop_identity_unavailable');
      expect(await prisma.shopifyShop.count()).toBe(0);
      expect(await prisma.shopifyConnection.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
      // ⛔ Lo stato OAuth NON e` stato consumato: si puo` riprovare.
      expect(await prisma.shopifyOAuthState.count({ where: { state: 'stato-caduta' } })).toBe(1);
    },
    15_000,
  );

  it('6d · dopo un tentativo FALLITO di A, il tenant B completa il collegamento', async () => {
    // ⛔ **Qui c'era la MISURA del difetto §22**, e diceva l'opposto: la riga di
    //    `shopify_shops` restava al tenant A, e il tenant B — che quel negozio
    //    lo possiede davvero — veniva respinto da un tentativo mai andato a
    //    buon fine. Con l'identita` dentro la transazione, il residuo non
    //    esiste piu`, e questa prova lo verifica dal lato che conta.
    fingiScambioToken();
    await creaStato(IDS.tenantA, 'prova.myshopify.com', 'stato-d1');
    await expect(
      creaOAuth({ shopGid: GID, getShopFallisce: true }).handleCallback({
        code: 'c',
        state: 'stato-d1',
        shop: 'prova.myshopify.com',
      }),
    ).rejects.toThrow();

    // ⭐ Il tentativo di A non ha lasciato NIENTE.
    expect(await prisma.shopifyConnection.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await prisma.shopifyCredential.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    expect(await prisma.shopifyShop.count({ where: { shopGid: GID } })).toBe(0);

    // ⭐ E B, correttamente autorizzato, arriva in fondo.
    await creaStato(IDS.tenantB, 'prova.myshopify.com', 'stato-d2');
    const esito = await creaOAuth({ shopGid: GID }).handleCallback({
      code: 'c',
      state: 'stato-d2',
      shop: 'prova.myshopify.com',
    });

    expect(esito).toContain('shopify=connected');
    const stato = await coerenza(IDS.tenantB);
    expect(stato.gidNegozio).toBe(GID);
    expect(stato.dominioCredenziale).toBe('prova.myshopify.com');
    const riga = await prisma.shopifyShop.findUniqueOrThrow({ where: { shopGid: GID } });
    expect(riga.tenantId).toBe(IDS.tenantB);
  });

  it('5c · il negozio registrato NON crea collegamenti di prodotto', async () => {
    // ⛔ B1 acquisisce l'identita` e basta: la doppia scrittura e` B2/B3, e le
    //    tabelle non sono ancora fonte canonica (§8.5.8).
    await registraInTransazione(IDS.tenantA, { shopGid: GID, myshopifyDomain: null });

    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    expect(await prisma.shopifyProductLink.count()).toBe(0);
    expect(await prisma.shopifyLocationPair.count()).toBe(0);
  });
});
