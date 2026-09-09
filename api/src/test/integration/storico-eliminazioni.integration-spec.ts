import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ProductsService } from '../../products/products.service';
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
 * B4 · le eliminazioni CONSENTITE restano consentite — dal percorso vero.
 *
 * ⛔ **È la metà che rende B2 e B3 sicuri.** Dal primo istante in cui si scrive
 *    un'identità, la FK `RESTRICT` su `variant_id` impedisce di eliminare quella
 *    variante. Senza lo sgancio, una funzione che oggi c'è smetterebbe di
 *    funzionare — ed è la ragione per cui i tre stanno nello stesso blocco.
 *
 * ⚠️ **Nessuna condizione di eliminazione è cambiata**: chi poteva eliminare può
 *    ancora, chi era bloccato dai movimenti di magazzino lo è ancora. Queste
 *    prove lo verificano invece di dichiararlo.
 */
describe('Eliminazioni e storico dei collegamenti (B4)', () => {
  let prisma: PrismaClient;
  let products: ProductsService;
  let storico: ShopifyLinkHistoryService;

  let shopId: string;
  let prodotto: string;
  let varianteCollegata: string;
  let varianteLibera: string;


  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    products = new ProductsService(
      prisma as never,
      // ⚠️ Il canale non viene interrogato: queste prove non pubblicano niente.
      {
        enqueueProductPush: () => undefined,
        archiveProductOnSyncDisabled: async () => undefined,
      } as never,
      // ⚠️ La localizzazione della tassonomia serve alla lettura del prodotto,
      //    non allo storico: restituisce ciò che riceve.
      {
        prepareProductLocalization: async () => undefined,
        localizeProductForResponseSync: (riga: unknown) => riga,
      } as never,
      new PlatformAuditService(prisma as never, prisma as never),
      // ⭐ Il servizio VERO: è quello che si sta provando.
      storico,
    );
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
    await prisma.platformAuditLog.deleteMany({});

    const negozio = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/9960001' },
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
        name: 'Articolo con storico',
        articleCode: 'EL-1',
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'EL-1-M',
              optionValues: { T: 'M' },
              sellingPriceMinor: 1000,
            },
            {
              tenantId: IDS.tenantA,
              sku: 'EL-1-L',
              optionValues: { T: 'L' },
              sellingPriceMinor: 1000,
            },
          ],
        },
      },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
    prodotto = creato.id;
    varianteCollegata = creato.variants[0]!.id;
    varianteLibera = creato.variants[1]!.id;

    // Solo la prima variante è collegata: la seconda serve a dimostrare che il
    // percorso non cambia per chi con Shopify non c'entra.
    await prisma.$transaction(async (tx) => {
      const esito = await storico.registraProdotto(tx, {
        tenantId: IDS.tenantA,
        shopId,
        productId: prodotto,
        shopifyProductGid: gidProdotto(881001),
      });
      if (esito.tipo !== 'registrato') {
        throw new Error(`preparazione fallita: ${esito.tipo}`);
      }
      await storico.registraVariante(tx, {
        tenantId: IDS.tenantA,
        shopId,
        productIdentityId: esito.identityId,
        productLinkId: esito.linkId,
        productId: prodotto,
        variantId: varianteCollegata,
        shopifyVariantGid: gidVariante(991001),
        shopifyInventoryItemGid: gidArticoloInventario(771001),
      });
    });
  });

  /** Il payload di salvataggio prodotto, con l'elenco varianti che resta. */
  function salvaSenza(varianteDaTogliere: string) {
    return products.update(IDS.tenantA, prodotto, {
      name: 'Articolo con storico',
      variants: [
        ...(varianteDaTogliere === varianteCollegata
          ? [{ id: varianteLibera, sku: 'EL-1-L', sellingPrice: { amountMinor: 1000, currency: 'EUR' } }]
          : [
              {
                id: varianteCollegata,
                sku: 'EL-1-M',
                sellingPrice: { amountMinor: 1000, currency: 'EUR' },
              },
            ]),
      ],
    } as never);
  }

  // ── 1 · l'eliminazione consentita resta consentita ───────────────────────

  it('4a · la variante COLLEGATA si elimina dal percorso reale, e lo storico resta', async () => {
    await salvaSenza(varianteCollegata);

    // ⭐ La variante non c'è più: l'operazione ammessa è ancora ammessa.
    expect(await prisma.productVariant.count({ where: { id: varianteCollegata } })).toBe(0);

    // ⭐ E la storia è conservata per intero.
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow({ where: { shopId } });
    expect(identita.originalVariantId).toBe(varianteCollegata);
    expect(identita.shopifyVariantGid).toBe('gid://shopify/ProductVariant/991001');
    expect(identita.variantId).toBeNull();
    expect(identita.localDeletedAt).not.toBeNull();

    const periodo = await prisma.shopifyVariantLink.findFirstOrThrow();
    expect(periodo.status).toBe('unlinked');
    expect(periodo.closeReason).toBe('local_delete');

    // ⚠️ Il prodotto e la sua identità NON sono toccati: si è eliminata una
    //    variante, non l'articolo.
    const identitaProdotto = await prisma.shopifyProductIdentity.findFirstOrThrow();
    expect(identitaProdotto.productId).toBe(prodotto);
    expect(identitaProdotto.localDeletedAt).toBeNull();
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(1);
  });

  it('4b · la variante NON collegata si elimina come è sempre stato', async () => {
    await salvaSenza(varianteLibera);

    expect(await prisma.productVariant.count({ where: { id: varianteLibera } })).toBe(0);
    // ⛔ E lo storico dell'altra non è stato sfiorato.
    const periodo = await prisma.shopifyVariantLink.findFirstOrThrow();
    expect(periodo.status).toBe('active');
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow();
    expect(identita.variantId).toBe(varianteCollegata);
    expect(identita.localDeletedAt).toBeNull();
  });

  // ── 2 · le condizioni di rifiuto non sono cambiate ───────────────────────

  it('4c · con MOVIMENTI di magazzino l eliminazione è rifiutata come prima', async () => {
    // ⛔ È il divieto che esisteva già: B4 non deve averlo indebolito, e non
    //    deve nemmeno averlo sostituito con un rifiuto della FK.
    await prisma.stockMovement.create({
      data: {
        tenantId: IDS.tenantA,
        locationId: IDS.locA1,
        variantId: varianteCollegata,
        type: 'load',
        quantity: 1,
        sku: 'EL-1-M',
        createdByName: 'Prova',
      },
    });

    await expect(salvaSenza(varianteCollegata)).rejects.toThrow(/movimenti di magazzino/i);

    // ⭐ E niente è cambiato: né la variante, né lo storico.
    expect(await prisma.productVariant.count({ where: { id: varianteCollegata } })).toBe(1);
    const periodo = await prisma.shopifyVariantLink.findFirstOrThrow();
    expect(periodo.status).toBe('active');
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow();
    expect(identita.variantId).toBe(varianteCollegata);
  });

  it('4d · un errore DOPO lo sgancio riporta indietro anche lo storico', async () => {
    // ⛔ Lo sgancio sta nella stessa transazione del salvataggio: se qualcosa
    //    cade dopo, non deve restare un collegamento chiuso per un'eliminazione
    //    che non è avvenuta.
    await expect(
      prisma.$transaction(async (tx) => {
        await storico.sganciaVariante(tx, {
          tenantId: IDS.tenantA,
          variantId: varianteCollegata,
        });
        await tx.productVariant.delete({ where: { id: varianteCollegata } });
        throw new Error('caduta dopo lo sgancio');
      }),
    ).rejects.toThrow(/caduta dopo lo sgancio/);

    expect(await prisma.productVariant.count({ where: { id: varianteCollegata } })).toBe(1);
    const periodo = await prisma.shopifyVariantLink.findFirstOrThrow();
    expect(periodo.status).toBe('active');
    expect(periodo.closeReason).toBeNull();
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow();
    expect(identita.localDeletedAt).toBeNull();
  });

  // ── 3 · isolamento fra tenant ────────────────────────────────────────────

  it('4e · l eliminazione di un tenant non tocca lo storico dell altro', async () => {
    const negozioB = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/9960002' },
    });
    const prodottoB = await prisma.product.create({
      data: {
        tenantId: IDS.tenantB,
        name: 'Di un altro',
        articleCode: 'EL-B',
        variants: {
          create: [
            {
              tenantId: IDS.tenantB,
              sku: 'EL-B-M',
              optionValues: { T: 'M' },
              sellingPriceMinor: 1000,
            },
          ],
        },
      },
      include: { variants: true },
    });
    await prisma.$transaction(async (tx) => {
      const esito = await storico.registraProdotto(tx, {
        tenantId: IDS.tenantB,
        shopId: negozioB.id,
        productId: prodottoB.id,
        // ⭐ Stesso GID dell'altro tenant: negozi diversi, identità diverse.
        shopifyProductGid: gidProdotto(881001),
      });
      if (esito.tipo !== 'registrato') throw new Error('preparazione B fallita');
      await storico.registraVariante(tx, {
        tenantId: IDS.tenantB,
        shopId: negozioB.id,
        productIdentityId: esito.identityId,
        productLinkId: esito.linkId,
        productId: prodottoB.id,
        variantId: prodottoB.variants[0]!.id,
        shopifyVariantGid: gidVariante(991001),
        shopifyInventoryItemGid: null,
      });
    });

    await salvaSenza(varianteCollegata);

    // ⭐ Il tenant B è intatto.
    const diB = await prisma.shopifyVariantIdentity.findFirstOrThrow({
      where: { tenantId: IDS.tenantB },
    });
    expect(diB.variantId).toBe(prodottoB.variants[0]!.id);
    expect(diB.localDeletedAt).toBeNull();
    expect(
      await prisma.shopifyVariantLink.count({ where: { tenantId: IDS.tenantB, status: 'active' } }),
    ).toBe(1);
  });

  // ── 4 · senza Shopify, niente cambia ─────────────────────────────────────

  it('4f · su un tenant SENZA Shopify l eliminazione è quella di sempre', async () => {
    // ⛔ Il vincolo che viene prima di tutti: VestiFlow funziona senza Shopify.
    const soloGestionale = await prisma.product.create({
      data: {
        tenantId: IDS.tenantB,
        name: 'Solo gestionale',
        articleCode: 'SG-9',
        variants: {
          create: [
            { tenantId: IDS.tenantB, sku: 'SG-9-A', optionValues: { T: 'A' }, sellingPriceMinor: 500 },
            { tenantId: IDS.tenantB, sku: 'SG-9-B', optionValues: { T: 'B' }, sellingPriceMinor: 500 },
          ],
        },
      },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });

    await products.update(IDS.tenantB, soloGestionale.id, {
      name: 'Solo gestionale',
      variants: [
        {
          id: soloGestionale.variants[0]!.id,
          sku: 'SG-9-A',
          sellingPrice: { amountMinor: 500, currency: 'EUR' },
        },
      ],
    } as never);

    expect(
      await prisma.productVariant.count({ where: { id: soloGestionale.variants[1]!.id } }),
    ).toBe(0);
    // ⛔ E nessuna riga di storico è comparsa per un tenant che Shopify non ce l'ha.
    expect(await prisma.shopifyVariantIdentity.count({ where: { tenantId: IDS.tenantB } })).toBe(0);
  });
});
