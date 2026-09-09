import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * B2 · l'IMPORT scrive lo storico — dal percorso applicativo vero.
 *
 * ⭐ **Il servizio di import completo, con Prisma vero**: le sole risposte
 *    Shopify sono simulate, perché è l'unica parte che non si può avere qui.
 *    Tutto il resto — transazione, vincoli, idempotenza — è il database.
 *
 * ⚠️ **Copre anche il percorso dei webhook**: `importProductFromWebhook` passa
 *    per lo stesso `importProduct`, ed è la ragione per cui una prova sola
 *    basta a coprirli entrambi. La prova `2c` lo verifica invece di assumerlo.
 */
describe('Import Shopify e storico dei collegamenti (B2)', () => {
  let prisma: PrismaClient;
  let shopId: string;

  const REMOTO = {
    id: 880001,
    title: 'Maglia importata',
    body_html: '<p>Descrizione</p>',
    handle: 'maglia-importata',
    status: 'active',
    vendor: 'Fornitore',
    product_type: 'Maglie',
    tags: '',
    images: [],
    options: [{ name: 'Taglia', values: ['M', 'L'], position: 1 }],
    variants: [
      {
        id: 990001,
        sku: 'IMP-M',
        title: 'M',
        price: '19.90',
        compare_at_price: null,
        barcode: null,
        inventory_item_id: 770001,
        option1: 'M',
        option2: null,
        option3: null,
      },
      {
        id: 990002,
        sku: 'IMP-L',
        title: 'L',
        price: '19.90',
        compare_at_price: null,
        barcode: null,
        inventory_item_id: 770002,
        option1: 'L',
        option2: null,
        option3: null,
      },
    ],
  };

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
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/9950001' },
    });
    shopId = negozio.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: 'prova.myshopify.com',
        shopId,
      },
    });
  });

  /**
   * Il servizio di import vero, con Prisma vero e Shopify simulato.
   *
   * ⚠️ `enrichProduct` restituisce il minimo: i metadati non c'entrano con lo
   *    storico, e riempirli renderebbe la prova sensibile a cose che non prova.
   */
  function creaImport(opzioni: { readonly senzaNegozio?: boolean } = {}) {
    return new ShopifyProductPullService(
      prisma as never,
      {
        getAccessToken: vi
          .fn()
          .mockResolvedValue({ shopDomain: 'prova.myshopify.com', accessToken: 'token' }),
      } as never,
      { requestedScopes: ['read_products'] } as never,
      { listAllProducts: vi.fn().mockResolvedValue([REMOTO]) } as never,
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
      // ⭐ Il servizio VERO dello storico: è ciò che si sta provando.
      opzioni.senzaNegozio
        ? ({ negozioDelTenant: vi.fn().mockResolvedValue(null) } as never)
        : new ShopifyLinkHistoryService(),
      // §10.3 · il registro vero: qui non si rifiuta niente, ma il servizio lo riceve.
      new PlatformAuditService(prisma as never, prisma as never),
    );
  }

  async function importa(servizio = creaImport()) {
    return servizio.importProductFromWebhook(IDS.tenantA, REMOTO as never);
  }

  // ── 1 · la scrittura ─────────────────────────────────────────────────────

  it('2a · il primo import scrive identità e periodo, prodotto e varianti', async () => {
    const esito = await importa();

    expect(esito).toBe('imported');
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.shopifyProductGid).toBe('gid://shopify/Product/880001');
    expect(identita.localDeletedAt).toBeNull();

    // ⭐ Il riferimento vivo punta all'articolo appena creato dall'import.
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: '880001' },
    });
    expect(identita.productId).toBe(prodotto.id);
    expect(identita.originalProductId).toBe(prodotto.id);

    const periodo = await prisma.shopifyProductLink.findFirstOrThrow();
    expect(periodo.status).toBe('active');

    // ⭐ Due varianti, due identità, due periodi — appesi al periodo padre.
    const varianti = await prisma.shopifyVariantIdentity.findMany({ orderBy: { createdAt: 'asc' } });
    expect(varianti).toHaveLength(2);
    expect(varianti.map((v) => v.shopifyVariantGid).sort()).toEqual([
      'gid://shopify/ProductVariant/990001',
      'gid://shopify/ProductVariant/990002',
    ]);
    expect(varianti[0]!.shopifyInventoryItemGid).toMatch(/^gid:\/\/shopify\/InventoryItem\/\d+$/);
    const periodiVariante = await prisma.shopifyVariantLink.findMany();
    expect(periodiVariante).toHaveLength(2);
    expect(periodiVariante.every((p) => p.productLinkId === periodo.id)).toBe(true);
  });

  it('2b · import RIPETUTO: nessuna duplicazione', async () => {
    await importa();
    const secondo = await importa();
    await importa();

    expect(secondo).toBe('updated');
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);
    expect(await prisma.shopifyVariantLink.count()).toBe(2);
    expect(await prisma.product.count({ where: { shopifyProductId: '880001' } })).toBe(1);
  });

  it('2c · il percorso dei WEBHOOK è lo stesso, e scrive lo storico', async () => {
    // ⚠️ Verificato invece che assunto: `importProductFromWebhook` è l'ingresso
    //    dei webhook, ed è quello che queste prove usano. Qui si controlla che
    //    l'esito sia lo stesso di un import di catalogo sullo stesso prodotto.
    await importa();
    const daWebhook = await creaImport().importProductFromWebhook(IDS.tenantA, REMOTO as never);

    expect(daWebhook).toBe('updated');
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(2);
  });

  it('2d · una variante comparsa DOPO riceve la sua identità al ri-sync', async () => {
    await importa();

    const conTerza = {
      ...REMOTO,
      variants: [
        ...REMOTO.variants,
        {
          id: 990003,
          sku: 'IMP-XL',
          title: 'XL',
          price: '19.90',
          compare_at_price: null,
          barcode: null,
          inventory_item_id: 770003,
          option1: 'XL',
          option2: null,
          option3: null,
        },
      ],
    };
    await creaImport().importProductFromWebhook(IDS.tenantA, conTerza as never);

    expect(await prisma.shopifyVariantIdentity.count()).toBe(3);
    expect(await prisma.shopifyVariantLink.count({ where: { status: 'active' } })).toBe(3);
    // ⭐ E il periodo del prodotto è sempre lo stesso: non se ne apre un altro.
    expect(await prisma.shopifyProductLink.count()).toBe(1);
  });

  // ── 2 · il passaggio graduale ────────────────────────────────────────────

  it('2e · connessione NON migrata: import invariato, nessuno storico', async () => {
    // ⛔ È il vincolo di compatibilità: senza `shop_id` non esiste identità
    //    possibile, e l'import deve continuare a funzionare com'era.
    await prisma.shopifyConnection.update({
      where: { tenantId: IDS.tenantA },
      data: { shopId: null },
    });

    const esito = await importa();

    expect(esito).toBe('imported');
    // ⭐ Il prodotto c'è, con le sue varianti e le colonne-cache di sempre.
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { shopifyProductId: '880001' },
      include: { variants: true },
    });
    expect(prodotto.variants).toHaveLength(2);
    expect(prodotto.variants.every((v) => v.shopifyVariantId)).toBe(true);
    // ⛔ E nessuna riga di storico.
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    expect(await prisma.shopifyProductLink.count()).toBe(0);
  });

  it('2f · senza NESSUNA connessione Shopify l import non cambia comportamento', async () => {
    await prisma.shopifyConnection.delete({ where: { tenantId: IDS.tenantA } });

    const esito = await importa();

    expect(esito).toBe('imported');
    expect(await prisma.product.count({ where: { shopifyProductId: '880001' } })).toBe(1);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
  });

  // ── 3 · gli esiti che non sono errori ────────────────────────────────────

  it('2g · GID già di un ALTRO articolo: NON si crea un doppione (B5)', async () => {
    // ⛔ **Questa prova diceva il contrario, e B5 l'ha superata.** Prima della
    //    guardia l'articolo veniva importato lo stesso — creando un secondo
    //    articolo locale per un GID già assegnato — e a non essere scritto era
    //    solo il collegamento.
    //
    // ⭐ Con B5 «la creazione è condizionata all'assenza di un link non chiuso»
    //    (`docs/24` §8.5.4): qui il collegamento esiste ed è di un altro
    //    articolo, quindi il doppione non nasce affatto.
    //
    // ⚠️ **Il lotto prosegue lo stesso**: `skipped` non è un errore, e la prova
    //    `B6c` di `divieto-ricreazione` verifica che gli altri articoli entrino.
    const altro = await prisma.product.create({
      data: { tenantId: IDS.tenantA, name: 'Occupante', articleCode: 'OCC-1' },
    });
    const identita = await prisma.shopifyProductIdentity.create({
      data: {
        tenantId: IDS.tenantA,
        shopId,
        shopifyProductGid: 'gid://shopify/Product/880001',
        originalProductId: altro.id,
        productId: altro.id,
      },
    });

    const esito = await importa();

    expect(esito).toBe('skipped');
    // ⛔ Nessun articolo creato per quel GID: il doppione non esiste.
    expect(await prisma.product.count({ where: { shopifyProductId: '880001' } })).toBe(0);
    // ⛔ L'identità resta dell'occupante: nessuna riassegnazione.
    const dopo = await prisma.shopifyProductIdentity.findUniqueOrThrow({
      where: { id: identita.id },
    });
    expect(dopo.originalProductId).toBe(altro.id);
    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(0);
  });

  it('2h · errore a metà: nessuna riga di storico sopravvive alla transazione', async () => {
    // ⛔ Lo storico sta nella STESSA transazione delle colonne-cache. Qui la si
    //    fa cadere dopo la scrittura del prodotto: non deve restare né
    //    l'articolo né la sua identità.
    const rotto = creaImport();
    // ⚠️ Si rompe il COLLABORATORE, non il metodo privato: la prova non deve
    //    conoscere i nomi interni del servizio per funzionare.
    const storicoRotto = {
      negozioDelTenant: vi.fn().mockResolvedValue(shopId),
      // ⚠️ B5 interroga lo storico PRIMA di creare: il finto deve rispondere,
      //    o l'import cade lì invece che nel punto che questa prova esercita.
      siPuoCreareProdotto: vi.fn().mockResolvedValue({ tipo: 'si_crea' }),
      siPuoCreareVariante: vi.fn().mockResolvedValue({ tipo: 'si_crea' }),
      registraProdotto: vi.fn().mockRejectedValue(new Error('caduta dopo le colonne-cache')),
    };
    (rotto as unknown as { storico: unknown }).storico = storicoRotto;

    await expect(importa(rotto)).rejects.toThrow(/caduta dopo le colonne-cache/);

    expect(await prisma.product.count({ where: { shopifyProductId: '880001' } })).toBe(0);
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    expect(await prisma.shopifyProductLink.count()).toBe(0);
  });

  // ── 4 · isolamento fra tenant ────────────────────────────────────────────

  it('2i · l import di un tenant non tocca lo storico dell altro', async () => {
    await importa();

    const negozioB = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/9950002' },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantB,
        status: 'connected',
        shopDomain: 'altro.myshopify.com',
        shopId: negozioB.id,
      },
    });
    await creaImport().importProductFromWebhook(IDS.tenantB, REMOTO as never);

    // ⭐ Stesso GID, negozi diversi: due identità, ognuna col suo tenant.
    expect(await prisma.shopifyProductIdentity.count()).toBe(2);
    const diA = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    const diB = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantB },
    });
    expect(diA.shopId).toBe(shopId);
    expect(diB.shopId).toBe(negozioB.id);
    expect(diA.originalProductId).not.toBe(diB.originalProductId);
  });
});
