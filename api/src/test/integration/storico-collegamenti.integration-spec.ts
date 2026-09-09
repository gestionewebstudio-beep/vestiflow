import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  gidArticoloInventario,
  gidProdotto,
  gidVariante,
  ShopifyLinkHistoryService,
} from '../../shopify/shopify-link-history.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';

/**
 * B2-B3-B4 · la PRIMA SCRITTURA dello storico dei collegamenti.
 *
 * ⭐ **Sul database vero**, perché ciò che si prova qui sono vincoli e trigger:
 *    unicità del GID per negozio, un solo periodo attivo per identità, identità
 *    viva richiesta da un periodo attivo, immutabilità della causale. Con un
 *    client finto direbbero tutti di sì.
 */
describe('Storico dei collegamenti Shopify — prima scrittura (B2-B3-B4)', () => {
  let prisma: PrismaClient;
  let storico: ShopifyLinkHistoryService;

  const GID_SHOP = 'gid://shopify/Shop/9940001';
  let shopId: string;
  let prodotto: string;
  let varianteA: string;
  let varianteB: string;

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
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
      data: { tenantId: IDS.tenantA, shopGid: GID_SHOP },
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

    const creato = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Articolo collegato',
        articleCode: 'SC-1',
        variants: {
          create: [
            { tenantId: IDS.tenantA, sku: 'SC-1-M', optionValues: { T: 'M' }, sellingPriceMinor: 1000 },
            { tenantId: IDS.tenantA, sku: 'SC-1-L', optionValues: { T: 'L' }, sellingPriceMinor: 1000 },
          ],
        },
      },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    prodotto = creato.id;
    varianteA = creato.variants[0]!.id;
    varianteB = creato.variants[1]!.id;
  });

  /** Registra prodotto e una variante, come farà l'import. */
  async function registra(
    gidP = gidProdotto(500100),
    gidV = gidVariante(600100),
    variante = varianteA,
  ) {
    return prisma.$transaction(async (tx) => {
      const esito = await storico.registraProdotto(tx, {
        tenantId: IDS.tenantA,
        shopId,
        productId: prodotto,
        shopifyProductGid: gidP,
      });
      if (esito.tipo !== 'registrato') {
        return esito;
      }
      await storico.registraVariante(tx, {
        tenantId: IDS.tenantA,
        shopId,
        productIdentityId: esito.identityId,
        productLinkId: esito.linkId,
        productId: prodotto,
        variantId: variante,
        shopifyVariantGid: gidV,
        shopifyInventoryItemGid: gidArticoloInventario(700100),
      });
      return esito;
    });
  }

  // ── 1 · la scrittura, e la sua idempotenza ───────────────────────────────

  it('1a · scrive identità e periodo, per prodotto e variante', async () => {
    const esito = await registra();

    expect(esito.tipo).toBe('registrato');
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.shopifyProductGid).toBe('gid://shopify/Product/500100');
    expect(identita.originalProductId).toBe(prodotto);
    expect(identita.productId).toBe(prodotto);
    expect(identita.localDeletedAt).toBeNull();

    const periodo = await prisma.shopifyProductLink.findFirstOrThrow({
      where: { identityId: identita.id },
    });
    expect(periodo.status).toBe('active');
    expect(periodo.closeReason).toBeNull();
    expect(periodo.originalProductId).toBe(prodotto);

    const variante = await prisma.shopifyVariantIdentity.findFirstOrThrow({ where: { shopId } });
    expect(variante.shopifyVariantGid).toBe('gid://shopify/ProductVariant/600100');
    expect(variante.shopifyInventoryItemGid).toBe('gid://shopify/InventoryItem/700100');
    expect(variante.productIdentityId).toBe(identita.id);

    const periodoVariante = await prisma.shopifyVariantLink.findFirstOrThrow({
      where: { identityId: variante.id },
    });
    expect(periodoVariante.status).toBe('active');
    expect(periodoVariante.productLinkId).toBe(periodo.id);
  });

  it('1b · RIPETUTA non duplica niente — e i webhook si ripetono per contratto', async () => {
    await registra();
    await registra();
    await registra();

    expect(await prisma.shopifyProductIdentity.count()).toBe(1);
    expect(await prisma.shopifyProductLink.count()).toBe(1);
    expect(await prisma.shopifyVariantIdentity.count()).toBe(1);
    expect(await prisma.shopifyVariantLink.count()).toBe(1);
  });

  it('1c · un GID già formato non viene ri-prefissato', async () => {
    // ⚠️ I due percorsi parlano dialetti diversi: REST manda numeri, GraphQL
    //    manda GID. Un doppio prefisso violerebbe il CHECK sulla forma.
    await registra('gid://shopify/Product/500777', 'gid://shopify/ProductVariant/600777');

    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.shopifyProductGid).toBe('gid://shopify/Product/500777');
  });

  it('1d · senza negozio identificato NON scrive niente, e non fallisce', async () => {
    // ⭐ È il passaggio graduale: una connessione preesistente non migrata non
    //    ha `shop_id`, e senza negozio non esiste identità possibile.
    await prisma.shopifyConnection.update({
      where: { tenantId: IDS.tenantA },
      data: { shopId: null },
    });

    const negozio = await prisma.$transaction((tx) => storico.negozioDelTenant(tx, IDS.tenantA));

    expect(negozio).toBeNull();
    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
  });

  // ── 2 · i rifiuti, che non sono errori ───────────────────────────────────

  it('2a · lo stesso GID su un ALTRO articolo non viene riassegnato', async () => {
    await registra();
    const altro = await prisma.product.create({
      data: { tenantId: IDS.tenantA, name: 'Altro', articleCode: 'SC-2' },
    });

    const esito = await prisma.$transaction((tx) =>
      storico.registraProdotto(tx, {
        tenantId: IDS.tenantA,
        shopId,
        productId: altro.id,
        shopifyProductGid: gidProdotto(500100),
      }),
    );

    expect(esito.tipo).toBe('gid_di_un_altro');
    // ⛔ E la riga resta dell'articolo originario.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.originalProductId).toBe(prodotto);
  });

  it('2b · un identità ELIMINATA localmente non si riaggancia', async () => {
    await registra();
    await prisma.$transaction((tx) =>
      storico.sganciaProdotto(tx, { tenantId: IDS.tenantA, productId: prodotto }),
    );

    const esito = await prisma.$transaction((tx) =>
      storico.registraProdotto(tx, {
        tenantId: IDS.tenantA,
        shopId,
        productId: prodotto,
        shopifyProductGid: gidProdotto(500100),
      }),
    );

    expect(esito.tipo).toBe('identita_eliminata');
    // ⚠️ Nessun periodo nuovo: il periodo chiuso resta l'unico.
    const periodi = await prisma.shopifyProductLink.findMany();
    expect(periodi).toHaveLength(1);
    expect(periodi[0]!.status).toBe('unlinked');
  });

  // ── 3 · B4 · le eliminazioni consentite restano consentite ───────────────

  it('3a · la variante collegata si ELIMINA, e lo storico resta', async () => {
    await registra();

    // ⛔ Senza lo sgancio la FK `RESTRICT` rifiuterebbe: è il difetto che B4
    //    esiste per evitare, e qui si dimostra che l'eliminazione riesce.
    await prisma.$transaction(async (tx) => {
      await storico.sganciaVariante(tx, { tenantId: IDS.tenantA, variantId: varianteA });
      await tx.productVariant.delete({ where: { id: varianteA } });
    });

    expect(await prisma.productVariant.count({ where: { id: varianteA } })).toBe(0);

    // ⭐ Lo storico è intatto: identità conservata, periodo chiuso con la causale.
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.originalVariantId).toBe(varianteA);
    expect(identita.variantId).toBeNull();
    expect(identita.productId).toBeNull();
    expect(identita.localDeletedAt).not.toBeNull();
    expect(identita.shopifyVariantGid).toBe('gid://shopify/ProductVariant/600100');

    const periodo = await prisma.shopifyVariantLink.findFirstOrThrow();
    expect(periodo.status).toBe('unlinked');
    expect(periodo.closeReason).toBe('local_delete');
    expect(periodo.closedAt).not.toBeNull();
  });

  it('3b · senza sgancio l eliminazione è RIFIUTATA: la prova che B4 serve', async () => {
    await registra();

    await expect(
      prisma.productVariant.delete({ where: { id: varianteA } }),
    ).rejects.toThrow();

    // ⚠️ E la variante è ancora lì: il rifiuto non ha lasciato uno stato misto.
    expect(await prisma.productVariant.count({ where: { id: varianteA } })).toBe(1);
  });

  it('3c · una variante NON collegata si elimina come sempre', async () => {
    await registra();

    // ⭐ `varianteB` non ha identità: il percorso non deve cambiare per lei.
    await prisma.$transaction(async (tx) => {
      await storico.sganciaVariante(tx, { tenantId: IDS.tenantA, variantId: varianteB });
      await tx.productVariant.delete({ where: { id: varianteB } });
    });

    expect(await prisma.productVariant.count({ where: { id: varianteB } })).toBe(0);
    // ⛔ E non ha toccato lo storico dell'altra.
    expect(await prisma.shopifyVariantIdentity.count()).toBe(1);
    expect(
      await prisma.shopifyVariantLink.count({ where: { status: 'active' } }),
    ).toBe(1);
  });

  it('3d · il prodotto si elimina con le sue varianti, e lo storico resta', async () => {
    await registra();

    await prisma.$transaction(async (tx) => {
      await storico.sganciaProdotto(tx, { tenantId: IDS.tenantA, productId: prodotto });
      await tx.productVariant.deleteMany({ where: { productId: prodotto } });
      await tx.product.delete({ where: { id: prodotto } });
    });

    expect(await prisma.product.count({ where: { id: prodotto } })).toBe(0);
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow();
    expect(identita.productId).toBeNull();
    expect(identita.localDeletedAt).not.toBeNull();
    // ⭐ Il GID resta: è ciò che permetterà, a B5-B6, di NON ricrearlo.
    expect(identita.shopifyProductGid).toBe('gid://shopify/Product/500100');
    expect((await prisma.shopifyProductLink.findFirstOrThrow()).closeReason).toBe('local_delete');
  });

  // ── 4 · isolamento fra tenant ────────────────────────────────────────────

  it('4a · lo stesso GID in un ALTRO negozio di un ALTRO tenant convive', async () => {
    await registra();

    const negozioB = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/9940002' },
    });
    const prodottoB = await prisma.product.create({
      data: { tenantId: IDS.tenantB, name: 'Di un altro', articleCode: 'SC-B' },
    });

    const esito = await prisma.$transaction((tx) =>
      storico.registraProdotto(tx, {
        tenantId: IDS.tenantB,
        shopId: negozioB.id,
        productId: prodottoB.id,
        // ⭐ Stesso numero, negozio diverso: l'unicità è PER NEGOZIO.
        shopifyProductGid: gidProdotto(500100),
      }),
    );

    expect(esito.tipo).toBe('registrato');
    expect(await prisma.shopifyProductIdentity.count()).toBe(2);
    expect(
      await prisma.shopifyProductIdentity.count({ where: { tenantId: IDS.tenantA } }),
    ).toBe(1);
  });

  it('4b · lo sgancio di un tenant non tocca lo storico dell altro', async () => {
    await registra();
    const negozioB = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/9940002' },
    });
    const prodottoB = await prisma.product.create({
      data: { tenantId: IDS.tenantB, name: 'Di un altro', articleCode: 'SC-B' },
    });
    await prisma.$transaction((tx) =>
      storico.registraProdotto(tx, {
        tenantId: IDS.tenantB,
        shopId: negozioB.id,
        productId: prodottoB.id,
        shopifyProductGid: gidProdotto(500100),
      }),
    );

    await prisma.$transaction((tx) =>
      storico.sganciaProdotto(tx, { tenantId: IDS.tenantA, productId: prodotto }),
    );

    const diB = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantB },
    });
    expect(diB.productId).toBe(prodottoB.id);
    expect(diB.localDeletedAt).toBeNull();
    expect(
      await prisma.shopifyProductLink.count({
        where: { tenantId: IDS.tenantB, status: 'active' },
      }),
    ).toBe(1);
  });

  // ── 5 · errore a metà scrittura ──────────────────────────────────────────

  it('5a · un errore dopo la scrittura dello storico ANNULLA anche quello', async () => {
    // ⛔ Lo storico si scrive nella STESSA transazione delle colonne-cache: se
    //    qualcosa cade dopo, non deve restare un'identità senza il suo articolo.
    await expect(
      prisma.$transaction(async (tx) => {
        await storico.registraProdotto(tx, {
          tenantId: IDS.tenantA,
          shopId,
          productId: prodotto,
          shopifyProductGid: gidProdotto(500900),
        });
        throw new Error('caduta a metà scrittura');
      }),
    ).rejects.toThrow(/caduta a met/);

    expect(await prisma.shopifyProductIdentity.count()).toBe(0);
    expect(await prisma.shopifyProductLink.count()).toBe(0);
  });
});
