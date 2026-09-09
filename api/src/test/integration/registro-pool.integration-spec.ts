import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * §10.3 · il COSTO del registro sul pool di connessioni — difetto misurato e
 * rimedio provato, 09/09/2026.
 *
 * ⛔ **Il difetto, misurato PRIMA di correggerlo**: la riga del rifiuto si
 *    scrive su una connessione PROPRIA — è ciò che la fa sopravvivere al
 *    rollback dell'import (B6i) — ma quella connessione veniva dallo **stesso
 *    pool** della transazione che la stava chiedendo. Con `connection_limit=5`
 *    cinque import che rifiutavano insieme si esaurivano a vicenda: cinque
 *    transazioni aperte, la sesta connessione mai concessa, **cinque cadute a
 *    10 074 ms e ZERO righe scritte**.
 *
 * ⭐ **Il rimedio in prova**: una connessione RISERVATA al registro
 *    (`connection_limit=1`, stesso database) per le sole scritture autonome.
 *    `P1` pretende ora l'esito corretto — cinque `skipped`, cinque righe,
 *    nessuna ricreazione, **nessun timeout** — e non accetta più
 *    indifferentemente successi e fallimenti. Falsificata rimettendo le
 *    scritture sul pool condiviso: torna rossa, con le cinque cadute a 10 s.
 *
 * ⭐ **Stesso limite, stessi timeout, database sacrificabile.** Il pool è a
 *    CINQUE come in produzione; `pool_timeout` resta il default (10 s) e
 *    `PRODUCT_IMPORT_TX` resta `maxWait 10 s / timeout 30 s`. ⛔ Alzarli per
 *    far passare la prova significherebbe misurare un'altra configurazione.
 *
 * ⭐ **L'incrocio è imposto, non lasciato al caso**: ogni import si ferma
 *    dentro la propria transazione, al punto esatto del rifiuto — con la sua
 *    connessione già presa — e riparte solo quando tutti e cinque ci sono. Un
 *    `sleep` renderebbe la prova verde o rossa a seconda della macchina.
 *
 * ⚠️ **Cinque prodotti DIVERSI**: sullo stesso prodotto l'advisory lock di
 *    `importProduct` (§25) li metterebbe in fila, e non ci sarebbero cinque
 *    transazioni contemporanee da misurare.
 */
describe('Registro dei rifiuti e pool di connessioni (§10.3, limite del condiviso)', () => {
  let prisma: PrismaClient;
  /** Il client con lo STESSO limite del condiviso: è quello dell'applicazione. */
  let pool: PrismaClient;
  /**
   * ⭐ La connessione RISERVATA al registro (§10.3, rimedio del 09/09/2026):
   *    un client SOLO, `connection_limit=1`, stesso database. In produzione lo
   *    fornisce `PlatformAuditModule`; qui si passa esplicitamente, e viene
   *    dalle stesse barriere (host, porta, nome del database).
   */
  let riservato: PrismaClient;
  let storico: ShopifyLinkHistoryService;
  let shopId: string;

  /**
   * ⭐ Le misure si stampano in CODA, non dentro la prova: in questa
   *    configurazione un `console.log` di una prova VERDE non arriva a video —
   *    si vede solo quando la prova cade, cioè quando serve meno.
   */
  const resoconto: string[] = [];

  const LIMITE = 5;
  const NOME_SESSIONE = 'prova_pool_registro';
  const NOME_RISERVATO = 'prova_pool_riservato';
  const GID = [880001, 880002, 880003, 880004, 880005] as const;

  function remoto(id: number) {
    return {
      id,
      title: `Prodotto ${id}`,
      body_html: '<p>x</p>',
      handle: `p-${id}`,
      status: 'active',
      vendor: 'F',
      product_type: 'T',
      tags: '',
      images: [],
      options: [{ name: 'Taglia', values: ['M'], position: 1 }],
      variants: [
        {
          id: id + 100000,
          sku: `SKU-${id}`,
          title: 'M',
          price: '10.00',
          compare_at_price: null,
          barcode: null,
          inventory_item_id: id + 200000,
          option1: 'M',
          option2: null,
          option3: null,
        },
      ],
    };
  }

  /**
   * Il client col pool limitato.
   *
   * ⚠️ Passa dalla **stessa barriera** di `creaClientIntegrazione` (host, porta
   *    e nome del database): l'isolamento non dipende da questa funzione.
   */
  function creaClientPool(limite: number, nome: string): PrismaClient {
    const ambiente = ambienteIntegrazione();
    const url = new URL(ambiente.databaseUrl);
    // `application_name` per riconoscere le SUE sessioni in `pg_stat_activity`.
    url.searchParams.set('options', `-c lock_timeout=30000 -c application_name=${nome}`);
    url.searchParams.set('connection_limit', String(limite));
    return new PrismaClient({ datasources: { db: { url: url.toString() } }, log: ['error'] });
  }

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    pool = creaClientPool(LIMITE, NOME_SESSIONE);
    riservato = creaClientPool(1, NOME_RISERVATO);
    storico = new ShopifyLinkHistoryService();
  });

  afterAll(async () => {
    console.log(resoconto.join('\n'));
    // ⛔ **Ogni client si chiude, anche se una prova è caduta**: una sessione
    //    lasciata aperta blocca la pulizia dei file successivi (§21-bis). Ogni
    //    chiusura è protetta: un errore qui coprirebbe quello vero della prova.
    for (const client of [pool, riservato]) {
      if (client) {
        await client.$disconnect().catch(() => undefined);
      }
    }
    if (prisma) {
      await svuota(prisma).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    // ⚠️ Il registro non ha FK verso `tenants` e sopravvive a `svuota`.
    await prisma.platformAuditLog.deleteMany({});
    const negozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/9970101' },
    });
    shopId = negozio.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: 'prova.myshopify.com',
        shopId,
        scopes: ['read_products'],
      },
    });
    // Cinque articoli eliminati DEFINITIVAMENTE: da qui in poi ogni import di
    // quei GID viene rifiutato, e il rifiuto va registrato.
    for (const gid of GID) {
      await creaImport(prisma, new PlatformAuditService(prisma as never, prisma as never)).importProductFromWebhook(
        IDS.tenantA,
        remoto(gid) as never,
      );
      const prodotto = await prisma.product.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, shopifyProductId: String(gid) },
      });
      await prisma.$transaction(async (tx) => {
        await storico.sganciaProdotto(tx, { tenantId: IDS.tenantA, productId: prodotto.id });
        await tx.inventoryLevel.deleteMany({ where: { variant: { productId: prodotto.id } } });
        await tx.productVariant.deleteMany({ where: { productId: prodotto.id } });
        await tx.product.delete({ where: { id: prodotto.id } });
      });
    }
    await prisma.platformAuditLog.deleteMany({});
  });

  /** Il servizio di import vero, sul client indicato. Shopify simulato. */
  function creaImport(client: PrismaClient, registro: unknown) {
    return new ShopifyProductPullService(
      client as never,
      {
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ shopDomain: 'prova.myshopify.com', accessToken: 'token' }),
      } as never,
      { requestedScopes: ['read_products'] } as never,
      { listAllProducts: vi.fn().mockResolvedValue([]) } as never,
      {
        healStaleErrorStatus: vi.fn(),
        touchSync: vi.fn(),
        recordApiFailure: vi.fn(),
        markSynced: vi.fn(),
        markError: vi.fn(),
      } as never,
      {
        enrichProduct: vi.fn().mockResolvedValue({
          variantPurchasePriceMinor: new Map<number, number>(),
          collections: [],
          metafields: [],
        }),
      } as never,
      storico,
      registro as never,
    );
  }

  /**
   * Un punto d'incontro per N richieste: ognuna dichiara di esserci arrivata e
   * aspetta le altre.
   *
   * ⛔ Con un tetto, e la prova lo LEGGE: se non arrivano tutte, il cancello si
   *    apre lo stesso e l'esito dice quante ne erano arrivate — altrimenti la
   *    prova non fallirebbe, resterebbe appesa.
   */
  function puntoDiIncontro(quante: number, tettoMs: number) {
    let arrivate = 0;
    let apri!: () => void;
    const cancello = new Promise<void>((risolvi) => {
      apri = risolvi;
    });
    let scaduto = false;
    const timer = setTimeout(() => {
      scaduto = true;
      apri();
    }, tettoMs);
    return {
      async arriva(): Promise<void> {
        arrivate += 1;
        if (arrivate >= quante) {
          clearTimeout(timer);
          apri();
        }
        await cancello;
      },
      stato: () => ({ arrivate, scaduto }),
      libera: () => {
        clearTimeout(timer);
        apri();
      },
    };
  }

  /** Le sessioni del client in prova, per stato, lette da un client SEPARATO. */
  async function sessioniDelPool(): Promise<Record<string, number>> {
    const righe = await prisma.$queryRawUnsafe<{ state: string | null; n: bigint }[]>(
      `SELECT state, count(*) AS n FROM pg_stat_activity
        WHERE application_name = $1 AND datname = current_database()
        GROUP BY state`,
      NOME_SESSIONE,
    );
    return Object.fromEntries(righe.map((r) => [r.state ?? 'sconosciuto', Number(r.n)]));
  }

  it(
    'P1 · cinque import che rifiutano insieme, pool a CINQUE: completano TUTTI, e registrano',
    async () => {
      const incontro = puntoDiIncontro(LIMITE, 20_000);
      // ⭐ Il registro VERO con la connessione RISERVATA: è il rimedio in prova.
      //    ⛔ La falsificazione è passare `pool` anche come secondo argomento —
      //    le scritture tornano sul pool condiviso, e questa prova deve cadere.
      const registroVero = new PlatformAuditService(pool as never, riservato as never);
      /** Quante righe il registro ha davvero tentato di scrivere. */
      let tentate = 0;
      /** Quanto è durata OGNI scrittura: si misura, non si dichiara a priori. */
      const attese: number[] = [];
      // Il registro VERO, con un punto d'incontro prima della scrittura: quando
      // riparte, tutte e cinque le transazioni sono aperte e il pool è pieno.
      const registroInAttesa = {
        registraRifiuto: async (dati: unknown, detail: string, correlationId: string) => {
          await incontro.arriva();
          tentate += 1;
          const t0 = Date.now();
          try {
            return await registroVero.registraRifiuto(dati as never, detail, correlationId);
          } finally {
            attese.push(Date.now() - t0);
          }
        },
      };

      const inizio = Date.now();
      const lavori = GID.map(async (gid) => {
        const t0 = Date.now();
        try {
          const esito = await creaImport(pool, registroInAttesa).importProductFromWebhook(
            IDS.tenantA,
            remoto(gid) as never,
          );
          return { gid, stato: 'riuscito' as const, esito, ms: Date.now() - t0, errore: null, motivo: null };
        } catch (errore) {
          // ⚠️ Il messaggio di Prisma è MULTI-RIGA e la prima riga è vuota:
          //    prenderla sola darebbe una stringa vuota, e l'asserzione sul
          //    motivo della caduta passerebbe per il verso sbagliato.
          const messaggio = (errore instanceof Error ? errore.message : String(errore))
            .replace(/\s+/g, ' ')
            .trim();
          return {
            gid,
            stato: 'caduto' as const,
            esito: null,
            ms: Date.now() - t0,
            // ⚠️ INTERO per l'asserzione: la frase che nomina il pool sta in
            //    coda, dopo il frammento di codice che Prisma allega.
            errore: messaggio,
            // La coda, che è la parte che dice il motivo, per la stampa.
            motivo: messaggio.slice(-170),
          };
        }
      });

      // ── la fotografia MENTRE il pool è pieno ────────────────────────────
      //
      // ⚠️ Si prende quando tutte e cinque hanno dichiarato di essere dentro la
      //    propria transazione: non a tempo, ma sull'evento.
      let fotografiaAlPieno: Record<string, number> = {};
      const attesaFotografia = (async () => {
        for (let tentativo = 0; tentativo < 400; tentativo += 1) {
          if (incontro.stato().arrivate >= LIMITE) {
            fotografiaAlPieno = await sessioniDelPool();
            return;
          }
          await new Promise((r) => setTimeout(r, 25));
        }
      })();

      const esiti = await Promise.all(lavori);
      await attesaFotografia;
      const durataTotale = Date.now() - inizio;
      incontro.libera();

      // ── che cosa è successo, misurato ───────────────────────────────────
      const riusciti = esiti.filter((e) => e.stato === 'riuscito');
      const caduti = esiti.filter((e) => e.stato === 'caduto');
      const righe = await prisma.platformAuditLog.findMany({
        where: { tenantId: IDS.tenantA },
        select: { operation: true, outcome: true, remoteGid: true },
      });
      const prodotti = await prisma.product.count({ where: { tenantId: IDS.tenantA } });

      resoconto.push(
        [
          'P1 — pool applicativo a 5, registro su connessione RISERVATA, cinque rifiuti simultanei',
          `  arrivate al punto d'incontro: ${incontro.stato().arrivate}/${LIMITE} (scaduto: ${incontro.stato().scaduto})`,
          `  sessioni del pool applicativo a transazioni aperte: ${JSON.stringify(fotografiaAlPieno)}`,
          `  scritture di registro TENTATE: ${tentate}`,
          `  import riusciti: ${riusciti.length} · caduti: ${caduti.length}`,
          `  esiti: ${JSON.stringify(riusciti.map((r) => r.esito))}`,
          `  durata totale: ${durataTotale} ms · per import: ${esiti.map((e) => e.ms).join(', ')}`,
          `  ATTESE delle scritture del registro (ms, serializzate su UNA connessione): ${attese.join(', ')}`,
          `  righe di registro scritte: ${righe.length}`,
          ...caduti.map((c) => `  caduto ${c.gid} dopo ${c.ms} ms: …${c.motivo}`),
        ].join('\n'),
      );

      // ⭐ 1 · L'incrocio che la prova dichiara è avvenuto davvero: cinque
      //        transazioni aperte insieme, e il pool applicativo è pieno.
      expect(incontro.stato().scaduto).toBe(false);
      expect(incontro.stato().arrivate).toBe(LIMITE);
      expect(Object.values(fotografiaAlPieno).reduce((a, b) => a + b, 0)).toBe(LIMITE);

      // ⭐ 2 · Tutte e cinque hanno TENTATO di scrivere il proprio rifiuto.
      expect(tentate).toBe(LIMITE);

      // ⛔ 3 · **Nessuna caduta, e nessun timeout.** È il criterio che rende
      //        questa prova una prova del rimedio: prima del 09/09 erano cinque
      //        cadute a 10 s con zero righe. Qui si pretende il contrario, e non
      //        si accettano «riusciti o falliti» indifferentemente.
      expect(caduti.map((c) => `${c.gid}: ${c.motivo}`)).toEqual([]);
      expect(riusciti).toHaveLength(LIMITE);
      expect(riusciti.map((r) => r.esito)).toEqual(Array.from({ length: LIMITE }, () => 'skipped'));

      // ⭐ 4 · CINQUE righe di rifiuto, una per import, con i cinque GID.
      expect(righe).toHaveLength(LIMITE);
      expect(righe.every((r) => r.outcome === 'rifiutata')).toBe(true);
      expect(righe.every((r) => r.operation === 'import_prodotto_rifiutato')).toBe(true);
      expect(righe.map((r) => r.remoteGid).sort()).toEqual(
        GID.map((gid) => `gid://shopify/Product/${gid}`).sort(),
      );

      // ⭐ 5 · Nessun articolo ricreato: il divieto B5-B6 vale comunque.
      expect(prodotti).toBe(0);

      // ⭐ 6 · **Entrambi i pool si RILASCIANO**: i due client rispondono ancora,
      //        e non resta nessuna sessione appesa in transazione.
      const dopo = await pool.$queryRawUnsafe<{ uno: number }[]>('SELECT 1 AS uno');
      expect(dopo[0]!.uno).toBe(1);
      const dopoRiservato = await riservato.$queryRawUnsafe<{ uno: number }[]>('SELECT 1 AS uno');
      expect(dopoRiservato[0]!.uno).toBe(1);
      for (let tentativo = 0; tentativo < 40; tentativo += 1) {
        const stato = await sessioniDelPool();
        if (!stato['idle in transaction'] && !stato['active']) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      const finale = await sessioniDelPool();
      expect(finale['idle in transaction'] ?? 0).toBe(0);
      expect(finale['active'] ?? 0).toBe(0);
    },
    120_000,
  );

  it(
    'P2 · controllo: QUATTRO import con lo stesso pool a cinque riescono tutti',
    async () => {
      // ⭐ Senza questo, `P1` sarebbe verde anche se a far cadere gli import
      //    fosse qualcos'altro: qui resta una connessione libera per la riga,
      //    e la stessa meccanica — stesso pool, stessi timeout — completa.
      const quanti = LIMITE - 1;
      const incontro = puntoDiIncontro(quanti, 20_000);
      const registroVero = new PlatformAuditService(pool as never, riservato as never);
      const registroInAttesa = {
        registraRifiuto: async (dati: unknown, detail: string, correlationId: string) => {
          await incontro.arriva();
          return registroVero.registraRifiuto(dati as never, detail, correlationId);
        },
      };

      const esiti = await Promise.all(
        GID.slice(0, quanti).map(async (gid) => {
          try {
            return {
              gid,
              esito: await creaImport(pool, registroInAttesa).importProductFromWebhook(
                IDS.tenantA,
                remoto(gid) as never,
              ),
              errore: null,
            };
          } catch (errore) {
            return {
              gid,
              esito: null,
              errore: (errore instanceof Error ? errore.message : String(errore)).split('\n')[0],
            };
          }
        }),
      );
      incontro.libera();

      const righe = await prisma.platformAuditLog.count({ where: { tenantId: IDS.tenantA } });
      resoconto.push(
        `P2 — pool a 5 con ${quanti} import (una connessione resta libera): ` +
          `esiti ${JSON.stringify(esiti.map((e) => e.esito ?? e.errore))} · righe di registro ${righe}`,
      );

      expect(incontro.stato().scaduto).toBe(false);
      expect(esiti.every((e) => e.esito === 'skipped')).toBe(true);
      expect(righe).toBe(quanti);
    },
    120_000,
  );
});
