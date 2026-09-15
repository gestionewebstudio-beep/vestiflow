import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { archivioImmaginiFinto } from './archivio-immagini-finto';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';
import { toShopifyUserMessage } from '../../shopify/shopify-user-error.util';

/**
 * CREAZIONE del prodotto su Shopify con esito incerto — `docs/30` §7.2-bis (15/09/2026).
 *
 * ⭐ Il perimetro: nessun doppione di prodotti o varianti dopo una risposta persa, un
 *    riavvio, due richieste concorrenti o un webhook anticipato — con le identità
 *    VestiFlow (`vestiflow.product_id` / `vestiflow.variant_id`), mai SKU o titolo.
 *
 * ⚠️ **Il negozio simulato riproduce il contratto VERIFICATO sul negozio di prova**
 *    (G1–G7 e G9–G11, `shopify-identita-creazione` e `shopify-identita-productset`
 *    `.contract-spec.ts`): identità uniche; `productSet` in sola creazione che crea
 *    prodotto, varianti e identità in una mutation, rifiuta il doppione senza toccare il
 *    creato e non lascia niente di un input con una variante rifiutata; `bulkCreate`
 *    tutto-o-niente nel caso provato. Ciò che il negozio vero non ha confermato, qui non è
 *    presunto (il limite di scala: al massimo 3 varianti provate).
 *
 * ⛔ La prima prova era `it.fails` in `riproduzioni-sincronizzazione` (la misura del
 *    doppione): è diventata ordinaria, e sta qui a guardia.
 */
describe('Creazione su Shopify con identità VestiFlow (PostgreSQL isolato, negozio simulato)', () => {
  const DOMINIO = 'identita.myshopify.com';
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let shopId: string;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
  });

  afterAll(async () => {
    if (prisma) {
      await svuota(prisma).catch(() => undefined);
      await prisma.$disconnect().catch(() => undefined);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    negozio = new NegozioSimulato(DOMINIO, 995000);
    shopId = await collegaNegozio(IDS.tenantA, 'gid://shopify/Shop/995001');
  });

  async function collegaNegozio(tenantId: string, shopGid: string): Promise<string> {
    const riga = await prisma.shopifyShop.create({ data: { tenantId, shopGid } });
    await prisma.shopifyConnection.create({
      data: {
        tenantId,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId: riga.id,
        scopes: ['read_products', 'write_products'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products'],
      },
    });
    return riga.id;
  }

  /** Un'ISTANZA del servizio = un processo: `pushInFlight` è suo, il claim è nel database. */
  function creaPush(): ShopifyProductPushService {
    return new ShopifyProductPushService(
      prisma as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      { markSynced: vi.fn(), markError: vi.fn(), touchSync: vi.fn() } as never,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as never,
      { buildMetafields: vi.fn().mockResolvedValue([]) } as never,
      negozio.graphql() as never,
      storico,
      registro,
    );
  }

  function creaPull(): ShopifyProductPullService {
    return new ShopifyProductPullService(
      prisma as never,
      negozio.oauth() as never,
      { requestedScopes: ['read_products'] } as never,
      negozio.admin() as never,
      {
        healStaleErrorStatus: vi.fn(),
        touchSync: vi.fn(),
        recordApiFailure: vi.fn(),
        markSynced: vi.fn(),
        markError: vi.fn(),
      } as never,
      negozio.enrichment() as never,
      storico,
      registro,
      archivioImmaginiFinto() as never,
    );
  }

  async function articolo(
    tenantId: string = IDS.tenantA,
    codice = 'IDN-1',
  ): Promise<{ readonly id: string; readonly varianti: readonly string[] }> {
    const creato = await prisma.product.create({
      data: {
        tenantId,
        name: `Articolo ${codice}`,
        articleCode: codice,
        shopifySyncEnabled: true,
        options: [{ name: 'Taglia', values: ['M', 'L'] }],
        variants: {
          create: [
            {
              tenantId,
              sku: `${codice}-M`,
              optionValues: [{ name: 'Taglia', value: 'M' }],
              sellingPriceMinor: 2990,
              shopifyPriceMinor: 2990,
            },
            {
              tenantId,
              sku: `${codice}-L`,
              optionValues: [{ name: 'Taglia', value: 'L' }],
              sellingPriceMinor: 2990,
              shopifyPriceMinor: 2990,
            },
          ],
        },
      },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    return { id: creato.id, varianti: creato.variants.map((v) => v.id) };
  }

  function locale(id: string) {
    return prisma.product.findUniqueOrThrow({
      where: { id },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
  }

  /** «Un solo remoto, con le varianti locali tutte collegate per identità»: la misura del blocco. */
  async function nessunDoppione(productId: string, variantiAttese = 2): Promise<void> {
    expect(negozio.contaProdottiConIdentita(productId)).toBe(1);
    const remoto = negozio.prodottoPerIdentita(productId)!;
    const dopo = await locale(productId);
    expect(dopo.shopifyProductId).toBe(String(remoto.id));
    expect(remoto.variants.filter((v) => v.identita)).toHaveLength(variantiAttese);
    for (const variante of dopo.variants) {
      const remota = remoto.variants.find((v) => v.identita === variante.id);
      expect(remota, `variante ${variante.sku} senza remota`).toBeDefined();
      expect(variante.shopifyVariantId).toBe(String(remota!.id));
      expect(variante.shopifyInventoryItemId).toBe(String(remota!.inventory_item_id));
    }
    // ⛔ Il claim di un tentativo concluso è chiuso.
    expect(dopo.shopifyCreateClaimId).toBeNull();
    expect(await prisma.shopifyProductIdentity.count({ where: { productId } })).toBe(1);
    expect(await prisma.product.count({ where: { tenantId: dopo.tenantId } })).toBe(1);
  }

  // ── 1 · la creazione: UNA mutation, nessuna variante iniziale, ordine come locale ──

  it('creazione con productSet: prodotto, varianti e identità in una mutation; nessuna variante in più; ordine locale; nessuna scrittura dopo', async () => {
    const { id, varianti } = await articolo();

    const esito = await creaPush().pushProduct(IDS.tenantA, id);

    expect(esito.pushed).toBe(true);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.chiamate.get('bulkCreateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('bulkUpdateVariants') ?? 0).toBe(0);
    const remoto = negozio.prodottoPerIdentita(id)!;
    // ⭐ Esattamente le due varianti locali, nell'ordine locale di inserimento (M, poi L),
    //    con identità e SKU. (`articolo()` restituisce gli id ordinati per SKU: L, M.)
    expect(remoto.variants.map((v) => [v.title, v.sku, v.identita])).toEqual([
      ['M', 'IDN-1-M', varianti[1]],
      ['L', 'IDN-1-L', varianti[0]],
    ]);
    expect(remoto.variants.every((v) => v.price === '29.90')).toBe(true);
    await nessunDoppione(id);
  });

  // ── 2 · risposta persa DOPO la creazione ──

  it('risposta persa da productSet → il tentativo rilegge per identità e adotta gli id: nessuna seconda creazione, poi il push ordinario riesce', async () => {
    const { id } = await articolo();
    negozio.perdiProssimaRisposta('createProductSet');

    // Primo tentativo: Shopify crea tutto, la risposta non arriva. Il tentativo rilegge
    // l'identità NELLO STESSO giro e adotta gli id: nessun secondo tentativo cieco.
    const primo = await creaPush().pushProduct(IDS.tenantA, id);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.contaProdottiConIdentita(id)).toBe(1);
    expect(primo.pushed).toBe(false);
    expect(primo.outcome).toBe('parziale');
    expect(primo.detail).toContain('Identità Shopify recuperata');
    // Tutte le varianti c'erano già (una mutation): niente «in sospeso».
    expect(primo.detail).not.toContain('completamento in sospeso');
    const dopoPrimo = await locale(id);
    expect(dopoPrimo.shopifyProductId).toBe(String(negozio.prodottoPerIdentita(id)!.id));
    expect(dopoPrimo.shopifySyncStatus).toBe('out_of_sync');
    expect(dopoPrimo.shopifyCreateClaimId).toBeNull();
    expect(dopoPrimo.variants.every((v) => v.shopifyVariantId !== null)).toBe(true);

    // Secondo tentativo (l'operatore ripubblica): il prodotto è collegato, si aggiorna.
    const secondo = await creaPush().pushProduct(IDS.tenantA, id);
    // ⛔ Qui c'erano DUE prodotti remoti per un articolo (`docs/30` #5). Ora uno.
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.prodotti.size).toBe(1);
    expect(secondo.pushed).toBe(true);
    expect((await locale(id)).shopifySyncStatus).toBe('synced');
    await nessunDoppione(id);
  });

  it('risposta persa da productSet con RILETTURA che fallisce → nessuna seconda creazione, errore, claim libero; il tentativo dopo rilegge e adotta', async () => {
    const { id } = await articolo();
    negozio.perdiProssimaRisposta('createProductSet');
    // Cade la rilettura del RECUPERO (la seconda: la prima è quella prima di creare).
    negozio.guastaProssima('productByIdentity', 1, 1);

    const primo = await creaPush().pushProduct(IDS.tenantA, id);
    expect(primo.pushed).toBe(false);
    expect(primo.outcome).toBe('fallito');
    const dopoPrimo = await locale(id);
    // ⛔ «Rilettura fallita» NON è «assente»: nessuna seconda creazione, errore al prodotto.
    expect(dopoPrimo.shopifyProductId).toBeNull();
    expect(dopoPrimo.shopifySyncStatus).toBe('error');
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    // Il tentativo è finito: il claim è libero, non «in corso» per cinque minuti.
    expect(dopoPrimo.shopifyCreateClaimId).toBeNull();

    // Il tentativo dopo rilegge PRIMA di creare, trova il remoto e lo adotta.
    const secondo = await creaPush().pushProduct(IDS.tenantA, id);
    expect(secondo.outcome).toBe('parziale');
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.contaProdottiConIdentita(id)).toBe(1);
  });

  it('rifiuto di productSet (identità già presente, creata da un altro processo un istante prima) → nessun fallback, rilettura e adozione', async () => {
    const { id } = await articolo();
    // Un altro processo crea il prodotto fra la rilettura «assente» e la productSet di
    // questo: la productSet è rifiutata dal negozio (identità unica) e si rilegge.
    const apri = negozio.bloccaProssima('createProductSet');
    const A = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => (negozio.chiamate.get('createProductSet') ?? 0) === 1);
    await prisma.product.update({
      where: { id },
      data: { shopifyCreateClaimedAt: new Date(Date.now() - 6 * 60_000) },
    });
    const B = await creaPush().pushProduct(IDS.tenantA, id);
    expect(B.pushed).toBe(true);
    apri();
    const esitoA = await A;

    expect(esitoA.outcome).toBe('avviato');
    expect(negozio.chiamate.get('createProductSet')).toBe(2);
    expect(negozio.contaProdottiConIdentita(id)).toBe(1);
    await nessunDoppione(id);
  });

  // ── 3 · le modifiche fatte sul negozio nel frattempo si CONSERVANO ──

  it('modifica remota fra la risposta di productSet e l adozione degli id → conservata: la creazione non riscrive niente', async () => {
    const { id } = await articolo();
    // Il negozio risponde alla productSet; qualcuno tocca una variante prima che il push
    // rilegga e adotti gli id: nessuna scrittura successiva la può cancellare o sovrascrivere.
    const apri = negozio.bloccaProssima('listProductVariantsWithIdentity');
    const inCorso = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => negozio.contaProdottiConIdentita(id) === 1);
    const remoto = negozio.prodottoPerIdentita(id)!;
    const m = remoto.variants.find((v) => v.title === 'M')!;
    negozio.modifica(remoto.id, { variante: { id: m.id, price: '12.50', sku: 'MESSO-A-MANO' } });
    apri();
    const esito = await inCorso;

    // ⛔ Qui c'era la RIPRODUZIONE della finestra della prima creazione: la iniziale
    //    modificata veniva RIMOSSA da REMOVE_STANDALONE_VARIANT. Ora non esiste una
    //    iniziale, e la creazione non fa scritture dopo la mutation.
    expect(esito.pushed).toBe(true);
    const dopo = negozio.prodottoPerIdentita(id)!;
    expect(dopo.variants).toHaveLength(2);
    const mDopo = dopo.variants.find((v) => v.id === m.id)!;
    expect(mDopo.price).toBe('12.50');
    expect(mDopo.sku).toBe('MESSO-A-MANO');
    expect(mDopo.identita).toBe(m.identita);
    expect(negozio.chiamate.get('bulkUpdateVariants') ?? 0).toBe(0);
    await nessunDoppione(id);
  });

  it('modifiche remote fatte DOPO una risposta persa restano intatte: il recupero non spinge niente', async () => {
    const { id } = await articolo();
    // Creazione completa sul negozio, risposta persa, rilettura caduta: VestiFlow non ha
    // niente, il negozio ha tutto. Poi qualcuno modifica dal pannello.
    negozio.perdiProssimaRisposta('createProductSet');
    negozio.guastaProssima('productByIdentity', 1, 1);
    expect((await creaPush().pushProduct(IDS.tenantA, id)).outcome).toBe('fallito');
    const remoto = negozio.prodottoPerIdentita(id)!;
    const varianteM = remoto.variants.find((v) => v.title === 'M')!;
    negozio.modifica(remoto.id, {
      title: 'Titolo cambiato in negozio',
      variante: { id: varianteM.id, price: '45.00', barcode: '8001234567890' },
    });
    const fotografia = negozio.prodotto(remoto.id);

    const esito = await creaPush().pushProduct(IDS.tenantA, id);

    expect(esito.outcome).toBe('parziale');
    expect(negozio.prodotto(remoto.id)).toEqual(fotografia);
    await nessunDoppione(id);
  });

  // ── 4 · riavvio ────────────────────────────────────────────────────────────

  it('riavvio: claim persistito di un processo MORTO (lease scaduta) → il nuovo processo rilegge e adotta', async () => {
    const { id } = await articolo();
    // Un processo ha creato il prodotto ed è morto prima di salvare: il negozio lo ha,
    // il claim è aperto nel database, `pushInFlight` del nuovo processo è vuoto.
    negozio.perdiProssimaRisposta('createProductSet');
    negozio.guastaProssima('productByIdentity', 1, 1); // il recupero del primo non arriva a leggere
    await creaPush().pushProduct(IDS.tenantA, id);
    const morto = await prisma.product.update({
      where: { id },
      data: {
        shopifyCreateClaimId: '11111111-1111-4111-8111-111111111111',
        shopifyCreateClaimShopId: shopId,
        shopifyCreateClaimedAt: new Date(Date.now() - 6 * 60_000),
        shopifySyncStatus: 'syncing',
      },
    });
    expect(morto.shopifyProductId).toBeNull();
    expect(negozio.contaProdottiConIdentita(id)).toBe(1);

    const esito = await creaPush().pushProduct(IDS.tenantA, id);

    expect(esito.outcome).toBe('parziale');
    expect(esito.detail).toContain('Identità Shopify recuperata');
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    const dopo = await locale(id);
    expect(dopo.shopifyProductId).toBe(String(negozio.prodottoPerIdentita(id)!.id));
    expect(dopo.shopifyCreateClaimVersion).toBe(morto.shopifyCreateClaimVersion + 1);
    expect(dopo.shopifyCreateClaimId).toBeNull();
  });

  it('riavvio: claim persistito ANCORA VIVO (lease non scaduta) → il nuovo processo non chiama Shopify e risponde «avviato»', async () => {
    const { id } = await articolo();
    await prisma.product.update({
      where: { id },
      data: {
        shopifyCreateClaimId: '22222222-2222-4222-8222-222222222222',
        shopifyCreateClaimShopId: shopId,
        shopifyCreateClaimedAt: new Date(),
        shopifyCreateClaimVersion: 3,
      },
    });

    const esito = await creaPush().pushProduct(IDS.tenantA, id);

    expect(esito.outcome).toBe('avviato');
    // ⛔ Nessuna chiamata remota: né definizioni, né rilettura, né creazione.
    expect(negozio.totaleChiamate()).toBe(0);
    const dopo = await locale(id);
    expect(dopo.shopifyCreateClaimId).toBe('22222222-2222-4222-8222-222222222222');
    expect(dopo.shopifyCreateClaimVersion).toBe(3);
    expect(dopo.shopifyProductId).toBeNull();
  });

  // ── 5 · concorrenza ────────────────────────────────────────────────────────

  it('due push CONCORRENTI (due processi) con remoto assente → una sola productCreate, l altro non chiama Shopify', async () => {
    const { id } = await articolo();
    const apri = negozio.bloccaProssima('createProductSet');
    const A = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => (negozio.chiamate.get('createProductSet') ?? 0) === 1);
    const chiamatePrimaDiB = negozio.totaleChiamate();

    const B = await creaPush().pushProduct(IDS.tenantA, id);

    // B non ottiene il claim: «avviato», e zero chiamate sue.
    expect(B.outcome).toBe('avviato');
    expect(negozio.totaleChiamate()).toBe(chiamatePrimaDiB);
    apri();
    const esitoA = await A;
    expect(esitoA.pushed).toBe(true);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    await nessunDoppione(id);
  });

  it('due push concorrenti nello STESSO processo → il secondo è «già in corso» senza chiamate', async () => {
    const { id } = await articolo();
    const push = creaPush();
    const apri = negozio.bloccaProssima('createProductSet');
    const A = push.pushProduct(IDS.tenantA, id);
    await attendi(() => (negozio.chiamate.get('createProductSet') ?? 0) === 1);
    const prima = negozio.totaleChiamate();
    const B = await push.pushProduct(IDS.tenantA, id);
    expect(B.outcome).toBe('avviato');
    expect(negozio.totaleChiamate()).toBe(prima);
    apri();
    expect((await A).pushed).toBe(true);
    await nessunDoppione(id);
  });

  it('il VECCHIO proprietario del claim che riprende dopo essere stato superato non fa altre chiamate e non scrive', async () => {
    const { id } = await articolo();
    // A è in volo sulla productCreate; la sua lease scade; B rivendica e completa.
    const apri = negozio.bloccaProssima('createProductSet');
    const A = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => (negozio.chiamate.get('createProductSet') ?? 0) === 1);
    await prisma.product.update({
      where: { id },
      data: { shopifyCreateClaimedAt: new Date(Date.now() - 6 * 60_000) },
    });
    const B = await creaPush().pushProduct(IDS.tenantA, id);
    expect(B.pushed).toBe(true);
    const dopoB = await locale(id);
    const chiamateDopoB = negozio.totaleChiamate();

    // A riprende: la sua productCreate arriva al negozio DOPO quella di B e viene
    // rifiutata (identità unica, G3). A non rilegge, non crea, non scrive.
    apri();
    const esitoA = await A;

    expect(esitoA.outcome).toBe('avviato'); // «qualcun altro lo sta portando avanti»
    expect(negozio.totaleChiamate()).toBe(chiamateDopoB);
    expect(negozio.contaProdottiConIdentita(id)).toBe(1);
    const finale = await locale(id);
    expect(finale.shopifyProductId).toBe(dopoB.shopifyProductId);
    expect(finale.shopifySyncStatus).toBe(dopoB.shopifySyncStatus);
    expect(finale.shopifyLastError).toBe(dopoB.shopifyLastError);
    expect(finale.shopifyCreateClaimVersion).toBe(dopoB.shopifyCreateClaimVersion);
    await nessunDoppione(id);
  });

  // ── 6 · webhook anticipato ────────────────────────────────────────────────

  it('webhook products/create ARRIVATO PRIMA del salvataggio del push → adotta, nessun doppione locale, il push conclude', async () => {
    const { id } = await articolo();
    const apri = negozio.bloccaProssima('listProductVariantsWithIdentity');
    const push = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => negozio.contaProdottiConIdentita(id) === 1);
    const remoto = negozio.prodottoPerIdentita(id)!;

    // Il webhook della creazione arriva ora: il push non ha ancora scritto niente.
    const esitoWebhook = await creaPull().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remoto.id),
    );

    // Adottato: gli id sono scritti; poi, prodotto `syncing`, l'aggiornamento è saltato.
    expect(esitoWebhook).toBe('skipped');
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    const durante = await locale(id);
    expect(durante.shopifyProductId).toBe(String(remoto.id));
    // ⭐ L'adozione chiude il claim (creazione conclusa, 15/09 notte): prima restava «del
    //    push», e se il push moriva qui il prodotto collegato lo teneva aperto per sempre.
    //    Il push vivo ricontrolla la sola versione, quindi conclude lo stesso (sotto).
    expect(durante.shopifyCreateClaimId).toBeNull();
    expect(durante.shopifyCreateClaimVersion).toBe(1);

    apri();
    const esitoPush = await push;
    expect(esitoPush.pushed).toBe(true);
    await nessunDoppione(id);
  });

  it('webhook per un remoto con la nostra identità ma SENZA claim aperto → non importa, non adotta, registra', async () => {
    const { id } = await articolo();
    negozio.perdiProssimaRisposta('createProductSet');
    negozio.guastaProssima('productByIdentity', 1, 1);
    await creaPush().pushProduct(IDS.tenantA, id); // remoto creato, tentativo finito male, claim chiuso
    const remoto = negozio.prodottoPerIdentita(id)!;

    const esito = await creaPull().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remoto.id),
    );

    expect(esito).toBe('skipped');
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect((await locale(id)).shopifyProductId).toBeNull();
    const rifiuti = await prisma.platformAuditLog.findMany({
      // Per questo articolo: il registro non viene svuotato fra le prove, ed è voluto.
      where: { tenantId: IDS.tenantA, operation: 'import_prodotto_rifiutato', entityId: id },
    });
    expect(rifiuti).toHaveLength(1);
    expect(rifiuti[0]!.detail).toContain('identita_vestiflow_senza_claim');
  });

  it('webhook con la nostra identità in un ALTRO tenant → non adotta: per quel tenant è un prodotto estraneo', async () => {
    const { id } = await articolo();
    await creaPush().pushProduct(IDS.tenantA, id);
    const remoto = negozio.prodottoPerIdentita(id)!;
    await collegaNegozio(IDS.tenantB, 'gid://shopify/Shop/995002');

    const esito = await creaPull().importProductFromWebhook(
      IDS.tenantB,
      negozio.webhook(remoto.id),
    );

    // Per il tenant B quel uuid non è un suo prodotto: import normale, come per ogni remoto.
    expect(esito).toBe('imported');
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantB } })).toBe(1);
    const diA = await locale(id);
    expect(diA.shopifyProductId).toBe(String(remoto.id));
  });

  it('webhook con claim aperto verso un ALTRO negozio → non adotta', async () => {
    const { id } = await articolo();
    negozio.perdiProssimaRisposta('createProductSet');
    negozio.guastaProssima('productByIdentity', 1, 1);
    await creaPush().pushProduct(IDS.tenantA, id);
    const altroNegozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/995009' },
    });
    await prisma.product.update({
      where: { id },
      data: {
        shopifyCreateClaimId: '33333333-3333-4333-8333-333333333333',
        shopifyCreateClaimShopId: altroNegozio.id,
        shopifyCreateClaimedAt: new Date(),
      },
    });
    const remoto = negozio.prodottoPerIdentita(id)!;

    const esito = await creaPull().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remoto.id),
    );

    expect(esito).toBe('skipped');
    expect((await locale(id)).shopifyProductId).toBeNull();
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
  });

  it('webhook con RILETTURA dell identità che fallisce → l import fallisce (Shopify lo ripete), nessun doppione', async () => {
    const { id } = await articolo();
    const apri = negozio.bloccaProssima('listProductVariantsWithIdentity');
    const push = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => negozio.contaProdottiConIdentita(id) === 1);
    const remoto = negozio.prodottoPerIdentita(id)!;
    negozio.guastaProssima('identitaVestiflowDelProdotto');

    await expect(
      creaPull().importProductFromWebhook(IDS.tenantA, negozio.webhook(remoto.id)),
    ).rejects.toThrow(/guasto iniettato/);

    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    apri();
    expect((await push).pushed).toBe(true);
    await nessunDoppione(id);
  });

  // ── 8 · isolamento ────────────────────────────────────────────────────────

  it('tenant e negozio: il claim porta il negozio di destinazione, e un altro tenant non vede il claim', async () => {
    const { id: diA } = await articolo(IDS.tenantA, 'IDN-A');
    await collegaNegozio(IDS.tenantB, 'gid://shopify/Shop/995002');
    const { id: diB } = await articolo(IDS.tenantB, 'IDN-B');
    const apri = negozio.bloccaProssima('createProductSet');
    const A = creaPush().pushProduct(IDS.tenantA, diA);
    await attendi(() => (negozio.chiamate.get('createProductSet') ?? 0) === 1);
    const claimDiA = await locale(diA);
    expect(claimDiA.shopifyCreateClaimId).not.toBeNull();
    expect(claimDiA.shopifyCreateClaimShopId).toBe(shopId);

    // B pubblica il SUO articolo mentre A è in volo: nessuna interferenza.
    const B = await creaPush().pushProduct(IDS.tenantB, diB);
    expect(B.pushed).toBe(true);
    apri();
    expect((await A).pushed).toBe(true);

    expect(negozio.contaProdottiConIdentita(diA)).toBe(1);
    expect(negozio.contaProdottiConIdentita(diB)).toBe(1);
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantB } })).toBe(1);
    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect(await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantB } })).toBe(1);
  });

  // ── 9 · le definizioni ────────────────────────────────────────────────────

  it('definizioni: assenti si creano una volta sola; presenti col tipo SBAGLIATO → nessuna creazione', async () => {
    const { id } = await articolo();
    expect(negozio.definizioni.size).toBe(0);
    await creaPush().pushProduct(IDS.tenantA, id);
    expect(negozio.definizioni.size).toBe(2);
    expect([...negozio.definizioni.values()].every((d) => d.typeName === 'id')).toBe(true);
    expect(negozio.chiamate.get('creaDefinizioneMetafield')).toBe(2);

    const { id: secondo } = await articolo(IDS.tenantA, 'IDN-2');
    await creaPush().pushProduct(IDS.tenantA, secondo);
    // Già presenti: si rileggono, non si ricreano.
    expect(negozio.chiamate.get('creaDefinizioneMetafield')).toBe(2);

    // Un negozio in cui `vestiflow.product_id` esiste con un altro tipo.
    negozio = new NegozioSimulato(DOMINIO, 997000);
    negozio.seminaDefinizione({
      namespace: 'vestiflow',
      key: 'product_id',
      ownerType: 'PRODUCT',
      typeName: 'single_line_text_field',
    });
    const { id: terzo } = await articolo(IDS.tenantA, 'IDN-3');
    const esito = await creaPush().pushProduct(IDS.tenantA, terzo);
    expect(esito.outcome).toBe('fallito');
    expect(esito.detail).toContain('non è quella prevista');
    expect(negozio.chiamate.get('createProductSet') ?? 0).toBe(0);
    expect((await locale(terzo)).shopifyCreateClaimId).toBeNull();
  });

  // ── 11 · il PERCORSO COMPLETO: risposta persa → recupero dei soli id → invio ordinario ──
  //
  // ⭐ Regola del proprietario (15/09, pomeriggio) per i prodotti creati con l'identità:
  //    abbinamento SOLO per `vestiflow.variant_id`, nessun ripiego su SKU, barcode, titolo
  //    o opzioni; il completamento crea le mancanti con la loro identità senza appropriarsi
  //    di remote esistenti; combinazione occupata da una variante non riconosciuta →
  //    conflitto segnalato, niente collegamento, cancellazione o sovrascrittura.

  it('percorso completo · recupero dopo risposta persa → invio ordinario: le identità restano, nessuna variante in più o in meno', async () => {
    const { id } = await articolo();
    negozio.perdiProssimaRisposta('createProductSet');
    const recupero = await creaPush().pushProduct(IDS.tenantA, id);
    expect(recupero.outcome).toBe('parziale');
    const primaDellInvio = negozio.prodottoPerIdentita(id)!;
    expect(primaDellInvio.variants.map((v) => v.identita).filter(Boolean)).toHaveLength(2);

    const invio = await creaPush().pushProduct(IDS.tenantA, id);

    expect(invio.pushed).toBe(true);
    expect((await locale(id)).shopifySyncStatus).toBe('synced');
    const dopo = negozio.prodottoPerIdentita(id)!;
    // ⭐ Stesse due varianti, stessi id, stesse identità: nessuna creata, rimossa o sostituita.
    expect(dopo.variants.map((v) => [v.id, v.identita])).toEqual(
      primaDellInvio.variants.map((v) => [v.id, v.identita]),
    );
    // I valori locali sono arrivati sulle varianti NOSTRE (è l'invio ordinario, voluto).
    expect(dopo.variants.every((v) => v.price === '29.90')).toBe(true);
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.chiamate.get('bulkCreateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('bulkUpdateVariants')).toBe(1);
    await nessunDoppione(id);
  });

  it('una variante locale NUOVA la cui combinazione è occupata da una fatta a mano con lo STESSO SKU → conflitto: niente collegamento per SKU, prezzo remoto conservato, niente «synced»', async () => {
    // Pubblicato con la sola M (l'opzione dichiara anche L); poi qualcuno crea la L dal
    // pannello con lo SKU che VestiFlow userà; poi la L nasce anche localmente.
    const creato = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Articolo SOLO-M',
        articleCode: 'SOLO-M',
        shopifySyncEnabled: true,
        options: [{ name: 'Taglia', values: ['M', 'L'] }],
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'SOLO-M-M',
              optionValues: [{ name: 'Taglia', value: 'M' }],
              sellingPriceMinor: 2990,
              shopifyPriceMinor: 2990,
            },
          ],
        },
      },
    });
    expect((await creaPush().pushProduct(IDS.tenantA, creato.id)).pushed).toBe(true);
    const remoto = negozio.prodottoPerIdentita(creato.id)!;
    negozio.modifica(remoto.id, {
      nuovaVariante: { sku: 'SOLO-M-L', barcode: null, price: '99.00', valori: ['L'] },
    });
    const fattaAMano = negozio.prodotto(remoto.id).variants.find((v) => v.sku === 'SOLO-M-L')!;
    const l = await prisma.productVariant.create({
      data: {
        tenantId: IDS.tenantA,
        productId: creato.id,
        sku: 'SOLO-M-L',
        optionValues: [{ name: 'Taglia', value: 'L' }],
        sellingPriceMinor: 2990,
        shopifyPriceMinor: 2990,
      },
    });
    const fotografia = negozio.prodotto(remoto.id);
    negozio.azzeraChiamate();

    const invio = await creaPush().pushProduct(IDS.tenantA, creato.id);

    // ⛔ Qui c'era l'abbinamento legacy per SKU (e la sovrascrittura 99,00 → 29,90).
    expect(invio.pushed).toBe(false);
    expect(invio.detail).toMatch(/già occupata/);
    expect(invio.detail).toContain('SKU SOLO-M-L');
    expect(negozio.prodotto(remoto.id)).toEqual(fotografia);
    expect(negozio.prodotto(remoto.id).variants.find((v) => v.id === fattaAMano.id)!.price).toBe(
      '99.00',
    );
    const localeDopo = await locale(creato.id);
    expect(localeDopo.shopifySyncStatus).toBe('out_of_sync');
    expect(localeDopo.variants.find((v) => v.id === l.id)!.shopifyVariantId).toBeNull();
    expect(negozio.chiamate.get('bulkCreateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('bulkUpdateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('updateProductCatalog') ?? 0).toBe(0);
    // Il motivo arriva all'interfaccia così, con la variante che impedisce il completamento.
    expect(toShopifyUserMessage(undefined, localeDopo.shopifyLastError!)).toContain('SKU SOLO-M-L');
  });

  // ── 12 · il COMPLETAMENTO: una variante locale nuova su un prodotto già pubblicato ──

  /** Pubblica per intero, poi aggiunge localmente la taglia XL: è la variante da completare. */
  async function pubblicatoConXlInPiu(): Promise<{
    readonly id: string;
    readonly xl: string;
    readonly remotoId: number;
    readonly idPrima: readonly [number, string | null | undefined][];
  }> {
    const { id } = await articolo();
    expect((await creaPush().pushProduct(IDS.tenantA, id)).pushed).toBe(true);
    const remoto = negozio.prodottoPerIdentita(id)!;
    await prisma.product.update({
      where: { id },
      data: { options: [{ name: 'Taglia', values: ['M', 'L', 'XL'] }] },
    });
    const xl = await prisma.productVariant.create({
      data: {
        tenantId: IDS.tenantA,
        productId: id,
        sku: 'IDN-1-XL',
        optionValues: [{ name: 'Taglia', value: 'XL' }],
        sellingPriceMinor: 3490,
        shopifyPriceMinor: 3490,
      },
    });
    return {
      id,
      xl: xl.id,
      remotoId: remoto.id,
      idPrima: remoto.variants.map((v) => [v.id, v.identita] as const),
    };
  }

  it('completamento · la XL nuova si CREA con la sua identità; M e L mantengono gli id; nessuna remota toccata oltre le nostre', async () => {
    const { id, xl, remotoId, idPrima } = await pubblicatoConXlInPiu();
    // Una variante fatta a mano, con un'altra combinazione, non c'entra e resta com'è.
    await prisma.product.update({
      where: { id },
      data: { options: [{ name: 'Taglia', values: ['M', 'L', 'XL', 'S'] }] },
    });
    negozio.modifica(remotoId, {
      nuovaVariante: { sku: 'A-MANO-S', barcode: null, price: '5.00', valori: ['S'] },
    });
    negozio.azzeraChiamate();

    const invio = await creaPush().pushProduct(IDS.tenantA, id);

    expect(invio.pushed).toBe(true);
    const dopo = negozio.prodotto(remotoId);
    expect(dopo.variants).toHaveLength(4);
    // ⭐ M e L: stessi id e identità di prima. XL: nuova, con la SUA identità.
    for (const [rid, identita] of idPrima) {
      expect(dopo.variants.find((v) => v.id === rid)!.identita).toBe(identita);
    }
    const remotaXl = dopo.variants.find((v) => v.identita === xl)!;
    expect(remotaXl.sku).toBe('IDN-1-XL');
    expect(remotaXl.price).toBe('34.90');
    // La fatta a mano non è stata toccata, né adottata.
    const aMano = dopo.variants.find((v) => v.sku === 'A-MANO-S')!;
    expect(aMano.price).toBe('5.00');
    expect(aMano.identita).toBeUndefined();
    const localeDopo = await locale(id);
    expect(localeDopo.shopifySyncStatus).toBe('synced');
    expect(localeDopo.variants.find((v) => v.id === xl)!.shopifyVariantId).toBe(
      String(remotaXl.id),
    );
    expect(negozio.chiamate.get('bulkCreateVariants')).toBe(1);
    // ⛔ Mai REMOVE_STANDALONE_VARIANT nel completamento.
    expect(negozio.chiamate.get('bulkCreateVariants')).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count({ where: { variantId: xl } })).toBe(1);
  });

  it('completamento · combinazione della XL già OCCUPATA da una variante fatta a mano → conflitto, niente scritto', async () => {
    const { id, xl, remotoId } = await pubblicatoConXlInPiu();
    negozio.modifica(remotoId, {
      nuovaVariante: { sku: 'IDN-1-XL', barcode: null, price: '77.00', valori: ['XL'] },
    });
    const fotografia = negozio.prodotto(remotoId);
    negozio.azzeraChiamate();

    const invio = await creaPush().pushProduct(IDS.tenantA, id);

    expect(invio.pushed).toBe(false);
    expect(invio.detail).toMatch(/già occupata/);
    expect(invio.detail).toContain('«XL»');
    expect(negozio.prodotto(remotoId)).toEqual(fotografia);
    expect(negozio.chiamate.get('bulkCreateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('bulkUpdateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('updateProductCatalog') ?? 0).toBe(0);
    const localeDopo = await locale(id);
    expect(localeDopo.shopifySyncStatus).toBe('out_of_sync');
    expect(localeDopo.variants.find((v) => v.id === xl)!.shopifyVariantId).toBeNull();
  });

  it('completamento · risposta PERSA sulla bulkCreate → la XL si ritrova per identità, una sola remota', async () => {
    const { id, xl, remotoId } = await pubblicatoConXlInPiu();
    negozio.azzeraChiamate();
    negozio.perdiProssimaRisposta('bulkCreateVariants');

    const invio = await creaPush().pushProduct(IDS.tenantA, id);

    expect(invio.pushed).toBe(true);
    const dopo = negozio.prodotto(remotoId);
    expect(dopo.variants.filter((v) => v.identita === xl)).toHaveLength(1);
    expect(dopo.variants).toHaveLength(3);
    expect(negozio.chiamate.get('bulkCreateVariants')).toBe(1);
    expect((await locale(id)).variants.find((v) => v.id === xl)!.shopifyVariantId).toBe(
      String(dopo.variants.find((v) => v.identita === xl)!.id),
    );
  });

  it('completamento · due processi CONCORRENTI: una sola XL, il secondo la ritrova per identità', async () => {
    const { id, xl, remotoId } = await pubblicatoConXlInPiu();
    negozio.azzeraChiamate();
    const apri = negozio.bloccaProssima('bulkCreateVariants');
    const A = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => (negozio.chiamate.get('bulkCreateVariants') ?? 0) === 1);

    // B parte mentre la bulkCreate di A è in volo: crea lui la XL.
    const B = await creaPush().pushProduct(IDS.tenantA, id);
    expect(B.pushed).toBe(true);
    // A riprende: la sua bulkCreate arriva dopo, l'identità è occupata → rifiuto → rilettura.
    apri();
    const esitoA = await A;

    expect(esitoA.pushed).toBe(true);
    const dopo = negozio.prodotto(remotoId);
    expect(dopo.variants.filter((v) => v.identita === xl)).toHaveLength(1);
    expect(dopo.variants).toHaveLength(3);
    expect(negozio.chiamate.get('bulkCreateVariants')).toBe(2);
    expect((await locale(id)).variants.find((v) => v.id === xl)!.shopifyVariantId).toBe(
      String(dopo.variants.find((v) => v.identita === xl)!.id),
    );
    expect(await prisma.shopifyVariantIdentity.count({ where: { variantId: xl } })).toBe(1);
  });

  it('completamento · la XL viene ELIMINATA localmente mentre la bulkCreate è in volo → la remota si conserva, la locale non si ricrea, niente «synced», motivo leggibile — anche al push dopo', async () => {
    // ⛔ Qui c'era la MISURA: errore grezzo di Prisma in `shopifyLastError` (col percorso del
    //    file), poi un push «synced» che ignorava la remota con identità orfana.
    const { id, xl, remotoId } = await pubblicatoConXlInPiu();
    negozio.azzeraChiamate();
    const apri = negozio.bloccaProssima('bulkCreateVariants');
    const push = creaPush().pushProduct(IDS.tenantA, id);
    await attendi(() => (negozio.chiamate.get('bulkCreateVariants') ?? 0) === 1);
    await prisma.productVariant.delete({ where: { id: xl } });
    apri();
    const esito = await push;

    const verificaEsito = async (pushed: typeof esito) => {
      // ⭐ Non è una sincronizzazione completata: esito parziale, stato `out_of_sync`.
      expect(pushed.pushed).toBe(false);
      expect(pushed.outcome).toBe('parziale');
      const dopo = await locale(id);
      expect(dopo.shopifySyncStatus).toBe('out_of_sync');
      // ⭐ Il motivo è per l'operatore: nomina la remota, dice che si conserva e che la
      //    locale NON si ricrea. Niente Prisma, niente percorsi di file.
      const remotaXl = negozio.prodotto(remotoId).variants.find((v) => v.identita === xl)!;
      expect(remotaXl).toBeDefined();
      const perLOperatore = toShopifyUserMessage(undefined, dopo.shopifyLastError!);
      expect(perLOperatore).toContain('non esiste più');
      expect(perLOperatore).toContain(`gid://shopify/ProductVariant/${remotaXl.id}`);
      expect(perLOperatore).toContain('SKU IDN-1-XL');
      expect(perLOperatore).toContain('non ricreata in VestiFlow');
      expect(dopo.shopifyLastError).not.toMatch(/prisma|productVariant\.update|vf-motore|\.ts/i);
      // ⛔ Nessuna cancellazione remota, nessuna ricreazione locale.
      expect(negozio.prodotto(remotoId).variants).toHaveLength(3);
      expect(dopo.variants.map((v) => v.sku).sort()).toEqual(['IDN-1-L', 'IDN-1-M']);
      // M e L: aggiornate come sempre (l'invio ordinario prosegue), non toccate oltre.
      expect(
        negozio
          .prodotto(remotoId)
          .variants.filter((v) => v.identita !== xl)
          .every((v) => v.price === '29.90'),
      ).toBe(true);
    };
    await verificaEsito(esito);

    // Il push SUCCESSIVO: stessa dichiarazione, stesso negozio, nessun falso «synced».
    const chiamatePrima = negozio.chiamate.get('bulkCreateVariants');
    const successivo = await creaPush().pushProduct(IDS.tenantA, id);
    await verificaEsito(successivo);
    expect(negozio.chiamate.get('bulkCreateVariants')).toBe(chiamatePrima);
  });

  // ⚠️ Una variante GIÀ pubblicata (con lo storico scritto) non si può eliminare
  //    fisicamente: la FK di `shopify_variant_identities` la rifiuta — misurato. Il caso
  //    «identità remota senza locale» nasce quindi solo nella finestra qui sopra, prima
  //    che lo storico esista; la sua dichiarazione al push successivo è coperta lì.

  it('completamento · un prodotto IMPORTATO (senza claim) resta all abbinamento di prima: nessun cambiamento in questo intervento', async () => {
    // Un remoto nato su Shopify, importato: `claim_version = 0`.
    const remoto = negozio.semina({
      title: 'Nato sul negozio',
      opzioni: [{ name: 'Taglia', values: ['M', 'L'] }],
      varianti: [
        { sku: 'IMP-M', barcode: null, price: '10.00', valori: ['M'] },
        { sku: 'IMP-L', barcode: null, price: '10.00', valori: ['L'] },
      ],
    });
    expect(await creaPull().importProductFromWebhook(IDS.tenantA, negozio.webhook(remoto.id))).toBe(
      'imported',
    );
    const importato = await prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(remoto.id) },
      include: { variants: true },
    });
    expect(importato.shopifyCreateClaimVersion).toBe(0);
    // Cache della variante L persa: il percorso legacy la ritrova per SKU, come prima.
    const l = importato.variants.find((v) => v.sku === 'IMP-L')!;
    await prisma.productVariant.update({ where: { id: l.id }, data: { shopifyVariantId: null } });
    await prisma.product.update({
      where: { id: importato.id },
      data: { shopifySyncEnabled: true },
    });
    negozio.azzeraChiamate();

    const invio = await creaPush().pushProduct(IDS.tenantA, importato.id);

    expect(invio.pushed).toBe(true);
    expect(negozio.chiamate.get('listProductVariants')).toBe(1);
    expect(negozio.chiamate.get('listProductVariantsWithIdentity') ?? 0).toBe(0);
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: l.id } })).shopifyVariantId,
    ).not.toBeNull();
  });

  // ── 10 · variante unica ───────────────────────────────────────────────────

  it('prodotto a variante UNICA senza opzioni: nasce come «Title» / «Default Title» con la sua identità; nessuna seconda variante, nessuna scrittura dopo', async () => {
    const creato = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Unico',
        articleCode: 'UNI-1',
        shopifySyncEnabled: true,
        variants: { create: [{ tenantId: IDS.tenantA, sku: 'UNI-1', sellingPriceMinor: 1990 }] },
      },
    });

    const esito = await creaPush().pushProduct(IDS.tenantA, creato.id);

    expect(esito.pushed).toBe(true);
    const remoto = negozio.prodottoPerIdentita(creato.id)!;
    expect(remoto.variants).toHaveLength(1);
    expect(remoto.variants[0]!.sku).toBe('UNI-1');
    expect(remoto.variants[0]!.title).toBe('Default Title');
    expect(negozio.chiamate.get('createProductSet')).toBe(1);
    expect(negozio.chiamate.get('bulkCreateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('bulkUpdateVariants') ?? 0).toBe(0);
    await nessunDoppione(creato.id, 1);
  });
});

/** Attende una condizione osservabile, senza dormire a caso. */
async function attendi(condizione: () => boolean, tentativi = 200): Promise<void> {
  for (let i = 0; i < tentativi; i += 1) {
    if (condizione()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condizione non raggiunta');
}
