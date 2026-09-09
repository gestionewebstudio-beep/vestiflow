import { PlatformAuditActor, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { allineaCacheIncoerenti } from '../../tenant/tenant-backup/tenant-backup-storico.util';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * 26.7 · **lo storico va rispettato dai percorsi operativi**, non solo scritto.
 *
 * ⚠️ **«Percorsi operativi» qui vuol dire CATALOGO**, e il perimetro va detto
 *    invece che lasciato intendere: import del prodotto, push del prodotto,
 *    ripristino. Il push delle **quantità** non è stato toccato — `E14` lo
 *    verifica ed è la riproduzione di un difetto aperto, non una conformità.
 *
 * ⛔ **Il difetto misurato il 09/09/2026** (campagna M, `S8`): l'esclusione
 *    resta scritta nello storico — identità eliminata, periodo chiuso — ma
 *    import e push continuano a passare **per la colonna-cache**, che dice
 *    ancora «collegata». Il webhook aggiornava la variante esclusa; il push
 *    scriveva sul GID vietato; con la cache azzerata il push la **rimetteva**
 *    per SKU; e su un prodotto col collegamento chiuso creava un prodotto
 *    remoto nuovo.
 *
 * ⭐ **Le due regole, decise dal proprietario**: il collegamento chiuso non
 *    autorizza né una riapertura né il passaggio automatico di aggiornamenti
 *    attraverso la cache; e il rifiuto è **per variante** — se il collegamento
 *    del prodotto è valido, la sola variante esclusa si salta e il resto
 *    prosegue.
 *
 * ⚠️ **Quattro limiti che queste prove tengono fermi**, e che un rimedio
 *    frettoloso violerebbe:
 *
 * ```text
 *   E8   uno storico VECCHIO chiuso non blocca un collegamento ATTUALE valido
 *   E9   nessuno storico non significa esclusione: l'articolo mai collegato passa
 *   E6   scartato un candidato vietato, NON se ne abbina un altro per barcode
 *   —    «eliminato definitivamente» e' LOCALE: il remoto puo' esistere ancora
 * ```
 */
describe('Collegamento escluso e percorsi operativi (26.7)', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;
  let shopId: string;

  const DOMINIO = 'escluso.myshopify.com';

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
    await prisma.platformAuditLog.deleteMany({});
    semi = 0;
    negozio = new NegozioSimulato(DOMINIO, 993000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/993001' },
    });
    shopId = riga.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId,
        scopes: ['read_products', 'write_products'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products'],
      },
    });
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  function creaImport() {
    return new ShopifyProductPullService(
      prisma as never,
      negozio.oauth() as never,
      { requestedScopes: ['read_products', 'write_products'] } as never,
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
    );
  }

  function creaPush() {
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

  /**
   * Un prodotto remoto con due varianti, seminato sul negozio simulato.
   *
   * ⚠️ **Barcode distinti a ogni chiamata**: `product_variants` ha l'unicità
   *    `(tenant_id, barcode)`, e due prodotti che ne portassero uno uguale
   *    farebbero cadere l'import per il motivo sbagliato — succede in `E8`, che
   *    semina due prodotti nello stesso tenant.
   */
  let semi = 0;
  function seminaDue(nome: string) {
    semi += 1;
    const base = `80020000000${String(semi).padStart(2, '0')}`;
    return negozio.semina({
      title: nome,
      vendor: 'F',
      product_type: 'T',
      tags: 'collaudo',
      opzioni: [{ name: 'Taglia', values: ['M', 'L'] }],
      varianti: [
        { sku: `${nome}-M`, barcode: `${base}1`, price: '10.00', valori: ['M'] },
        { sku: `${nome}-L`, barcode: `${base}2`, price: '10.00', valori: ['L'] },
      ],
    });
  }

  /** Importa il prodotto remoto e restituisce la riga locale con le varianti. */
  async function importaEProduci(remotoId: number) {
    await creaImport().importProductFromWebhook(IDS.tenantA, negozio.webhook(remotoId) as never);
    return prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(remotoId) },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
  }

  /** Chiude il periodo del PRODOTTO (e delle sue varianti): figlie prima. */
  async function chiudiCollegamento(productId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_links l
          SET status = 'unlinked', close_reason = 'operator',
              closed_at = GREATEST(now(), linked_at), updated_at = now()
         FROM shopify_variant_identities i
        WHERE l.identity_id = i.id AND i.product_id = $1::uuid AND l.status = 'active'`,
      productId,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_product_links l
          SET status = 'unlinked', close_reason = 'operator',
              closed_at = GREATEST(now(), linked_at), updated_at = now()
         FROM shopify_product_identities i
        WHERE l.identity_id = i.id AND i.product_id = $1::uuid AND l.status = 'active'`,
      productId,
    );
  }

  /** Chiude il periodo di UNA variante, lasciando attivo il prodotto. */
  async function chiudiVariante(variantId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_links l
          SET status = 'unlinked', close_reason = 'operator',
              closed_at = GREATEST(now(), linked_at), updated_at = now()
         FROM shopify_variant_identities i
        WHERE l.identity_id = i.id AND i.variant_id = $1::uuid AND l.status = 'active'`,
      variantId,
    );
  }

  /** Elimina definitivamente l'articolo locale, storico compreso (come B6). */
  async function eliminaDefinitivamente(productId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await storico.sganciaProdotto(tx, { tenantId: IDS.tenantA, productId });
      await tx.inventoryLevel.deleteMany({ where: { variant: { productId } } });
      await tx.productVariant.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
    });
  }

  async function righeRegistro() {
    return prisma.platformAuditLog.findMany({
      where: { tenantId: IDS.tenantA },
      orderBy: { createdAt: 'asc' },
      select: { operation: true, outcome: true, actor: true, remoteGid: true, detail: true },
    });
  }

  // ── 1 · IMPORT, cache PRESENTE ───────────────────────────────────────────

  it('E1 · collegamento CHIUSO e cache presente: il webhook NON aggiorna il prodotto', async () => {
    const remoto = seminaDue('E1');
    const prodotto = await importaEProduci(remoto.id);
    await chiudiCollegamento(prodotto.id);
    negozio.modifica(remoto.id, { title: 'Titolo dopo la chiusura' });

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remoto.id) as never,
    );

    // ⛔ **Comportamento SUPERATO**: fino al 09/09/2026 questo import rispondeva
    //    `updated` e scriveva il titolo nuovo, perché trovava l'anagrafica per
    //    colonna-cache e non interrogava lo storico (`B5a-bis`, quarta
    //    asserzione). Il collegamento chiuso non autorizza il passaggio
    //    automatico di aggiornamenti: decisione del proprietario, 09/09/2026.
    expect(esito).toBe('skipped');
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopo.shopifyTitle).toBe(prodotto.shopifyTitle);
    // ⭐ E nessuna riapertura, come già prima.
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(0);
    // ⭐ Il rifiuto è registrato (§10.3), con la regola per nome.
    const righe = await righeRegistro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({ operation: 'riaggancio_rifiutato', outcome: 'rifiutata' });
    expect(righe[0]!.detail).toMatch(/^collegamento_chiuso: /);
  });

  it('E2 · identità ELIMINATA e anagrafica ricomparsa con la cache: il webhook NON aggiorna', async () => {
    const remoto = seminaDue('E2');
    const prodotto = await importaEProduci(remoto.id);
    const varianti = prodotto.variants;
    await eliminaDefinitivamente(prodotto.id);
    // ⚠️ Il ripristino da backup rimette la riga com'era, cache compresa: è la
    //    situazione di `S8`, costruita qui a mano con gli STESSI id.
    await prisma.product.create({
      data: {
        id: prodotto.id,
        tenantId: IDS.tenantA,
        name: prodotto.name,
        articleCode: prodotto.articleCode,
        catalogOrigin: 'shopify',
        shopifyCatalogLinkKind: 'imported',
        shopifyProductId: String(remoto.id),
        shopifyTitle: prodotto.shopifyTitle,
        variants: {
          create: varianti.map((v) => ({
            id: v.id,
            tenantId: IDS.tenantA,
            sku: v.sku,
            optionValues: v.optionValues as never,
            sellingPriceMinor: v.sellingPriceMinor,
            shopifyVariantId: v.shopifyVariantId,
            shopifyInventoryItemId: v.shopifyInventoryItemId,
          })),
        },
      },
    });
    negozio.modifica(remoto.id, { title: 'Titolo dopo il ritorno' });

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remoto.id) as never,
    );

    expect(esito).toBe('skipped');
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopo.shopifyTitle).toBe(prodotto.shopifyTitle);
    const righe = await righeRegistro();
    expect(righe).toHaveLength(1);
    expect(righe[0]!.detail).toMatch(/^identita_eliminata: /);
  });

  it('E3 · UNA variante esclusa, prodotto valido: le SORELLE si aggiornano, lei no', async () => {
    const remoto = seminaDue('E3');
    const prodotto = await importaEProduci(remoto.id);
    const esclusa = prodotto.variants[0]!;
    const sorella = prodotto.variants[1]!;
    await chiudiVariante(esclusa.id);
    negozio.modifica(remoto.id, {
      title: 'Titolo nuovo',
      variante: { id: Number(esclusa.shopifyVariantId), barcode: '8009999999991' },
    });
    negozio.modifica(remoto.id, {
      variante: { id: Number(sorella.shopifyVariantId), barcode: '8009999999992' },
    });

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remoto.id) as never,
    );

    // ⭐ Il rifiuto è PER VARIANTE: il prodotto e la sorella si aggiornano.
    expect(esito).toBe('updated');
    const dopo = await prisma.product.findUniqueOrThrow({
      where: { id: prodotto.id },
      include: { variants: true },
    });
    expect(dopo.shopifyTitle).toBe('Titolo nuovo');
    expect(dopo.variants.find((v) => v.id === sorella.id)!.barcode).toBe('8009999999992');
    // ⛔ La esclusa NON riceve il proprio aggiornamento.
    expect(dopo.variants.find((v) => v.id === esclusa.id)!.barcode).toBe(esclusa.barcode);
    const righe = await righeRegistro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      remoteGid: `gid://shopify/ProductVariant/${esclusa.shopifyVariantId}`,
    });
  });

  // ── 2 · PUSH, cache PRESENTE ─────────────────────────────────────────────

  it('E4 · PUSH con collegamento chiuso: nessuna scrittura remota, esito FALLITO con motivo', async () => {
    const remoto = seminaDue('E4');
    const prodotto = await importaEProduci(remoto.id);
    await chiudiCollegamento(prodotto.id);
    const remotoPrima = negozio.prodotto(remoto.id);
    negozio.azzeraChiamate();

    const esito = await creaPush().pushProduct(IDS.tenantA, prodotto.id);

    // ⛔ Nessun aggiornamento remoto attraverso quel collegamento.
    expect(esito.pushed).toBe(false);
    expect(negozio.prodotto(remoto.id)).toEqual(remotoPrima);
    expect(negozio.chiamate.get('updateProductCatalog') ?? 0).toBe(0);
    expect(negozio.chiamate.get('bulkUpdateVariants') ?? 0).toBe(0);
    expect(negozio.chiamate.get('createProduct') ?? 0).toBe(0);
    // ⭐ Il motivo è visibile sul prodotto (§8.9.4) e registrato (§10.3).
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopo.shopifySyncStatus).not.toBe('synced');
    expect(dopo.shopifyLastError).toMatch(/collegamento/i);
    const righe = await righeRegistro();
    expect(righe.some((r) => r.actor === PlatformAuditActor.push)).toBe(true);
  });

  it('E5 · PUSH con una variante esclusa: le sorelle arrivano, l esito è PARZIALE', async () => {
    const remoto = seminaDue('E5');
    const prodotto = await importaEProduci(remoto.id);
    const esclusa = prodotto.variants[0]!;
    const sorella = prodotto.variants[1]!;
    await chiudiVariante(esclusa.id);
    // Una modifica locale su entrambe: solo la sorella deve arrivare.
    await prisma.productVariant.update({
      where: { id: esclusa.id },
      data: { shopifyPriceMinor: 9999 },
    });
    await prisma.productVariant.update({
      where: { id: sorella.id },
      data: { shopifyPriceMinor: 8888 },
    });

    const esito = await creaPush().pushProduct(IDS.tenantA, prodotto.id);

    const remotoDopo = negozio.prodotto(remoto.id);
    const remotaEsclusa = remotoDopo.variants.find(
      (v) => v.id === Number(esclusa.shopifyVariantId),
    )!;
    const remotaSorella = remotoDopo.variants.find(
      (v) => v.id === Number(sorella.shopifyVariantId),
    )!;
    // ⭐ La sorella è arrivata, l'esclusa no.
    expect(remotaSorella.price).toBe('88.88');
    expect(remotaEsclusa.price).toBe('10.00');
    // ⛔ 26.2 · l'esito dice la verità: NON è «tutto sincronizzato».
    expect(esito.pushed).toBe(false);
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopo.shopifySyncStatus).not.toBe('synced');
    // ⭐ Le varianti escluse sono riconoscibili, col motivo.
    expect(dopo.shopifyLastError).toContain(esclusa.sku!);
    expect(dopo.shopifyLastError).toMatch(/collegamento/i);
  });

  // ── 3 · PUSH, cache ASSENTE ──────────────────────────────────────────────

  it('E6 · PUSH senza cache: il candidato vietato NON si abbina, e NON se ne abbina un altro', async () => {
    const remoto = seminaDue('E6');
    const prodotto = await importaEProduci(remoto.id);
    const esclusa = prodotto.variants[0]!;
    const gidVietato = esclusa.shopifyVariantId!;
    await chiudiVariante(esclusa.id);
    // ⚠️ La cache azzerata è ciò che un ripristino produce, o l'allineamento
    //    stesso del rimedio: la variante è «orfana» per il push.
    await prisma.productVariant.update({
      where: { id: esclusa.id },
      data: { shopifyVariantId: null, shopifyInventoryItemId: null },
    });

    await creaPush().pushProduct(IDS.tenantA, prodotto.id);

    const dopo = await prisma.productVariant.findUniqueOrThrow({ where: { id: esclusa.id } });
    // ⛔ La cache NON viene rimessa sul GID vietato.
    expect(dopo.shopifyVariantId).toBeNull();
    // ⛔ E NON si ripiega su un altro candidato: la sorella ha barcode e opzioni
    //    diversi, ma la regola non dipende da questo — un candidato scartato non
    //    autorizza ad abbinarne un altro per barcode o opzioni.
    expect(dopo.shopifyVariantId).not.toBe(esclusa.shopifyVariantId);
    const sorella = await prisma.productVariant.findUniqueOrThrow({
      where: { id: prodotto.variants[1]!.id },
    });
    expect(sorella.shopifyVariantId).toBe(prodotto.variants[1]!.shopifyVariantId);
    // ⭐ Lo storico resta com'era: nessun periodo riaperto.
    const identita = await prisma.shopifyVariantIdentity.findFirstOrThrow({
      where: { shopifyVariantGid: `gid://shopify/ProductVariant/${gidVietato}` },
      include: { periodi: true },
    });
    expect(identita.periodi.map((p) => p.status)).toEqual(['unlinked']);
  });

  it('E6-bis · il candidato vietato si scarta DOPO la scelta: nessun ripiego su un altro', async () => {
    // ⛔ **La prova che distingue il filtro giusto da quello sbagliato.** Il
    //    candidato vietato si trova per SKU; accanto ce n'è un altro, libero,
    //    che porta il BARCODE della variante esclusa. Filtrando prima del
    //    matcher, `matchOrphanVariants` ripiegherebbe su quello — in silenzio,
    //    e agganciando la variante sbagliata.
    const remoto = seminaDue('E6B');
    const prodotto = await importaEProduci(remoto.id);
    const esclusa = prodotto.variants.find(
      (v) => v.shopifyVariantId === String(remoto.variants[0]!.id),
    )!;
    const sorella = prodotto.variants.find((v) => v.id !== esclusa.id)!;
    await chiudiVariante(esclusa.id);
    await prisma.productVariant.update({
      where: { id: esclusa.id },
      data: { shopifyVariantId: null, shopifyInventoryItemId: null },
    });
    // ⚠️ Il secondo candidato, LIBERO (nessuna riga locale lo porta in cache) e
    //    con lo stesso barcode della variante esclusa.
    const alternativo = negozio
      .modifica(remoto.id, {
        nuovaVariante: {
          sku: 'E6B-ALTRO',
          barcode: esclusa.barcode!,
          price: '10.00',
          valori: ['XL'],
        },
      })
      .variants.at(-1)!;
    // Una modifica locale sulla sorella: deve arrivare lo stesso.
    await prisma.productVariant.update({
      where: { id: sorella.id },
      data: { shopifyPriceMinor: 7777 },
    });
    negozio.azzeraChiamate();

    const esito = await creaPush().pushProduct(IDS.tenantA, prodotto.id);

    // ⛔ 1 · nessun riabbinamento alternativo: né il GID vietato né quello libero.
    const dopo = await prisma.productVariant.findUniqueOrThrow({ where: { id: esclusa.id } });
    expect(dopo.shopifyVariantId).toBeNull();
    expect(
      await prisma.productVariant.count({
        where: { tenantId: IDS.tenantA, shopifyVariantId: String(alternativo.id) },
      }),
    ).toBe(0);
    // ⭐ 2 · il rifiuto è registrato, e nomina il GID VIETATO — non l'alternativo.
    const righe = await righeRegistro();
    expect(righe).toHaveLength(1);
    expect(righe[0]).toMatchObject({
      operation: 'riaggancio_rifiutato',
      actor: PlatformAuditActor.push,
      remoteGid: `gid://shopify/ProductVariant/${remoto.variants[0]!.id}`,
    });
    // ⭐ 3 · la sorella consentita è arrivata.
    const remotoDopo = negozio.prodotto(remoto.id);
    expect(
      remotoDopo.variants.find((v) => v.id === Number(sorella.shopifyVariantId))!.price,
    ).toBe('77.77');
    // ⭐ 4 · e l'esito è PARZIALE, non un fallimento e non un completamento.
    //    ⚠️ È questa riga che resta rossa anche se, spostando il filtro prima
    //       del matcher, il push finisse in errore invece che sulla variante
    //       sbagliata: `parziale` non è né `fallito` né `completato`.
    expect(esito.outcome).toBe('parziale');
    expect(esito.pushed).toBe(false);
    const scheda = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(scheda.shopifySyncStatus).not.toBe('synced');
    expect(scheda.shopifyLastError).toContain(esclusa.sku!);
  });

  it('E13 · il COSTO che non arriva non fa un push completato (26.2)', async () => {
    // ⛔ **Il costo è una scrittura remota come le altre.** `pushVariantCosts`
    //    la protegge con un try/catch per variante — giusto, così le altre
    //    partono — ma il fallimento restava in un `logger.warn`: il lavoro
    //    dichiarava `completato` e il prodotto finiva `synced`.
    const remoto = seminaDue('E13');
    const prodotto = await importaEProduci(remoto.id);
    await prisma.product.update({
      where: { id: prodotto.id },
      data: { shopifyTitle: 'Titolo che deve arrivare' },
    });
    negozio.azzeraChiamate();
    negozio.guastaProssima('updateInventoryItemCost');

    const esito = await creaPush().pushProduct(IDS.tenantA, prodotto.id);

    // ⭐ 1 · ciò che è arrivato RESTA RICONOSCIUTO: il catalogo è stato scritto.
    expect(negozio.prodotto(remoto.id).title).toBe('Titolo che deve arrivare');
    expect(negozio.chiamate.get('updateProductCatalog') ?? 0).toBe(1);
    expect(negozio.chiamate.get('bulkUpdateVariants') ?? 0).toBe(1);
    // ⭐ 2 · e le ALTRE varianti hanno avuto il loro costo: il guasto è di una sola.
    expect(negozio.chiamate.get('updateInventoryItemCost') ?? 0).toBe(2);
    // ⛔ 3 · ciò che è fallito RESTA VISIBILE: niente completamento, niente `synced`.
    expect(esito.outcome).toBe('parziale');
    expect(esito.pushed).toBe(false);
    const scheda = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(scheda.shopifySyncStatus).not.toBe('synced');
    expect(scheda.shopifyLastError).toMatch(/costo/i);
    // ⭐ Il messaggio nomina la variante GIUSTA: quella del primo tentativo, che
    //    è quello guastato. Il simulatore registra gli argomenti prima di
    //    lanciare, così la prova non deve indovinare l'ordine delle righe.
    const caduta = prodotto.variants.find(
      (v) => v.shopifyInventoryItemId === negozio.costiMandati[0]!.inventoryItemId,
    )!;
    expect(scheda.shopifyLastError).toContain(caduta.sku!);
    // ⚠️ Non è un'esclusione dello storico: il motivo dichiarato è tecnico.
    expect(esito.reason).toBe('shopify_error');
  });

  it('E7 · PUSH di un prodotto con storia chiusa e senza cache: NESSUNA creazione remota', async () => {
    const remoto = seminaDue('E7');
    const prodotto = await importaEProduci(remoto.id);
    await chiudiCollegamento(prodotto.id);
    await prisma.productVariant.updateMany({
      where: { productId: prodotto.id },
      data: { shopifyVariantId: null, shopifyInventoryItemId: null },
    });
    await prisma.product.update({
      where: { id: prodotto.id },
      data: { shopifyProductId: null },
    });
    const remotiPrima = negozio.prodotti.size;

    const esito = await creaPush().pushProduct(IDS.tenantA, prodotto.id);

    // ⛔ Il push ordinario non ripubblica: la ripubblicazione è un comando
    //    esplicito (§11.9), e qui non è stato dato.
    expect(esito.pushed).toBe(false);
    expect(negozio.prodotti.size).toBe(remotiPrima);
    expect(negozio.chiamate.get('createProduct') ?? 0).toBe(0);
    // ⭐ Nessuna identità nuova, nessun periodo attivo.
    expect(
      await prisma.shopifyProductIdentity.count({ where: { originalProductId: prodotto.id } }),
    ).toBe(1);
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(0);
  });

  // ── 4 · i LIMITI: ciò che NON deve essere bloccato ───────────────────────

  it('E8 · storico VECCHIO chiuso e collegamento ATTUALE valido su un altro GID: tutto passa', async () => {
    const vecchio = seminaDue('E8-vecchio');
    const prodotto = await importaEProduci(vecchio.id);
    await chiudiCollegamento(prodotto.id);
    // ⚠️ Lo stesso articolo viene collegato a un GID NUOVO, valido: è il caso
    //    che un rimedio scritto «per anagrafica» invece che «per GID»
    //    bloccherebbe per sempre.
    const nuovo = seminaDue('E8-nuovo');
    await prisma.product.update({
      where: { id: prodotto.id },
      data: { shopifyProductId: String(nuovo.id) },
    });
    await prisma.$transaction(async (tx) => {
      const identita = await tx.shopifyProductIdentity.create({
        data: {
          tenantId: IDS.tenantA,
          shopId,
          shopifyProductGid: `gid://shopify/Product/${nuovo.id}`,
          originalProductId: prodotto.id,
          productId: prodotto.id,
        },
      });
      await tx.shopifyProductLink.create({
        data: { tenantId: IDS.tenantA, identityId: identita.id, originalProductId: prodotto.id },
      });
    });
    negozio.modifica(nuovo.id, { title: 'Titolo sul collegamento nuovo' });

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(nuovo.id) as never,
    );

    // ⭐ Il collegamento attuale è valido: l'aggiornamento passa.
    expect(esito).toBe('updated');
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopo.shopifyTitle).toBe('Titolo sul collegamento nuovo');
    // ⭐ E il push scrive sul GID nuovo, non su quello chiuso.
    negozio.azzeraChiamate();
    const push = await creaPush().pushProduct(IDS.tenantA, prodotto.id);
    // ⭐ **Il collegamento del PRODOTTO non è bloccato**: è questo il limite che
    //    E8 tiene fermo. Un rimedio scritto «per anagrafica» risponderebbe qui
    //    `rifiutato`, e l'articolo non si sincronizzerebbe mai più.
    expect(push.outcome).not.toBe('rifiutato');
    expect(negozio.chiamate.get('updateProductCatalog') ?? 0).toBe(1);
    // ⭐ La scrittura è andata sul GID NUOVO, e il vecchio non è stato toccato.
    expect(negozio.prodotto(nuovo.id).title).not.toBe('E8-nuovo');
    expect(negozio.prodotto(vecchio.id).title).toBe('E8-vecchio');
    // ⚠️ **L'esito è `parziale`, e non è un difetto**: l'articolo si porta
    //    dietro le due varianti del collegamento VECCHIO, con la cache che
    //    punta ancora ai GID chiusi. Quelle restano escluse — è esattamente ciò
    //    che 26.7 chiede — mentre il prodotto e le varianti del collegamento
    //    nuovo passano. `parziale` è la risposta vera; `completato` sarebbe la
    //    bugia di 26.2, e `rifiutato` il difetto che questa prova esclude.
    expect(push.outcome).toBe('parziale');
    expect(push.detail).toMatch(/collegamento/i);
  });

  it('E9 · articolo MAI collegato: il push lo crea come sempre', async () => {
    const creato = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Mai collegato',
        articleCode: 'MAI-1',
        shopifySyncEnabled: true,
        variants: {
          create: [
            {
              tenantId: IDS.tenantA,
              sku: 'MAI-1-M',
              optionValues: { Taglia: 'M' },
              sellingPriceMinor: 2500,
            },
          ],
        },
      },
    });
    const remotiPrima = negozio.prodotti.size;

    const esito = await creaPush().pushProduct(IDS.tenantA, creato.id);

    // ⭐ Nessuno storico non significa esclusione: la prima pubblicazione passa.
    expect(esito.pushed).toBe(true);
    expect(negozio.prodotti.size).toBe(remotiPrima + 1);
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: creato.id } });
    expect(dopo.shopifyProductId).not.toBeNull();
    expect(
      await prisma.shopifyProductIdentity.count({ where: { originalProductId: creato.id } }),
    ).toBe(1);
  });

  it('E10 · connessione NON migrata (nessun negozio): import e push restano quelli di prima', async () => {
    // ⚠️ Senza `shopId` non c'è storico da interrogare: il passaggio graduale di
    //    B2 non deve diventare un'esclusione.
    const remoto = seminaDue('E10');
    const prodotto = await importaEProduci(remoto.id);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
        IDS.tenantA,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_variant_links WHERE tenant_id = $1::uuid`,
        IDS.tenantA,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_product_links WHERE tenant_id = $1::uuid`,
        IDS.tenantA,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_variant_identities WHERE tenant_id = $1::uuid`,
        IDS.tenantA,
      );
      await tx.$executeRawUnsafe(
        `DELETE FROM shopify_product_identities WHERE tenant_id = $1::uuid`,
        IDS.tenantA,
      );
    });
    await prisma.shopifyConnection.update({
      where: { tenantId: IDS.tenantA },
      data: { shopId: null },
    });
    await prisma.shopifyShop.deleteMany({ where: { tenantId: IDS.tenantA } });
    negozio.modifica(remoto.id, { title: 'Titolo senza storico' });

    const esito = await creaImport().importProductFromWebhook(
      IDS.tenantA,
      negozio.webhook(remoto.id) as never,
    );

    expect(esito).toBe('updated');
    const dopo = await prisma.product.findUniqueOrThrow({ where: { id: prodotto.id } });
    expect(dopo.shopifyTitle).toBe('Titolo senza storico');
    const push = await creaPush().pushProduct(IDS.tenantA, prodotto.id);
    expect(push.pushed).toBe(true);
    expect(await righeRegistro()).toHaveLength(0);
  });

  // ── 5 · l'allineamento delle cache, che il RIPRISTINO esegue ─────────────

  it('E11 · le cache che lo storico non autorizza si azzerano; le valide restano', async () => {
    // ⭐ Tre condizioni, come nelle guardie: collegamento chiuso, identità
    //    eliminata, GID di un altro. Qui si costruisce la prima e la terza.
    const chiuso = seminaDue('E11-chiuso');
    const valido = seminaDue('E11-valido');
    const pChiuso = await importaEProduci(chiuso.id);
    const pValido = await importaEProduci(valido.id);
    await chiudiCollegamento(pChiuso.id);
    // ⚠️ Un articolo con una cache che punta a un GID SENZA storico: è la
    //    connessione non ancora migrata, e non va toccata.
    const senzaStoria = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Cache senza storia',
        articleCode: 'E11-SENZA',
        catalogOrigin: 'shopify',
        shopifyCatalogLinkKind: 'imported',
        shopifyProductId: '999999999',
      },
    });

    const esito = await prisma.$transaction((tx) => allineaCacheIncoerenti(tx, IDS.tenantA));

    // ⛔ Il collegamento chiuso: cache azzerata, prodotto e varianti.
    expect(esito.prodotti).toBe(1);
    expect(esito.varianti).toBe(2);
    const dopoChiuso = await prisma.product.findUniqueOrThrow({
      where: { id: pChiuso.id },
      include: { variants: true },
    });
    expect(dopoChiuso.shopifyProductId).toBeNull();
    expect(dopoChiuso.variants.every((v) => v.shopifyVariantId === null)).toBe(true);
    expect(dopoChiuso.variants.every((v) => v.shopifyInventoryItemId === null)).toBe(true);
    // ⭐ Il collegamento valido non è stato toccato.
    const dopoValido = await prisma.product.findUniqueOrThrow({
      where: { id: pValido.id },
      include: { variants: true },
    });
    expect(dopoValido.shopifyProductId).toBe(String(valido.id));
    expect(dopoValido.variants.every((v) => v.shopifyVariantId !== null)).toBe(true);
    // ⭐ E nemmeno la cache senza storia: assenza di storico non è esclusione.
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: senzaStoria.id } }))
        .shopifyProductId,
    ).toBe('999999999');
    // ⛔ E lo storico resta com'era: allineare la cache non chiude né riapre niente.
    expect(await prisma.shopifyProductLink.count({ where: { status: 'active' } })).toBe(1);
  });

  // ── 6 · 26.8 · le QUANTITÀ passano dallo storico come tutto il resto ─────

  /**
   * ⛔ **Il difetto che questa sezione chiude.** Fino al 09/09/2026
   *    `pushLevel` risolveva l'articolo di inventario dalla colonna-cache — o
   *    andava a leggerlo su Shopify partendo dal GID di variante — senza
   *    chiedere niente allo storico: una variante col periodo chiuso e la
   *    cache conservata riceveva comunque la quantità. `E14` lo misurava e lo
   *    lasciava aperto, perché quel mandato chiedeva la verifica e non
   *    l'intervento.
   *
   * ⭐ **Adesso `E14` è la prova del comportamento corretto**, e le altre
   *    tengono ferme le due metà del requisito: **non parte ciò che è
   *    vietato**, e **continua a partire ciò che è consentito**.
   */
  describe('il push delle quantità e lo storico (26.8)', () => {
    const SEDE_REMOTA = '77001';

    beforeEach(async () => {
      // ⛔ **`shopify_inventory_sync_states` NON viene svuotata dal `TRUNCATE …
      //    CASCADE` della fixture, e la causa è MISURATA**: la tabella non ha
      //    nessuna chiave esterna nel database — solo la primaria — mentre lo
      //    schema Prisma ne dichiara tre (tenant, variante, sede). La migration
      //    che la crea (`20260713140000_shopify_inventory_sync_state`) non le
      //    scrive. Senza FK il CASCADE non la raggiunge, e le righe di una
      //    prova sopravvivono a quella dopo.
      //
      // ⚠️ Questa cancellazione è quindi un CONTENIMENTO dichiarato, non una
      //    pulizia silenziosa: la deriva fra schema e database è registrata in
      //    `docs/DA-FARE` e non è stata corretta qui.
      await prisma.shopifyInventorySyncState.deleteMany({});
      await prisma.shopifyConnection.update({
        where: { tenantId: IDS.tenantA },
        data: { scopes: ['read_products', 'write_products', 'write_inventory'] },
      });
      await prisma.location.update({
        where: { id: IDS.locA1 },
        data: { shopifyLocationId: SEDE_REMOTA },
      });
    });

    /** Il servizio vero, con storico e registro veri. */
    function creaInventario() {
      return new ShopifyInventoryPushService(
        prisma as never,
        negozio.oauth() as never,
        negozio.admin() as never,
        { touchSync: vi.fn() } as never,
        new ShopifyInventoryReconciliationService(prisma as never),
        storico,
        registro,
      );
    }

    /** Una giacenza coerente: 7 − 2 = 5. */
    async function giacenza(variantId: string, onHand = 7, committed = 2): Promise<void> {
      await prisma.inventoryLevel.create({
        data: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA1,
          onHand,
          committed,
          available: onHand - committed,
        },
      });
    }

    async function statiSync() {
      return prisma.shopifyInventorySyncState.findMany({ where: { tenantId: IDS.tenantA } });
    }

    it('E14 · collegamento CHIUSO con la cache presente: nessun invio, rifiuto registrato', async () => {
      const remoto = seminaDue('E14');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await chiudiVariante(variante.id);
      expect(variante.shopifyInventoryItemId).not.toBeNull();
      await giacenza(variante.id);
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      // ⛔ 1 · nessun invio, e NESSUNO ZERO al posto del rifiuto.
      expect(esito.pushed).toBe(false);
      expect(esito.reason).toBe('collegamento_escluso');
      expect(negozio.chiamate.get('setInventoryAvailable') ?? 0).toBe(0);
      expect(negozio.quantitaMandate).toEqual([]);
      // ⛔ 2 · nessun «ultimo invio riuscito»: il canale non è stato toccato.
      expect(await statiSync()).toEqual([]);
      // ⭐ 3 · il rifiuto è registrato, con attore `push` e il GID di variante.
      const righe = await righeRegistro();
      expect(righe).toHaveLength(1);
      expect(righe[0]).toMatchObject({
        operation: 'riaggancio_rifiutato',
        outcome: 'rifiutata',
        actor: PlatformAuditActor.push,
        remoteGid: `gid://shopify/ProductVariant/${variante.shopifyVariantId}`,
      });
      expect(righe[0]!.detail).toMatch(/^collegamento_chiuso: /);
    });

    it('E15 · identità ELIMINATA con la cache presente: stesso rifiuto, motivo diverso', async () => {
      const remoto = seminaDue('E15');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await giacenza(variante.id);
      // L'identità della variante viene esclusa definitivamente, come fa il
      // percorso di eliminazione: la riga locale resta, con la sua cache.
      await prisma.$executeRawUnsafe(
        `UPDATE shopify_variant_links l
            SET status = 'unlinked', close_reason = 'local_delete',
                closed_at = GREATEST(now(), linked_at), updated_at = now()
           FROM shopify_variant_identities i
          WHERE l.identity_id = i.id AND i.variant_id = $1::uuid AND l.status = 'active'`,
        variante.id,
      );
      // ⚠️ `variant_id` e `product_id` si azzerano INSIEME: lo esige il CHECK
      //    `shopify_variant_identities_riferimenti_insieme`.
      await prisma.$executeRawUnsafe(
        `UPDATE shopify_variant_identities
            SET local_deleted_at = now(), variant_id = NULL, product_id = NULL, updated_at = now()
          WHERE variant_id = $1::uuid`,
        variante.id,
      );
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      expect(esito.reason).toBe('collegamento_escluso');
      expect(negozio.chiamate.get('setInventoryAvailable') ?? 0).toBe(0);
      expect(await statiSync()).toEqual([]);
      expect((await righeRegistro())[0]!.detail).toMatch(/^identita_eliminata: /);
    });

    it('E16 · ⭐ il collegamento VALIDO continua a sincronizzare', async () => {
      // ⚠️ **La metà del requisito che una guardia troppo larga romperebbe.**
      //    Non basta che non parta ciò che è vietato: deve partire ciò che è
      //    consentito, con il numero giusto e con l'anti-loop registrato.
      const remoto = seminaDue('E16');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await giacenza(variante.id);
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      expect(esito).toMatchObject({ pushed: true, publishableAvailable: 5 });
      expect(negozio.quantitaMandate).toEqual([
        {
          inventoryItemId: variante.shopifyInventoryItemId,
          locationId: SEDE_REMOTA,
          available: 5,
        },
      ]);
      // ⭐ E l'«ultimo invio riuscito» c'è: serve all'anti-loop del webhook.
      const stati = await statiSync();
      expect(stati).toHaveLength(1);
      expect(stati[0]!.lastPushedAvailable).toBe(5);
      expect(await righeRegistro()).toHaveLength(0);
    });

    it('E17 · ⭐ la SORELLA valida parte anche se la vicina è esclusa', async () => {
      // Il rifiuto è per variante anche qui: escludere una non ferma le altre.
      const remoto = seminaDue('E17');
      const prodotto = await importaEProduci(remoto.id);
      const esclusa = prodotto.variants[0]!;
      const sorella = prodotto.variants[1]!;
      await chiudiVariante(esclusa.id);
      await giacenza(esclusa.id);
      await giacenza(sorella.id, 9, 1);
      negozio.azzeraChiamate();

      const inventario = creaInventario();
      const rifiutata = await inventario.pushLevel(IDS.tenantA, esclusa.id, IDS.locA1);
      const passata = await inventario.pushLevel(IDS.tenantA, sorella.id, IDS.locA1);

      expect(rifiutata.reason).toBe('collegamento_escluso');
      expect(passata.pushed).toBe(true);
      expect(negozio.quantitaMandate).toEqual([
        {
          inventoryItemId: sorella.shopifyInventoryItemId,
          locationId: SEDE_REMOTA,
          available: 8,
        },
      ]);
    });

    it('E18 · ⭐ LIMITE · uno storico VECCHIO chiuso non blocca il collegamento ATTUALE', async () => {
      // ⚠️ La domanda si fa sul GID, non sull'anagrafica: la stessa variante
      //    locale, ricollegata a un GID nuovo e valido, deve tornare a partire.
      const remoto = seminaDue('E18');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      const gidVecchio = variante.shopifyVariantId!;
      await chiudiVariante(variante.id);
      await giacenza(variante.id);

      // Il collegamento NUOVO, su un altro GID, con il suo periodo attivo.
      const nuovoGid = '995500';
      const identitaProdotto = await prisma.shopifyProductIdentity.findFirstOrThrow({
        where: { originalProductId: prodotto.id },
      });
      // ⚠️ Il periodo della variante esige il periodo PADRE attivo: qui il
      //    prodotto non è stato chiuso, quindi il suo periodo c'è ed è quello.
      const periodoPadre = await prisma.shopifyProductLink.findFirstOrThrow({
        where: { identityId: identitaProdotto.id, status: 'active' },
      });
      await prisma.$transaction(async (tx) => {
        const identita = await tx.shopifyVariantIdentity.create({
          data: {
            tenantId: IDS.tenantA,
            shopId,
            productIdentityId: identitaProdotto.id,
            shopifyVariantGid: `gid://shopify/ProductVariant/${nuovoGid}`,
            shopifyInventoryItemGid: `gid://shopify/InventoryItem/${nuovoGid}9`,
            originalVariantId: variante.id,
            originalProductId: prodotto.id,
            variantId: variante.id,
            productId: prodotto.id,
          },
        });
        await tx.shopifyVariantLink.create({
          data: {
            tenantId: IDS.tenantA,
            identityId: identita.id,
            originalVariantId: variante.id,
            productLinkId: periodoPadre.id,
          },
        });
      });
      await prisma.productVariant.update({
        where: { id: variante.id },
        data: { shopifyVariantId: nuovoGid, shopifyInventoryItemId: `${nuovoGid}9` },
      });
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      // ⭐ Passa: il GID vecchio è chiuso, quello attuale no.
      expect(esito.pushed).toBe(true);
      expect(negozio.quantitaMandate).toEqual([
        { inventoryItemId: `${nuovoGid}9`, locationId: SEDE_REMOTA, available: 5 },
      ]);
      expect(await righeRegistro()).toHaveLength(0);
      // ⛔ E il GID vecchio resta chiuso: nessuna riapertura.
      const vecchia = await prisma.shopifyVariantIdentity.findFirstOrThrow({
        where: { shopifyVariantGid: `gid://shopify/ProductVariant/${gidVecchio}` },
        include: { periodi: true },
      });
      expect(vecchia.periodi.map((p) => p.status)).toEqual(['unlinked']);
    });

    it('E19 · ⭐ LIMITE · connessione NON migrata: la quantità parte come prima', async () => {
      const remoto = seminaDue('E19');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await giacenza(variante.id);
      // Si toglie il negozio identificato: è la connessione preesistente.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('vestiflow.cancellazione_tenant', $1, true)`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM shopify_variant_links WHERE tenant_id = $1::uuid`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM shopify_product_links WHERE tenant_id = $1::uuid`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM shopify_variant_identities WHERE tenant_id = $1::uuid`,
          IDS.tenantA,
        );
        await tx.$executeRawUnsafe(
          `DELETE FROM shopify_product_identities WHERE tenant_id = $1::uuid`,
          IDS.tenantA,
        );
      });
      await prisma.shopifyConnection.update({
        where: { tenantId: IDS.tenantA },
        data: { shopId: null },
      });
      await prisma.shopifyShop.deleteMany({ where: { tenantId: IDS.tenantA } });
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      expect(esito.pushed).toBe(true);
      expect(negozio.quantitaMandate).toHaveLength(1);
      expect(await righeRegistro()).toHaveLength(0);
    });

    it('E20 · identificativi MANCANTI: non è un rifiuto dello storico', async () => {
      // ⚠️ Una variante senza identificativi remoti non è «esclusa»: non è
      //    collegata. La distinzione conta, perché i due casi si leggono
      //    diversamente e solo uno dei due va registrato.
      const remoto = seminaDue('E20');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await giacenza(variante.id);
      await prisma.productVariant.update({
        where: { id: variante.id },
        data: { shopifyVariantId: null, shopifyInventoryItemId: null },
      });
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      expect(esito).toEqual({ pushed: false, reason: 'variant_not_linked' });
      expect(negozio.chiamate.get('setInventoryAvailable') ?? 0).toBe(0);
      expect(await righeRegistro()).toHaveLength(0);
    });

    it('E21 · ⚠️ articolo di inventario SENZA il GID di variante: rifiutato, perché non verificabile', async () => {
      // ⛔ **Stato che nessun percorso applicativo produce**: i due
      //    identificativi si scrivono e si azzerano sempre insieme. Costruito a
      //    mano per fissare la scelta: un identificativo remoto che lo storico
      //    non può confermare non si usa.
      const remoto = seminaDue('E21');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await giacenza(variante.id);
      await prisma.productVariant.update({
        where: { id: variante.id },
        data: { shopifyVariantId: null },
      });
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      expect(esito.reason).toBe('collegamento_escluso');
      expect(negozio.chiamate.get('setInventoryAvailable') ?? 0).toBe(0);
      expect((await righeRegistro())[0]!.detail).toMatch(/^collegamento_non_verificabile: /);
    });

    it('E22 · ISOLAMENTO · il collegamento chiuso di un tenant non tocca l altro', async () => {
      const remoto = seminaDue('E22');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await chiudiVariante(variante.id);
      await giacenza(variante.id);

      // Un secondo tenant, con il suo negozio e la sua variante collegata, che
      // per caso porta lo STESSO identificativo remoto.
      const negozioB = await prisma.shopifyShop.create({
        data: { tenantId: IDS.tenantB, shopGid: 'gid://shopify/Shop/993999' },
      });
      await prisma.shopifyConnection.create({
        data: {
          tenantId: IDS.tenantB,
          status: 'connected',
          shopDomain: 'altro.myshopify.com',
          shopId: negozioB.id,
          scopes: ['read_products', 'write_products', 'write_inventory'],
        },
      });
      await prisma.shopifyCredential.create({
        data: {
          tenantId: IDS.tenantB,
          shopDomain: 'altro.myshopify.com',
          accessTokenEnc: 'cifrato',
          scopes: ['write_inventory'],
        },
      });
      await prisma.location.update({
        where: { id: IDS.locB1 },
        data: { shopifyLocationId: '77002' },
      });
      const prodottoB = await prisma.product.create({
        data: {
          tenantId: IDS.tenantB,
          name: 'Articolo del tenant B',
          articleCode: 'E22-B',
          variants: {
            create: [
              {
                tenantId: IDS.tenantB,
                sku: 'E22-B-M',
                optionValues: { T: 'M' },
                sellingPriceMinor: 1000,
                shopifyVariantId: variante.shopifyVariantId,
                shopifyInventoryItemId: variante.shopifyInventoryItemId,
              },
            ],
          },
        },
        include: { variants: true },
      });
      const varianteB = prodottoB.variants[0]!;
      await prisma.inventoryLevel.create({
        data: {
          tenantId: IDS.tenantB,
          variantId: varianteB.id,
          locationId: IDS.locB1,
          onHand: 3,
          committed: 0,
          available: 3,
        },
      });
      negozio.azzeraChiamate();

      const inventario = creaInventario();
      const suA = await inventario.pushLevel(IDS.tenantA, variante.id, IDS.locA1);
      const suB = await inventario.pushLevel(IDS.tenantB, varianteB.id, IDS.locB1);

      // ⛔ A è escluso; ⭐ B non ha storico su quel GID nel PROPRIO negozio, e passa.
      expect(suA.reason).toBe('collegamento_escluso');
      expect(suB.pushed).toBe(true);
      expect(negozio.quantitaMandate).toEqual([
        {
          inventoryItemId: variante.shopifyInventoryItemId,
          locationId: '77002',
          available: 3,
        },
      ]);
      // ⭐ E il rifiuto è del solo tenant A.
      expect(await righeRegistro()).toHaveLength(1);
      expect(
        await prisma.platformAuditLog.count({ where: { tenantId: IDS.tenantB } }),
      ).toBe(0);
    });

    it('E24 · il rifiuto NON dipende dal fatto che la quantità sia invariata', async () => {
      // ⛔ **La risposta a «posso usare questo collegamento?» non può dipendere
      //    dalla storia dei push precedenti.** Se la guardia stesse dopo il
      //    controllo «invariata», lo stesso collegamento vietato risponderebbe
      //    `unchanged` o `collegamento_escluso` a seconda del caso — e la
      //    protezione sarebbe intermittente per costruzione.
      const remoto = seminaDue('E24');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await chiudiVariante(variante.id);
      await giacenza(variante.id);
      // Un «ultimo invio riuscito» pari al valore attuale: la strada per cui il
      // push si fermerebbe da solo, senza guardare lo storico.
      await prisma.shopifyInventorySyncState.create({
        data: {
          tenantId: IDS.tenantA,
          variantId: variante.id,
          locationId: IDS.locA1,
          lastPushedAvailable: 5,
          lastPushedAt: new Date(),
        },
      });
      negozio.azzeraChiamate();

      const esito = await creaInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      expect(esito.reason).toBe('collegamento_escluso');
      expect(negozio.chiamate.get('setInventoryAvailable') ?? 0).toBe(0);
      expect((await righeRegistro())).toHaveLength(1);
    });

    it('E23 · REGISTRO GUASTO · il rifiuto resta valido e l operazione locale non si annulla', async () => {
      // ⛔ **Qui non c'è nessuna transazione da far cadere.** Il push inventario
      //    è post-commit: la giacenza locale è stata scritta molto prima. Far
      //    risalire l'eccezione annullerebbe un'operazione locale riuscita per
      //    un guasto di tracciamento. Il rifiuto vale comunque, e la quantità
      //    non parte lo stesso.
      const remoto = seminaDue('E23');
      const prodotto = await importaEProduci(remoto.id);
      const variante = prodotto.variants[0]!;
      await chiudiVariante(variante.id);
      await giacenza(variante.id);
      negozio.azzeraChiamate();

      const registroRotto = {
        registraRifiuto: vi.fn().mockRejectedValue(new Error('registro non disponibile')),
      };
      const inventario = new ShopifyInventoryPushService(
        prisma as never,
        negozio.oauth() as never,
        negozio.admin() as never,
        { touchSync: vi.fn() } as never,
        new ShopifyInventoryReconciliationService(prisma as never),
        storico,
        registroRotto as never,
      );

      const esito = await inventario.pushLevel(IDS.tenantA, variante.id, IDS.locA1);

      // ⭐ Non solleva, e rifiuta lo stesso.
      expect(esito.reason).toBe('collegamento_escluso');
      expect(negozio.chiamate.get('setInventoryAvailable') ?? 0).toBe(0);
      expect(await statiSync()).toEqual([]);
      expect(registroRotto.registraRifiuto).toHaveBeenCalledTimes(1);
      // ⭐ E la giacenza locale è intatta: nessun percorso l'ha toccata.
      expect(
        await prisma.inventoryLevel.findUniqueOrThrow({
          where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
        }),
      ).toMatchObject({ onHand: 7, committed: 2, available: 5 });
    });
  });

  it('E12 · una cache che punta al GID di UN ALTRO articolo si azzera', async () => {
    const uno = seminaDue('E12-uno');
    const legittimo = await importaEProduci(uno.id);
    // ⚠️ SITUAZIONE COSTRUITA: un secondo articolo porta la cache del primo.
    await prisma.product.update({
      where: { id: legittimo.id },
      data: { shopifyProductId: null },
    });
    const abusivo = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: 'Cache altrui',
        articleCode: 'E12-ABUSIVO',
        catalogOrigin: 'shopify',
        shopifyCatalogLinkKind: 'imported',
        shopifyProductId: String(uno.id),
      },
    });

    const esito = await prisma.$transaction((tx) => allineaCacheIncoerenti(tx, IDS.tenantA));

    expect(esito.prodotti).toBe(1);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: abusivo.id } })).shopifyProductId,
    ).toBeNull();
    // ⭐ L'identità resta del legittimo: allineare non riassegna niente.
    const identita = await prisma.shopifyProductIdentity.findFirstOrThrow({
      where: { shopifyProductGid: `gid://shopify/Product/${uno.id}` },
    });
    expect(identita.originalProductId).toBe(legittimo.id);
  });
});
