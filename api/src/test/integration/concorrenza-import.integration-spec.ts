import type { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { attendiBloccoCausatoDa } from './concorrenza.util';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * Due import DAVVERO sovrapposti, sul percorso applicativo reale.
 *
 * ⛔ **Stare nella stessa transazione non rende sicura una guardia**: il
 *    database di prova è a Read Committed (letto dal server), e fra il controllo
 *    e la scrittura un'altra transazione può intervenire anche così. Se una
 *    protezione c'è, viene da un vincolo o da un lock — e qui si va a vedere
 *    QUALE, invece di dedurlo dal contenitore in cui stanno le istruzioni.
 *
 * ⭐ **La protezione è il lock di `importProduct` su `(tenant, prodotto
 *    remoto)`, preso PRIMA di leggere** — `DA-FARE` §25, corretto il
 *    09/09/2026. Queste prove sono nate per MISURARE il difetto (doppione senza
 *    storico in `C2`, prodotto sano marcato in errore in `C1`, aggiornamento
 *    perso in `C5`) e sono state riscritte per il comportamento corretto: chi
 *    arriva secondo aspetta sull'advisory lock, rilegge, e AGGIORNA col
 *    proprio payload.
 *
 * ⭐ **Il metro è la consegna in SEQUENZA**: due webhook sovrapposti devono
 *    lasciare lo stesso stato che avrebbero lasciato arrivando uno dopo
 *    l'altro. Niente doppioni, e niente perdite — `skipped` avrebbe evitato i
 *    primi perdendo le seconde (`docs/24` §8.9.4).
 *
 * ⭐ **L'incrocio è imposto, non lasciato al caso**: il primo import si ferma
 *    subito DOPO la propria guardia — dentro la transazione, col lock preso e
 *    la guardia già passata — e riparte solo quando il secondo risulta bloccato
 *    PROPRIO da lui (`pg_blocking_pids`), e su COSA (`pg_stat_activity`). Un
 *    `sleep` renderebbe queste prove verdi o rosse a seconda della macchina.
 *
 * ⚠️ **Strumentazione confinata ai test**: si osserva il collaboratore dello
 *    storico, che il servizio riceve dal costruttore. Nell'applicazione non
 *    esiste nessun gancio.
 *
 * ⛔ **«Entrambe fallite» non dimostra niente**, e nessuna prova qui lo accetta:
 *    si pretende che il primo completi, e si guarda cosa fa il secondo.
 */
describe('Import Shopify — due richieste sovrapposte (§25 corretto, verifica concorrente)', () => {
  let prisma: PrismaClient;
  let shopId: string;

  const GID = 870001;
  const V1 = 970001;
  const V2 = 970002;

  function remoto(id: number, varianti: readonly { readonly id: number; readonly sku: string }[]) {
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
      options: [{ name: 'Taglia', values: varianti.map((_, i) => `T${i}`), position: 1 }],
      variants: varianti.map((v, i) => ({
        id: v.id,
        sku: v.sku,
        title: `T${i}`,
        price: '10.00',
        compare_at_price: null,
        barcode: null,
        inventory_item_id: v.id + 1000,
        option1: `T${i}`,
        option2: null,
        option3: null,
      })),
    };
  }

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
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
    const negozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/9990101' },
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
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  function cancello(): { readonly attesa: Promise<void>; readonly apri: () => void } {
    let apri!: () => void;
    const attesa = new Promise<void>((risolvi) => {
      apri = risolvi;
    });
    return { attesa, apri };
  }

  async function pidDi(tx: Prisma.TransactionClient): Promise<number> {
    const righe = await tx.$queryRawUnsafe<{ pid: number }[]>('SELECT pg_backend_pid() AS pid');
    return righe[0]!.pid;
  }

  /**
   * Un punto in cui un import si ferma DENTRO la propria transazione e dichiara
   * il proprio pid, per ripartire quando la prova lo decide.
   *
   * ⛔ Chi lo usa DEVE chiamare `riprendi()` in un `finally`: una transazione
   *    lasciata ferma coi propri lock avvelena tutto ciò che viene dopo.
   */
  function trattenuta() {
    const passato = cancello();
    const via = cancello();
    let pid: number | null = null;
    const gancio = async (tx: Prisma.TransactionClient): Promise<void> => {
      pid = await pidDi(tx);
      passato.apri();
      await via.attesa;
    };
    return { gancio, passato: passato.attesa, riprendi: via.apri, pid: () => pid };
  }

  /** Gli esiti che il servizio dello storico ha restituito a UN import. */
  interface Esiti {
    readonly guardiaProdotto: string[];
    readonly guardiaVariante: string[];
    readonly registraProdotto: string[];
    varianti: number;
  }

  /**
   * Lo storico VERO, osservato: ogni verdetto viene annotato, e dove la prova lo
   * chiede l'import si ferma subito dopo la guardia.
   */
  function storicoSpia(
    gancio: {
      readonly dopoGuardiaProdotto?: (tx: Prisma.TransactionClient) => Promise<void>;
      readonly dopoGuardiaVariante?: (tx: Prisma.TransactionClient) => Promise<void>;
    } = {},
  ) {
    const reale = new ShopifyLinkHistoryService();
    const esiti: Esiti = {
      guardiaProdotto: [],
      guardiaVariante: [],
      registraProdotto: [],
      varianti: 0,
    };
    const spia = {
      negozioDelTenant: (tx: Prisma.TransactionClient, tenantId: string) =>
        reale.negozioDelTenant(tx, tenantId),
      siPuoCreareProdotto: async (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['siPuoCreareProdotto']>[1],
      ) => {
        const verdetto = await reale.siPuoCreareProdotto(tx, dati);
        esiti.guardiaProdotto.push(verdetto.tipo);
        await gancio.dopoGuardiaProdotto?.(tx);
        return verdetto;
      },
      siPuoCreareVariante: async (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['siPuoCreareVariante']>[1],
      ) => {
        const verdetto = await reale.siPuoCreareVariante(tx, dati);
        esiti.guardiaVariante.push(verdetto.tipo);
        await gancio.dopoGuardiaVariante?.(tx);
        return verdetto;
      },
      registraProdotto: async (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['registraProdotto']>[1],
      ) => {
        const esito = await reale.registraProdotto(tx, dati);
        esiti.registraProdotto.push(esito.tipo);
        return esito;
      },
      registraVariante: async (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['registraVariante']>[1],
      ) => {
        await reale.registraVariante(tx, dati);
        esiti.varianti += 1;
      },
      // ⭐ 26.7 · le guardie sui collegamenti già esistenti. Qui i collegamenti
      //    sono tutti aperti, quindi rispondono sempre «utilizzabile»: la spia
      //    le inoltra al servizio vero perché la prova misuri il comportamento
      //    reale, non uno costruito.
      collegamentoUsabileProdotto: (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['collegamentoUsabileProdotto']>[1],
      ) => reale.collegamentoUsabileProdotto(tx, dati),
      collegamentoUsabileVariante: (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['collegamentoUsabileVariante']>[1],
      ) => reale.collegamentoUsabileVariante(tx, dati),
      sganciaVariante: (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['sganciaVariante']>[1],
      ) => reale.sganciaVariante(tx, dati),
      sganciaProdotto: (
        tx: Prisma.TransactionClient,
        dati: Parameters<ShopifyLinkHistoryService['sganciaProdotto']>[1],
      ) => reale.sganciaProdotto(tx, dati),
    };
    return { spia, esiti };
  }

  /** Il servizio di import vero, con lo storico osservato e Shopify simulato. */
  function creaImport(storico: unknown) {
    return new ShopifyProductPullService(
      prisma as never,
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
      storico as never,
      // §10.3 · il registro VERO: qui nessun import viene rifiutato, ma il
      //    servizio lo riceve come in produzione.
      new PlatformAuditService(prisma as never, prisma as never),
    );
  }

  /** Lo stato delle sessioni indicate, letto da `pg_stat_activity`. */
  async function statoSessioni(pids: readonly number[]): Promise<string[]> {
    const righe = await prisma.$queryRawUnsafe<{ pid: number; state: string }[]>(
      `SELECT pid, state FROM pg_stat_activity WHERE pid = ANY($1::int[]) ORDER BY pid`,
      pids,
    );
    return righe.map((riga) => riga.state);
  }

  /**
   * Su COSA sta aspettando la sessione indicata, da `pg_stat_activity`.
   *
   * ⭐ `Lock/advisory` è il lock di `importProduct`, preso PRIMA di leggere;
   *    `Lock/transactionid` sarebbe la RIGA del prodotto — la protezione di
   *    prima, che arrivava DOPO la lettura e lasciava perdere gli aggiornamenti.
   *    Dire che «T2 è bloccata da T1» non basta: va detto DOVE.
   */
  async function attesaDi(pid: number): Promise<string> {
    const righe = await prisma.$queryRawUnsafe<
      { wait_event_type: string | null; wait_event: string | null }[]
    >(`SELECT wait_event_type, wait_event FROM pg_stat_activity WHERE pid = $1::int`, pid);
    const riga = righe[0];
    return `${riga?.wait_event_type ?? '-'}/${riga?.wait_event ?? '-'}`;
  }

  /**
   * Gli identificativi remoti che compaiono su PIÙ di una riga locale del
   * tenant: il criterio di accettazione chiede che l'elenco sia vuoto.
   *
   * ⚠️ Su TUTTE le righe del tenant, non solo su quelle del prodotto in prova:
   *    un doppione finito su un altro articolo `fotografia()` non lo vedrebbe.
   */
  async function identificativiRemotiDuplicati(): Promise<string[]> {
    const righe = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT shopify_product_id AS id FROM products
        WHERE tenant_id = $1::uuid AND shopify_product_id IS NOT NULL
        GROUP BY shopify_product_id HAVING count(*) > 1
       UNION ALL
       SELECT shopify_variant_id AS id FROM product_variants
        WHERE tenant_id = $1::uuid AND shopify_variant_id IS NOT NULL
        GROUP BY shopify_variant_id HAVING count(*) > 1`,
      IDS.tenantA,
    );
    return righe.map((riga) => riga.id);
  }

  /** Lo stato finale COMPLETO, come lo chiede la verifica. */
  async function fotografia() {
    const prodotti = await prisma.product.findMany({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(GID) },
      // ⚠️ Per identificativo REMOTO, non per SKU: gli SKU cambiano fra le prove
      //    (C2 e C4 li rinominano apposta), gli id remoti no.
      include: { variants: { orderBy: { shopifyVariantId: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      prodotti: prodotti.map((p) => ({
        id: p.id,
        articleCode: p.articleCode,
        shopifyProductId: p.shopifyProductId,
        shopifySyncStatus: p.shopifySyncStatus,
        shopifyLastError: p.shopifyLastError,
        varianti: p.variants.map((v) => ({ sku: v.sku, shopifyVariantId: v.shopifyVariantId })),
      })),
      identitaProdotto: await prisma.shopifyProductIdentity.findMany({
        select: { productId: true, originalProductId: true, shopifyProductGid: true },
      }),
      periodiProdotto: await prisma.shopifyProductLink.count(),
      identitaVariante: await prisma.shopifyVariantIdentity.findMany({
        select: { variantId: true, shopifyVariantGid: true },
        orderBy: { shopifyVariantGid: 'asc' },
      }),
      periodiVariante: await prisma.shopifyVariantLink.count({ where: { status: 'active' } }),
    };
  }

  // ── C1 · stesso prodotto remoto, stesso payload ─────────────────────────

  it(
    'C1 · due import dello STESSO prodotto: il secondo aspetta sul lock PRIMA di leggere, poi AGGIORNA',
    async () => {
      const t1 = trattenuta();
      const s1 = storicoSpia({ dopoGuardiaProdotto: t1.gancio });
      const s2 = storicoSpia();
      const payload = remoto(GID, [
        { id: V1, sku: 'C1-M' },
        { id: V2, sku: 'C1-L' },
      ]);

      const p1 = creaImport(s1.spia).importProductFromWebhook(IDS.tenantA, payload as never);
      p1.catch(() => undefined);
      let p2: Promise<unknown> | undefined;
      try {
        // T1 è dentro la transazione: lock preso, `existing` letto (assente),
        // guardia PASSATA — e ferma lì.
        await t1.passato;
        expect(s1.esiti.guardiaProdotto).toEqual(['si_crea']);
        expect(await statoSessioni([t1.pid()!])).toEqual(['idle in transaction']);

        p2 = creaImport(s2.spia).importProductFromWebhook(IDS.tenantA, payload as never);
        p2.catch(() => undefined);

        // ⭐ **La protezione, identificata e CAUSALE**: T2 è bloccata PROPRIO da
        //    T1, e lo è sull'ADVISORY LOCK di `importProduct` — cioè PRIMA di
        //    aver letto `existing` e prima di qualunque guardia. ⛔ Prima della
        //    correzione qui c'erano DUE sessioni «idle in transaction» con la
        //    guardia passata entrambe: la seconda cadeva poi sull'unicità dello
        //    SKU, e il suo fallimento marcava in errore il prodotto della prima.
        const bloccata = await attendiBloccoCausatoDa(prisma, t1.pid()!);
        expect(bloccata).not.toBe(t1.pid());
        expect(await attesaDi(bloccata)).toBe('Lock/advisory');
        expect(s2.esiti.guardiaProdotto).toEqual([]);

        // ⭐ La prima COMPLETA; la seconda rilegge, trova l'articolo e AGGIORNA.
        t1.riprendi();
        await expect(p1).resolves.toBe('imported');
        await expect(p2).resolves.toBe('updated');
      } finally {
        t1.riprendi();
        await Promise.allSettled([p1, p2 ?? Promise.resolve()]);
      }

      // ── che cosa ha fatto la seconda ──────────────────────────────────────
      // ⛔ Nessuna guardia di creazione: non è passata dal ramo di creazione.
      expect(s2.esiti.guardiaProdotto).toEqual([]);
      // ⛔ Nessuna guardia di variante: le ha trovate entrambe nella mappa
      //    letta DOPO il lock, e le ha aggiornate.
      expect(s2.esiti.guardiaVariante).toEqual([]);
      // ⭐ Lo storico ha risposto «registrato» (idempotente) — non
      //    «gid di un altro», che è la risposta di chi sta creando un doppione.
      expect(s2.esiti.registraProdotto).toEqual(['registrato']);

      // ── lo stato finale, per intero ───────────────────────────────────────
      const stato = await fotografia();
      expect(stato.prodotti).toHaveLength(1);
      expect(stato.prodotti[0]!.varianti.map((v) => v.shopifyVariantId)).toEqual([
        String(V1),
        String(V2),
      ]);
      expect(await identificativiRemotiDuplicati()).toEqual([]);
      expect(stato.identitaProdotto).toHaveLength(1);
      expect(stato.identitaProdotto[0]!.productId).toBe(stato.prodotti[0]!.id);
      expect(stato.periodiProdotto).toBe(1);
      expect(stato.identitaVariante).toHaveLength(2);
      expect(stato.periodiVariante).toBe(2);

      // ⭐ **E il prodotto NON è in errore.** Una corsa normale fra due webhook
      //    non è un errore, e non deve sembrarlo: `recordProductImportError`
      //    non è stato raggiunto perché nessuno dei due è fallito.
      expect(stato.prodotti[0]!.shopifySyncStatus).toBe('synced');
      expect(stato.prodotti[0]!.shopifyLastError).toBeNull();
    },
    60_000,
  );

  // ── C2 · stesso prodotto remoto, il secondo payload porta uno SKU diverso ─

  it(
    'C2 · stesso prodotto, SKU rinominato nel secondo webhook: UN articolo con lo storico, nessun doppione',
    async () => {
      // ⚠️ Era il difetto di §25, e non era di laboratorio: due
      //    `products/update` in volo, uno SKU rinominato su Shopify nel
      //    frattempo. Senza l'unicità dello SKU a fermarla per caso, la seconda
      //    creava un SECONDO articolo con lo stesso id remoto e senza identità.
      //    Ora aspetta, rilegge e aggiorna.
      const t1 = trattenuta();
      const s1 = storicoSpia({ dopoGuardiaProdotto: t1.gancio });
      const s2 = storicoSpia();
      const primo = remoto(GID, [
        { id: V1, sku: 'C2-M' },
        { id: V2, sku: 'C2-L' },
      ]);
      const secondo = remoto(GID, [
        { id: V1, sku: 'C2-M-NUOVO' },
        { id: V2, sku: 'C2-L-NUOVO' },
      ]);

      const p1 = creaImport(s1.spia).importProductFromWebhook(IDS.tenantA, primo as never);
      p1.catch(() => undefined);
      let p2: Promise<unknown> | undefined;
      try {
        await t1.passato;
        expect(s1.esiti.guardiaProdotto).toEqual(['si_crea']);

        p2 = creaImport(s2.spia).importProductFromWebhook(IDS.tenantA, secondo as never);
        p2.catch(() => undefined);
        const bloccata = await attendiBloccoCausatoDa(prisma, t1.pid()!);
        expect(bloccata).not.toBe(t1.pid());
        expect(await attesaDi(bloccata)).toBe('Lock/advisory');
        expect(s2.esiti.guardiaProdotto).toEqual([]);

        t1.riprendi();
        await expect(p1).resolves.toBe('imported');
        await expect(p2).resolves.toBe('updated');
      } finally {
        t1.riprendi();
        await Promise.allSettled([p1, p2 ?? Promise.resolve()]);
      }

      expect(s2.esiti.guardiaProdotto).toEqual([]);
      expect(s2.esiti.registraProdotto).toEqual(['registrato']);

      // ── che cosa è stato COMMITTATO ───────────────────────────────────────
      const stato = await fotografia();
      // ⭐ UN articolo, con lo storico agganciato a lui.
      expect(stato.prodotti).toHaveLength(1);
      expect(stato.prodotti[0]!.varianti.map((v) => v.shopifyVariantId)).toEqual([
        String(V1),
        String(V2),
      ]);
      expect(await identificativiRemotiDuplicati()).toEqual([]);
      expect(stato.identitaProdotto).toHaveLength(1);
      expect(stato.identitaProdotto[0]!.productId).toBe(stato.prodotti[0]!.id);
      expect(stato.periodiProdotto).toBe(1);
      expect(stato.identitaVariante).toHaveLength(2);
      expect(stato.prodotti[0]!.shopifySyncStatus).toBe('synced');
      // ⚠️ Gli SKU restano quelli della PRIMA: il ramo di aggiornamento non
      //    riscrive lo SKU di una variante già abbinata. È lo stesso esito che i
      //    due webhook avrebbero in SEQUENZA — questa prova misura la
      //    concorrenza, non la direzione dello SKU, che `docs/24` §9.2 dichiara
      //    bidirezionale e il ramo di aggiornamento oggi non applica
      //    (registrato in `DA-FARE` come limite a parte).
      expect(stato.prodotti[0]!.varianti.map((v) => v.sku)).toEqual(['C2-M', 'C2-L']);
    },
    60_000,
  );

  // ── C3 · stessa variante nuova, stesso payload ──────────────────────────

  it(
    'C3 · due import che introducono la STESSA variante: il secondo aspetta sul lock, rilegge, e la AGGIORNA',
    async () => {
      // Il prodotto esiste già, con una variante sola.
      await creaImport(new ShopifyLinkHistoryService()).importProductFromWebhook(
        IDS.tenantA,
        remoto(GID, [{ id: V1, sku: 'C3-M' }]) as never,
      );
      const conNuova = remoto(GID, [
        { id: V1, sku: 'C3-M' },
        { id: V2, sku: 'C3-L' },
      ]);

      const t1 = trattenuta();
      const s1 = storicoSpia({ dopoGuardiaVariante: t1.gancio });
      const s2 = storicoSpia();

      const p1 = creaImport(s1.spia).importProductFromWebhook(IDS.tenantA, conNuova as never);
      p1.catch(() => undefined);
      let p2: Promise<unknown> | undefined;
      try {
        // T1 è dentro la transazione: lock preso, prodotto aggiornato, ferma
        // subito dopo la guardia della variante nuova, con verdetto dato.
        await t1.passato;
        expect(s1.esiti.guardiaVariante).toEqual(['si_crea']);

        p2 = creaImport(s2.spia).importProductFromWebhook(IDS.tenantA, conNuova as never);
        p2.catch(() => undefined);

        // ⛔ **La protezione è CAMBIATA, e la differenza si misura.** Prima T2
        //    restava sulla RIGA del prodotto (`Lock/transactionid`), cioè DOPO
        //    aver letto le varianti: la mappa vecchia la mandava nella guardia,
        //    che rispondeva `gia_collegato` — e la variante veniva SALTATA con
        //    tutto ciò che il secondo evento portava (`C5`). Ora resta
        //    sull'advisory lock, PRIMA di leggere.
        const bloccata = await attendiBloccoCausatoDa(prisma, t1.pid()!);
        expect(bloccata).not.toBe(t1.pid());
        expect(await attesaDi(bloccata)).toBe('Lock/advisory');
        // ⚠️ E finché T1 non committa, T2 non ha nemmeno interrogato lo storico.
        expect(s2.esiti.guardiaVariante).toEqual([]);

        t1.riprendi();
        await expect(p1).resolves.toBe('updated');
        await expect(p2).resolves.toBe('updated');
      } finally {
        t1.riprendi();
        await Promise.allSettled([p1, p2 ?? Promise.resolve()]);
      }

      // ⭐ La seconda NON è passata dalla guardia: ha trovato la variante di T1
      //    nella mappa letta dopo il lock e l'ha AGGIORNATA. Nessuna «variante
      //    saltata».
      expect(s2.esiti.guardiaVariante).toEqual([]);

      // ── lo stato finale, per intero ───────────────────────────────────────
      const stato = await fotografia();
      expect(stato.prodotti).toHaveLength(1);
      // ⭐ Una sola variante per ogni id remoto: nessun doppione.
      expect(stato.prodotti[0]!.varianti.map((v) => v.shopifyVariantId)).toEqual([
        String(V1),
        String(V2),
      ]);
      expect(await identificativiRemotiDuplicati()).toEqual([]);
      expect(stato.identitaVariante).toHaveLength(2);
      expect(stato.periodiVariante).toBe(2);
      // ⭐ E la variante nuova ha UNA identità, agganciata alla riga di T1.
      const identitaNuova = await prisma.shopifyVariantIdentity.findFirstOrThrow({
        where: { shopifyVariantGid: `gid://shopify/ProductVariant/${V2}` },
      });
      const rigaNuova = await prisma.productVariant.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, shopifyVariantId: String(V2) },
      });
      expect(identitaNuova.variantId).toBe(rigaNuova.id);
    },
    60_000,
  );

  // ── C4 · C3, ma il secondo payload rinomina lo SKU ──────────────────────

  it(
    'C4 · stessa variante nuova con SKU RINOMINATO nel secondo: nessun doppione — la protezione non è lo SKU',
    async () => {
      // ⭐ Il controllo che manca a C1: se la protezione fosse lo SKU, qui —
      //    con SKU diversi — il doppione nascerebbe. Non nasce, perché a
      //    proteggere è il lock preso prima di leggere.
      await creaImport(new ShopifyLinkHistoryService()).importProductFromWebhook(
        IDS.tenantA,
        remoto(GID, [{ id: V1, sku: 'C4-M' }]) as never,
      );
      const primo = remoto(GID, [
        { id: V1, sku: 'C4-M' },
        { id: V2, sku: 'C4-L' },
      ]);
      const secondo = remoto(GID, [
        { id: V1, sku: 'C4-M' },
        { id: V2, sku: 'C4-L-NUOVO' },
      ]);

      const t1 = trattenuta();
      const s1 = storicoSpia({ dopoGuardiaVariante: t1.gancio });
      const s2 = storicoSpia();

      const p1 = creaImport(s1.spia).importProductFromWebhook(IDS.tenantA, primo as never);
      p1.catch(() => undefined);
      let p2: Promise<unknown> | undefined;
      try {
        await t1.passato;
        p2 = creaImport(s2.spia).importProductFromWebhook(IDS.tenantA, secondo as never);
        p2.catch(() => undefined);
        const bloccata = await attendiBloccoCausatoDa(prisma, t1.pid()!);
        expect(bloccata).not.toBe(t1.pid());
        expect(await attesaDi(bloccata)).toBe('Lock/advisory');

        t1.riprendi();
        await expect(p1).resolves.toBe('updated');
        await expect(p2).resolves.toBe('updated');
      } finally {
        t1.riprendi();
        await Promise.allSettled([p1, p2 ?? Promise.resolve()]);
      }

      expect(s2.esiti.guardiaVariante).toEqual([]);
      const stato = await fotografia();
      expect(stato.prodotti).toHaveLength(1);
      expect(stato.prodotti[0]!.varianti).toHaveLength(2);
      expect(await identificativiRemotiDuplicati()).toEqual([]);
      // ⚠️ Lo SKU rimasto è quello di T1 (in ordine di id remoto: V1 = C4-M,
      //    V2 = C4-L): la seconda ha AGGIORNATO la variante, e l'aggiornamento
      //    non riscrive lo SKU — come in sequenza. Vedi la nota di `C2`.
      expect(stato.prodotti[0]!.varianti.map((v) => v.sku)).toEqual(['C4-M', 'C4-L']);
      expect(stato.identitaVariante).toHaveLength(2);
    },
    60_000,
  );

  // ── C5 · la variante nuova: niente doppioni NON basta, l'aggiornamento non si perde ─

  it(
    'C5 · il secondo evento porta un BARCODE aggiornato sulla variante nuova: non va perso',
    async () => {
      // ⛔ **`C3` e `C4` dimostrano l'assenza di doppioni, non la conservazione
      //    degli aggiornamenti** — rilevato dal proprietario. Prima della
      //    correzione la mappa delle varianti locali veniva costruita PRIMA
      //    dell'attesa: quando il secondo import ripartiva, la guardia scopriva
      //    la variante creata dall'altra richiesta e il codice la SALTAVA — e
      //    con lei saltava il barcode nuovo che quell'evento portava. Riprodotto
      //    il 09/09/2026 (V2 restava `EAN-PRIMA`) PRIMA di correggere. La
      //    specifica lo vieta (`docs/24` §8.9.4): una modifica arrivata durante
      //    l'allineamento non va persa.
      await creaImport(new ShopifyLinkHistoryService()).importProductFromWebhook(
        IDS.tenantA,
        remoto(GID, [{ id: V1, sku: 'C5-M' }]) as never,
      );
      const primo = {
        ...remoto(GID, [
          { id: V1, sku: 'C5-M' },
          { id: V2, sku: 'C5-L' },
        ]),
        title: 'Titolo T1',
      };
      primo.variants[1]!.barcode = 'EAN-PRIMA' as never;
      // ⚠️ Il secondo evento ELABORATO porta una modifica valida: stessa variante,
      //    barcode cambiato, e anche il titolo Shopify del prodotto. (Che sia
      //    anche il più recente in senso cronologico non lo decide questo lock:
      //    l'ordine degli eventi è `docs/24` §8.5.3, non implementato.)
      const secondo = {
        ...remoto(GID, [
          { id: V1, sku: 'C5-M' },
          { id: V2, sku: 'C5-L' },
        ]),
        title: 'Titolo T2',
      };
      secondo.variants[1]!.barcode = 'EAN-DOPO' as never;

      const t1 = trattenuta();
      const s1 = storicoSpia({ dopoGuardiaVariante: t1.gancio });
      const s2 = storicoSpia();

      const p1 = creaImport(s1.spia).importProductFromWebhook(IDS.tenantA, primo as never);
      p1.catch(() => undefined);
      let p2: Promise<unknown> | undefined;
      try {
        await t1.passato;
        p2 = creaImport(s2.spia).importProductFromWebhook(IDS.tenantA, secondo as never);
        p2.catch(() => undefined);
        const bloccata = await attendiBloccoCausatoDa(prisma, t1.pid()!);
        expect(bloccata).not.toBe(t1.pid());
        expect(await attesaDi(bloccata)).toBe('Lock/advisory');
        expect(s2.esiti.guardiaVariante).toEqual([]);

        t1.riprendi();
        await expect(p1).resolves.toBe('updated');
        await expect(p2).resolves.toBe('updated');
      } finally {
        t1.riprendi();
        await Promise.allSettled([p1, p2 ?? Promise.resolve()]);
      }

      // ⭐ La seconda ha trovato la variante di T1 nella mappa fresca: niente
      //    guardia, niente «variante saltata», e il suo payload è arrivato.
      expect(s2.esiti.guardiaVariante).toEqual([]);

      const stato = await fotografia();
      expect(stato.prodotti).toHaveLength(1);
      expect(stato.prodotti[0]!.varianti).toHaveLength(2);
      expect(await identificativiRemotiDuplicati()).toEqual([]);
      // ⭐ Il titolo del prodotto è quello dell'evento PIÙ RECENTE.
      const prodotto = await prisma.product.findFirstOrThrow({
        where: { shopifyProductId: String(GID) },
      });
      expect(prodotto.shopifyTitle).toBe('Titolo T2');
      // ⛔ E il barcode della variante nuova è quello dell'evento elaborato per
      //    ULTIMO: la modifica arrivata durante l'allineamento NON è andata persa.
      const varianteNuova = await prisma.productVariant.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, shopifyVariantId: String(V2) },
      });
      expect(varianteNuova.barcode).toBe('EAN-DOPO');
      // ⭐ Senza doppioni e con lo storico previsto, come prima.
      expect(stato.identitaVariante).toHaveLength(2);
      expect(stato.periodiVariante).toBe(2);
    },
    60_000,
  );
});
