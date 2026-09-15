import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Logger } from '@nestjs/common';
import { ShopifySetupDirection, ShopifySetupStatus, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BusinessAnalyticsService } from '../../analytics/business-analytics.service';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { CorrispettiviExportService } from '../../corrispettivi/corrispettivi-export.service';
import { CorrispettiviService } from '../../corrispettivi/corrispettivi.service';
import { OnlineOrderLifecycleService } from '../../order-reservations/online-order-lifecycle.service';
import { OnlineSaleFulfillmentService } from '../../order-reservations/online-sale-fulfillment.service';
import { SalesOrdersService } from '../../sales-orders/sales-orders.service';
import { StockReservationService } from '../../order-reservations/stock-reservation.service';
import { ShopifyConnectionService } from '../../shopify/shopify-connection.service';
import { ShopifyFulfillmentOrdersService } from '../../shopify/shopify-fulfillment-orders.service';
import { ShopifyInventoryAlignService } from '../../shopify/shopify-inventory-align.service';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyLocationLinkService } from '../../shopify/shopify-location-link.service';
import { ShopifyLocationSyncService } from '../../shopify/shopify-location-sync.service';
import { ShopifyMissingOrdersService } from '../../shopify/shopify-missing-orders.service';
import { resolveShopifyOrderLocationId } from '../../shopify/shopify-order-location.util';
import { ShopifyOrdersPullService } from '../../shopify/shopify-orders-pull.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ShopifyProductPushService } from '../../shopify/shopify-product-push.service';
import { ShopifySetupTransferService } from '../../shopify/shopify-setup-transfer.service';
import { ShopifySetupService } from '../../shopify/shopify-setup.service';
import { ShopifySyncService } from '../../shopify/shopify-sync.service';
import { archivioImmaginiFinto } from './archivio-immagini-finto';
import { ambienteIntegrazione } from './env';
import { testOwnerUser } from '../fixtures/user-profile.fixture';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione, creaContatoreQuery, type ContatoreQuery } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * ⭐ LA PRIMA CONNESSIONE COME L’HA DEFINITA IL PROPRIETARIO (12/09/2026, `docs/27`):
 *    direzione → sedi esplicite → anteprima e conferma → trasferimento, esiti,
 *    attivazione. Nessuno storico di ordini; i soli ordini ancora aperti
 *    diventano impegni; la base della sincronizzazione continua nasce
 *    all’attivazione col motore di Allinea; la ripresa rilegge e scrive solo la
 *    differenza; dopo l’attivazione gli ordini sono della sincronizzazione
 *    continua, e un’evasione arrivata senza impegno si scarica lo stesso.
 *
 * Servizi VERI su PostgreSQL 5433, negozio simulato: `NegozioSimulato` con
 * quantità, impegni, location e ordini. La finestra operativa (nessun
 * movimento durante la partenza) è una PRECONDIZIONE della procedura, non
 * una prova tecnica: qui la si rispetta; dove non la si rispetta (caso 5) si
 * mostra che cosa fa il programma.
 */
describe('Prima connessione — il percorso sui servizi reali', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;
  let collegamento: ShopifyLocationLinkService;
  let setup: ShopifySetupService;
  let transfer: ShopifySetupTransferService;
  let sync: ShopifySyncService;
  let ordersPull: ShopifyOrdersPullService;
  let inventoryPush: ShopifyInventoryPushService;
  let align: ShopifyInventoryAlignService;
  let webhookRegistrati: number;
  let contatore: ContatoreQuery;

  const DOMINIO = 'partenza.myshopify.com';
  const SEDE_REMOTA = '77101';

  beforeAll(() => {
    ambienteIntegrazione();
    const conteggio = creaContatoreQuery();
    contatore = conteggio.contatore;
    prisma = creaClientIntegrazione({ registraQuery: conteggio.registra });
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
    Logger.overrideLogger(false);
  });

  afterAll(async () => {
    await prisma.shopifyInventorySyncState.deleteMany({});
    await svuota(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.shopifyInventorySyncState.deleteMany({});
    await prisma.platformAuditLog.deleteMany({});
    webhookRegistrati = 0;

    negozio = new NegozioSimulato(DOMINIO, 995000);
    negozio.impostaLocation([{ id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true }]);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/995001' },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId: riga.id,
        scopes: ['read_products', 'write_products', 'write_inventory', 'read_orders'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products', 'write_inventory', 'read_orders'],
      },
    });
    await prisma.shopifySetup.create({
      data: { tenantId: IDS.tenantA, status: ShopifySetupStatus.scelte },
    });

    // ── I servizi veri, sul negozio simulato ─────────────────────────────────
    collegamento = new ShopifyLocationLinkService(prisma as never);
    const configStub = {
      requestedScopes: ['read_products', 'write_products', 'write_inventory', 'read_orders'],
      apiVersion: '2024-10',
      webhookUrl: 'https://vestiflow.test/webhooks',
      frontendUrl: 'https://vestiflow.test',
    };
    const connection = new ShopifyConnectionService(prisma as never, configStub as never);
    const oauth = {
      ...negozio.oauth(),
      resyncWebhooks: vi.fn(async () => {
        webhookRegistrati += 1;
        await connection.recordWebhooksActivated(IDS.tenantA, {
          topics: ['orders/create', 'orders/updated'],
          address: 'https://vestiflow.test/webhooks',
        });
      }),
    };
    const pull = new ShopifyProductPullService(
      prisma as never,
      oauth as never,
      configStub as never,
      negozio.admin() as never,
      connection as never,
      negozio.enrichment() as never,
      storico,
      registro,
      archivioImmaginiFinto() as never,
    );
    const push = new ShopifyProductPushService(
      prisma as never,
      oauth as never,
      negozio.admin() as never,
      connection as never,
      { resolveCategoryId: vi.fn().mockResolvedValue(null) } as never,
      { buildMetafields: vi.fn().mockResolvedValue([]) } as never,
      negozio.graphql() as never,
      storico,
      registro,
    );
    const reconciliation = new ShopifyInventoryReconciliationService(prisma as never);
    inventoryPush = new ShopifyInventoryPushService(
      prisma as never,
      oauth as never,
      negozio.admin() as never,
      negozio.graphql() as never,
      connection as never,
      reconciliation,
      storico,
      registro,
    );
    align = new ShopifyInventoryAlignService(prisma as never, inventoryPush as never);
    const impegni = new StockReservationService(prisma as never);
    const lifecycle = new OnlineOrderLifecycleService(
      prisma as never,
      impegni,
      new OnlineSaleFulfillmentService(impegni),
    );
    // ⭐ La sede degli ordini viene dai FULFILLMENT ORDER del negozio (13/09/2026).
    const fulfillmentOrders = new ShopifyFulfillmentOrdersService(
      prisma as never,
      oauth as never,
      negozio.graphql() as never,
      negozio.admin() as never,
    );
    sync = new ShopifySyncService(
      prisma as never,
      connection as never,
      pull,
      lifecycle,
      reconciliation,
      inventoryPush,
      storico,
      fulfillmentOrders,
    );
    ordersPull = new ShopifyOrdersPullService(
      prisma as never,
      configStub as never,
      connection as never,
      oauth as never,
      negozio.admin() as never,
      sync,
      new ShopifyMissingOrdersService(prisma as never, impegni, inventoryPush as never),
    );
    transfer = new ShopifySetupTransferService(
      prisma as never,
      oauth as never,
      negozio.graphql() as never,
      pull,
      push,
      align,
      collegamento,
    );
    setup = new ShopifySetupService(
      prisma as never,
      oauth as never,
      negozio.admin() as never,
      negozio.graphql() as never,
      connection as never,
      collegamento,
      transfer,
      ordersPull,
    );
  });

  // ── Attrezzi ────────────────────────────────────────────────────────────────

  async function livello(variantId: string) {
    return prisma.inventoryLevel.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
      select: { onHand: true, committed: true, available: true },
    });
  }

  async function varianteConSku(sku: string) {
    return prisma.productVariant.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, sku },
      select: { id: true, shopifyInventoryItemId: true, shopifyVariantId: true },
    });
  }

  /** Le tre fasi fino al trasferimento concluso. */
  async function percorsoFinoATrasferito(direction: ShopifySetupDirection) {
    await setup.scegliDirezione(IDS.tenantA, direction);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    const anteprima = await setup.anteprima(IDS.tenantA);
    expect(anteprima.anteprima?.blocchi).toEqual([]);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    const dopo = await setup.stato(IDS.tenantA);
    expect(dopo.status).toBe(ShopifySetupStatus.trasferito);
    expect(dopo.esito?.interruzione).toBeNull();
    return { anteprima, dopo };
  }

  async function articoloLocale(sku: string, giacenza: number) {
    const prodotto = await prisma.product.create({
      data: {
        tenantId: IDS.tenantA,
        name: `Articolo ${sku}`,
        articleCode: sku,
        shopifySyncEnabled: true,
      },
    });
    const variante = await prisma.productVariant.create({
      data: { tenantId: IDS.tenantA, productId: prodotto.id, sku, sellingPriceMinor: 1000 },
    });
    await prisma.inventoryLevel.create({
      data: {
        tenantId: IDS.tenantA,
        variantId: variante.id,
        locationId: IDS.locA1,
        onHand: giacenza,
        available: giacenza,
        committed: 0,
      },
    });
    return variante;
  }

  // ── 1 · Shopify → VestiFlow, senza ordini da acquisire ──────────────────────

  it('1 · S→V: catalogo importato, giacenza = on_hand di Shopify, nessun ordine acquisito, base stabilita, webhook solo all’attivazione', async () => {
    const remoto = negozio.semina({
      title: 'Maglia partenza',
      opzioni: [{ name: 'Taglia', values: ['M'] }],
      varianti: [{ sku: 'PART-1', barcode: null, price: '10.00', valori: ['M'] }],
    });
    const item = remoto.variants[0]!.inventory_item_id;
    negozio.impostaQuantitaRemota(String(item), SEDE_REMOTA, 7);

    const { anteprima, dopo } = await percorsoFinoATrasferito(
      ShopifySetupDirection.shopify_to_vestiflow,
    );
    expect(anteprima.anteprima?.ordini).toMatchObject({ aperti: 0, parziali: 0, senzaSede: 0 });
    expect(dopo.esito?.catalogo?.imported).toBe(1);
    expect(dopo.esito?.quantita).toMatchObject({ coppie: 1, scritte: 1, nonDeterminabili: 0 });
    expect(webhookRegistrati).toBe(0);

    const variante = await varianteConSku('PART-1');
    expect(await livello(variante.id)).toEqual({ onHand: 7, committed: 0, available: 7 });
    // Il movimento di base è tracciato, origine canale.
    const base = await prisma.stockMovement.findMany({
      where: { tenantId: IDS.tenantA, variantId: variante.id },
    });
    expect(base).toHaveLength(1);
    expect(base[0]?.externalRef).toContain('prima-connessione:');

    // L’attivazione: nessun ordine, la base della coppia nasce senza scrivere.
    const attivato = await setup.attiva(IDS.tenantA);
    expect(attivato.status).toBe(ShopifySetupStatus.attivato);
    expect(attivato.esito?.attivazione?.ordini).toMatchObject({ totale: 0, acquisiti: 0 });
    expect(attivato.esito?.attivazione?.base).toMatchObject({
      totale: 1,
      giaAllineate: 1,
      allineate: 0,
    });
    expect(webhookRegistrati).toBe(1);
    expect(await prisma.salesOrder.count({ where: { tenantId: IDS.tenantA } })).toBe(0);
    const stato = await prisma.shopifyInventorySyncState.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA1 },
    });
    expect(stato.lastPushedAvailable).toBe(7);
    expect(negozio.quantitaRemota(String(item), SEDE_REMOTA)).toBe(7);
  });

  // ── 2 · VestiFlow → Shopify ─────────────────────────────────────────────────

  it('2 · V→S: l’articolo sale su Shopify, la quantità pubblicata è quella di VestiFlow, la giacenza locale non si tocca', async () => {
    const variante = await articoloLocale('LOC-9', 4);

    const { dopo } = await percorsoFinoATrasferito(ShopifySetupDirection.vestiflow_to_shopify);
    expect(dopo.esito?.catalogo?.imported).toBe(1);
    expect(dopo.esito?.allinea).toMatchObject({ totale: 1, allineate: 1, nonAllineate: 0 });
    const collegata = await varianteConSku('LOC-9');
    expect(collegata.shopifyInventoryItemId).not.toBeNull();
    expect(negozio.quantitaRemota(collegata.shopifyInventoryItemId, SEDE_REMOTA)).toBe(4);
    expect(await livello(variante.id)).toEqual({ onHand: 4, committed: 0, available: 4 });

    const attivato = await setup.attiva(IDS.tenantA);
    expect(attivato.status).toBe(ShopifySetupStatus.attivato);
    // La base era già nata con Allinea nel trasferimento: all’attivazione è «già allineata».
    expect(attivato.esito?.attivazione?.base).toMatchObject({ giaAllineate: 1, allineate: 0 });
  });

  // ── 3 · Un ordine precedente ancora aperto ──────────────────────────────────

  it('3 · S→V con un ordine precedente APERTO: diventa impegno all’attivazione, e alla sua evasione scarica una volta', async () => {
    const remoto = negozio.semina({
      title: 'Maglia con ordine',
      opzioni: [{ name: 'Taglia', values: ['L'] }],
      varianti: [{ sku: 'PART-2', barcode: null, price: '10.00', valori: ['L'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    // Prima della partenza un cliente ha ordinato 2 pezzi, non ancora spediti:
    // Shopify: on_hand 10, committed 2, available 8.
    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'PART-2', inventoryItemId: item, quantity: 2 }],
      locationId: SEDE_REMOTA,
    });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);

    const { anteprima } = await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    // La lettura di controllo lo mostra, con sede determinabile.
    expect(anteprima.anteprima?.ordini).toMatchObject({ aperti: 1, parziali: 0, senzaSede: 0 });
    expect(anteprima.anteprima?.ordini.elenco[0]).toMatchObject({
      shopifyOrderId: String(ordine.id),
      stato: 'aperto',
      sedeDeterminabile: true,
      giaInVestiFlow: false,
    });
    const variante = await varianteConSku('PART-2');
    // La base è on_hand (10): l’ordine aperto è dentro, come merce ancora a scaffale.
    expect(await livello(variante.id)).toEqual({ onHand: 10, committed: 0, available: 10 });

    const attivato = await setup.attiva(IDS.tenantA);
    expect(attivato.esito?.attivazione?.ordini).toMatchObject({
      totale: 1,
      acquisiti: 1,
      senzaSede: 0,
    });
    // L’impegno c’è, la giacenza non si è mossa: VF available 8 = Shopify available 8.
    expect(await livello(variante.id)).toEqual({ onHand: 10, committed: 2, available: 8 });
    expect(attivato.esito?.attivazione?.base).toMatchObject({ giaAllineate: 1, allineate: 0 });

    // Dopo l’attivazione l’ordine viene evaso: il webhook lo porta (sincronizzazione continua).
    const evaso = negozio.evadiOrdineRemoto(Number(ordine.id));
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livello(variante.id)).toEqual({ onHand: 8, committed: 0, available: 8 });
    // Lo stesso webhook una seconda volta: nessun secondo scarico.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livello(variante.id)).toEqual({ onHand: 8, committed: 0, available: 8 });
    expect(
      await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'online_sale' },
      }),
    ).toBe(1);
  });

  // ── 4 · Ripresa dopo interruzione, senza doppioni ───────────────────────────

  it('4 · interruzione dopo il catalogo: la ripresa non reimporta, rilegge la base e scrive solo la differenza', async () => {
    const remoto = negozio.semina({
      title: 'Maglia interrotta',
      opzioni: [{ name: 'Taglia', values: ['S'] }],
      varianti: [{ sku: 'PART-3', barcode: null, price: '10.00', valori: ['S'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 5);

    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.anteprima(IDS.tenantA);
    // Il primo tentativo cade DOPO il catalogo, sulla lettura delle quantità.
    negozio.guastaProssima('getRemoteStockAtLocation', 1);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    const interrotto = await setup.stato(IDS.tenantA);
    expect(interrotto.status).toBe(ShopifySetupStatus.interrotto);
    expect(interrotto.esito?.interruzione).not.toBeNull();
    expect(interrotto.esito?.catalogo?.imported).toBe(1);
    const variante = await varianteConSku('PART-3');
    // Nessuna quantità scritta: il livello non esiste ancora.
    expect(
      await prisma.inventoryLevel.findFirst({
        where: { tenantId: IDS.tenantA, variantId: variante.id },
      }),
    ).toBeNull();

    // La ripresa: l’articolo NON si reimporta, la base si scrive una volta.
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    const ripreso = await setup.stato(IDS.tenantA);
    expect(ripreso.status).toBe(ShopifySetupStatus.trasferito);
    expect(ripreso.esito?.catalogo).toMatchObject({ imported: 0, updated: 1 });
    expect(await prisma.product.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect(await livello(variante.id)).toEqual({ onHand: 5, committed: 0, available: 5 });

    // Una seconda ripresa a negozio FERMO: la base è già quella, nessun movimento in più.
    await prisma.shopifySetup.update({
      where: { tenantId: IDS.tenantA },
      data: { status: ShopifySetupStatus.interrotto },
    });
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    expect(await livello(variante.id)).toEqual({ onHand: 5, committed: 0, available: 5 });
    const movimenti = await prisma.stockMovement.count({
      where: { tenantId: IDS.tenantA, variantId: variante.id },
    });
    expect(movimenti).toBe(1);

    // ⛔ Una ripresa DOPO un movimento sul negozio (finestra non rispettata): la
    //    base precedente non si assume valida — si rilegge e si scrive la differenza,
    //    tracciata, senza doppioni.
    negozio.vendiSulCanale(item, SEDE_REMOTA, 1);
    await prisma.shopifySetup.update({
      where: { tenantId: IDS.tenantA },
      data: { status: ShopifySetupStatus.interrotto },
    });
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    expect(await livello(variante.id)).toEqual({ onHand: 4, committed: 0, available: 4 });
    expect(
      await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id },
      }),
    ).toBe(2);
  });

  // ── 5 · Il primo ordine DOPO l’attivazione, e l’ordine nato durante un’interruzione ──

  it('5 · dopo l’attivazione: ordine creato → impegno; evaso → scarico; e un ordine creato ed evaso a webhook fermi viene recuperato e scaricato, una volta', async () => {
    const remoto = negozio.semina({
      title: 'Maglia dopo',
      opzioni: [{ name: 'Taglia', values: ['XL'] }],
      varianti: [{ sku: 'PART-4', barcode: null, price: '10.00', valori: ['XL'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 6);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    const attivato = await setup.attiva(IDS.tenantA);
    const variante = await varianteConSku('PART-4');
    expect(await livello(variante.id)).toEqual({ onHand: 6, committed: 0, available: 6 });
    const daId = attivato.esito?.attivazione?.ordersSinceId;
    expect(daId).toBe('0');

    // a · Il primo ordine: creato (webhook) → impegno; evaso (webhook) → scarico.
    const primo = negozio.creaOrdineRemoto({
      righe: [{ sku: 'PART-4', inventoryItemId: item, quantity: 1 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', primo);
    expect(await livello(variante.id)).toEqual({ onHand: 6, committed: 1, available: 5 });
    const primoEvaso = negozio.evadiOrdineRemoto(Number(primo.id));
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', primoEvaso);
    expect(await livello(variante.id)).toEqual({ onHand: 5, committed: 0, available: 5 });

    // b · I webhook si fermano. Un ordine nasce ED evade nel silenzio: VestiFlow
    //     non ne ha l’impegno. Shopify: on_hand 4.
    const silenzioso = negozio.creaOrdineRemoto({
      righe: [{ sku: 'PART-4', inventoryItemId: item, quantity: 1 }],
      locationId: SEDE_REMOTA,
    });
    negozio.evadiOrdineRemoto(Number(silenzioso.id));
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(4);
    expect(await livello(variante.id)).toEqual({ onHand: 5, committed: 0, available: 5 });

    // Il recupero della sincronizzazione continua: «da qui in poi» per id.
    const recupero = await ordersPull.recuperaOrdini(IDS.tenantA, daId!);
    expect(recupero).toMatchObject({ nuovi: 1, falliti: [] });
    // ⭐ Non ignorato: scaricato anche senza impegno, una volta.
    expect(await livello(variante.id)).toEqual({ onHand: 4, committed: 0, available: 4 });
    const ordineVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${silenzioso.id}` },
      select: { id: true },
    });
    const vendita = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: ordineVf.id },
      select: { inventoryStatus: true },
    });
    expect(vendita.inventoryStatus).toBe('unloaded');

    // Un secondo recupero, o il webhook in ritardo: niente due volte.
    await ordersPull.recuperaOrdini(IDS.tenantA, daId!);
    await sync.handleWebhook(
      IDS.tenantA,
      'orders/updated',
      negozio.ordiniRemoti.get(Number(silenzioso.id))!,
    );
    expect(await livello(variante.id)).toEqual({ onHand: 4, committed: 0, available: 4 });
    expect(
      await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'online_sale' },
      }),
    ).toBe(2);
  });
  // ── 6 · Fuori dal percorso: disconnessione, riconnessione, e la scelta di una persona ──

  /**
   * ⭐ La scelta delle sedi vale anche DOPO il percorso (mandato del 12/09/2026):
   *    «Disconnetti» azzera la colonna-cache (è la sua forma, scenario 1 del
   *    collaudo distruttivo) ma non chiude il periodo — disconnettere sospende.
   *    Alla riconnessione allo stesso negozio il sync riconosce la sede dalla
   *    COPPIA attiva e rimette la cache; «lascia» chiude il periodo (unlinked /
   *    operator) e da quel momento un ordine da quella location non ha sede;
   *    «collega» apre un periodo NUOVO sulla stessa coppia. Mai un riaggancio da
   *    solo: dopo «lascia» il sync la riporta fra le non collegate.
   */
  it('6 · dopo Disconnetti e riconnessione la sede si riconosce dalla coppia; «lascia» chiude il periodo; «collega» lo riapre', async () => {
    negozio.semina({
      title: 'Maglia dopo',
      opzioni: [{ name: 'Taglia', values: ['M'] }],
      varianti: [{ sku: 'DOPO-1', barcode: null, price: '10.00', valori: ['M'] }],
    });
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);
    const sedi = new ShopifyLocationSyncService(
      prisma as never,
      negozio.admin() as never,
      collegamento,
    );
    const periodi = () =>
      prisma.shopifyLocationLink.findMany({
        where: { tenantId: IDS.tenantA },
        orderBy: { linkedAt: 'asc' },
        select: { status: true, closeReason: true, closedAt: true },
      });
    const cache = async () =>
      (await prisma.location.findUniqueOrThrow({ where: { id: IDS.locA1 } })).shopifyLocationId;
    const ordine = { location_id: Number(SEDE_REMOTA) };

    // La disconnessione, nella sua forma: la cache si azzera, il periodo resta.
    await prisma.location.updateMany({
      where: { tenantId: IDS.tenantA, shopifyLocationId: { not: null } },
      data: { shopifyLocationId: null },
    });
    expect(await cache()).toBeNull();
    expect(await periodi()).toEqual([{ status: 'active', closeReason: null, closedAt: null }]);

    // Riconnessione allo stesso negozio: il sync riconosce dalla coppia, non per nome.
    const dopoRiconnessione = await sedi.syncFromShopify(IDS.tenantA, DOMINIO, 'token');
    expect(dopoRiconnessione.matchedCount).toBe(1);
    expect(dopoRiconnessione.unlinked).toEqual([]);
    expect(await cache()).toBe(SEDE_REMOTA);
    expect(await periodi()).toHaveLength(1);
    const stato = await setup.stato(IDS.tenantA);
    expect(stato.locations).toEqual([
      expect.objectContaining({
        shopifyLocationId: SEDE_REMOTA,
        choice: 'collega',
        locationId: IDS.locA1,
      }),
    ]);
    expect(await resolveShopifyOrderLocationId(prisma as never, IDS.tenantA, ordine)).toBe(
      IDS.locA1,
    );

    // «Lascia» fuori dal percorso (attivato): il periodo si chiude, la cache si azzera,
    // e un ordine da quella location non ha più una sede.
    const lasciata = await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'lascia' });
    expect(lasciata.locations).toEqual([
      expect.objectContaining({
        shopifyLocationId: SEDE_REMOTA,
        choice: 'lascia',
        locationId: null,
      }),
    ]);
    expect(await periodi()).toEqual([
      { status: 'unlinked', closeReason: 'operator', closedAt: expect.any(Date) },
    ]);
    expect(await cache()).toBeNull();
    expect(await resolveShopifyOrderLocationId(prisma as never, IDS.tenantA, ordine)).toBeNull();
    // E il sync NON la riaggancia: la riporta.
    const dopoLascia = await sedi.syncFromShopify(IDS.tenantA, DOMINIO, 'token');
    expect(dopoLascia.matchedCount).toBe(0);
    expect(dopoLascia.unlinked.map((l) => l.shopifyLocationId)).toEqual([SEDE_REMOTA]);

    // «Collega» di nuovo: un periodo NUOVO sulla stessa coppia, la storia resta.
    const ricollegata = await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, {
      choice: 'collega',
      locationId: IDS.locA1,
    });
    expect(ricollegata.locations[0]).toMatchObject({ choice: 'collega', locationId: IDS.locA1 });
    expect(await prisma.shopifyLocationPair.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect((await periodi()).map((p) => p.status)).toEqual(['unlinked', 'active']);
    expect(await cache()).toBe(SEDE_REMOTA);
    expect(await resolveShopifyOrderLocationId(prisma as never, IDS.tenantA, ordine)).toBe(
      IDS.locA1,
    );
  });
  // ── 7 · Un caso irrisolto non si dichiara pronto ────────────────────────────

  /**
   * ⭐ «Nessun caso irrisolto va dichiarato pronto per l’attivazione» (12/09/2026):
   *    un ordine aperto da una location LASCIATA fuori non diventa impegno.
   *    Lo stato lo nomina fra gli irrisolti PRIMA di attivare e DOPO; l’ordine
   *    in VestiFlow resta «Da verificare». Le parti preparate si attivano.
   */
  it('7 · ordine aperto da una location lasciata fuori: irrisolto prima e dopo l’attivazione, mai «pronto»', async () => {
    const ALTRA = '77102';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(ALTRA), name: 'Deposito', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Maglia irrisolta',
      opzioni: [{ name: 'Taglia', values: ['S'] }],
      varianti: [{ sku: 'IRR-1', barcode: null, price: '10.00', valori: ['S'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 5);
    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'IRR-1', inventoryItemId: item, quantity: 1 }],
      locationId: ALTRA,
    });

    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, ALTRA, { choice: 'lascia' });
    const anteprima = await setup.anteprima(IDS.tenantA);
    expect(anteprima.anteprima?.blocchi).toEqual([]);
    expect(anteprima.anteprima?.ordini).toMatchObject({ aperti: 1, senzaSede: 1 });
    // Prima della conferma gli irrisolti non si calcolano: l’anteprima li mostra già.
    expect(anteprima.irrisolti).toEqual([]);

    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    const trasferito = await setup.stato(IDS.tenantA);
    expect(trasferito.status).toBe(ShopifySetupStatus.trasferito);
    expect(trasferito.blocchiAttivazione).toEqual([]);
    expect(trasferito.irrisolti).toEqual([
      expect.objectContaining({
        tipo: 'ordine',
        riferimento: String(ordine.id),
        motivo: expect.stringMatching(/sede non collegata/),
      }),
    ]);

    const attivato = await setup.attiva(IDS.tenantA);
    expect(attivato.status).toBe(ShopifySetupStatus.attivato);
    expect(attivato.esito?.attivazione?.ordini).toMatchObject({ totale: 1, senzaSede: 1 });
    // Resta irrisolto anche dopo, e l’ordine in VestiFlow lo dice.
    expect(attivato.irrisolti.map((i) => i.riferimento)).toEqual([String(ordine.id)]);
    const inVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine.id}` },
      select: { requiresReview: true, locationId: true },
    });
    expect(inVf).toEqual({ requiresReview: true, locationId: null });
    // Nessun impegno: la sede non c’è.
    const variante = await varianteConSku('IRR-1');
    expect(await livello(variante.id)).toEqual({ onHand: 5, committed: 0, available: 5 });

    // ── ⛔ La QUANTITÀ resta FERMA finché l'ordine non ha una sede (13/09/2026) ──
    //
    // Misurato sul negozio vero: Shopify per quell'ordine ha già `committed`,
    // VestiFlow no. Scrivere il Disponibile VestiFlow avrebbe ALZATO l'on_hand
    // remoto di pezzi già promessi. L'attivazione riesce (webhook, ordini) ma
    // l'allineamento NON parte, e lo dice con motivo e azione; il push della
    // variante — da qualunque percorso — non invia; «Allinea» rifiuta prima di
    // esaminare. Nessuna compensazione numerica, nessuna sede inventata.
    const numero = String(ordine.name);
    expect(attivato.esito?.attivazione?.base).toMatchObject({
      totale: 0,
      allineate: 0,
      fermo: { ordini: [numero], motivo: expect.stringContaining(numero) },
    });
    // L'azione è quella dell'ORDINE: la location assegnata da Shopify non è
    // collegata, e il motivo la nomina e manda a Sedi (13/09/2026).
    expect(attivato.esito?.allinea?.fermo?.motivo).toContain(
      'gid://shopify/Location/77102 assegnata da Shopify non è collegata a una sede VestiFlow: collegala in Impostazioni → Shopify → Sedi',
    );
    // La quantità remota è quella di partenza, e resta tale.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(5);
    const fermo = await inventoryPush.pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(fermo).toMatchObject({ pushed: false, reason: 'ordine_senza_sede' });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(5);
    const connessione = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
      select: { lastErrorCode: true, lastErrorMessage: true },
    });
    expect(connessione.lastErrorCode).toBe('quantita_ferma_ordine_senza_sede');
    expect(connessione.lastErrorMessage).toContain(numero);
    await expect(align.allinea(IDS.tenantA)).rejects.toThrow(numero);

    // ⭐ L'ordine si CHIUDE (annullato per intero dal canale): la quantità riparte.
    const annullato = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [
        {
          lineItemId: Number((ordine.line_items as { id: number }[])[0]!.id),
          quantity: 1,
          restockType: 'cancel',
        },
      ],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/cancelled', {
      ...annullato,
      cancelled_at: new Date().toISOString(),
      financial_status: 'refunded',
    });
    const ripreso = await inventoryPush.pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(ripreso.reason).not.toBe('ordine_senza_sede');
    const blocco = await align.allinea(IDS.tenantA);
    expect(blocco.nonAllineate.map((c) => c.motivo)).not.toContain('ordine_senza_sede');
  });
  // ── 8 · Sincronizzazione continua · il RESO rientra dove Shopify dice ─────────

  /**
   * ⭐ §30.8-bis (registrata l'11/09, verificata e chiusa il 12/09/2026): la sede di
   *    rientro sta nel payload Shopify, per riga (`refund_line_items[].location_id`),
   *    e si risolve dal collegamento esplicito. Prova centrale del proprietario:
   *    spedizione da A, reintegro su B → carico SOLO su B, una sola volta anche
   *    con l'evento ripetuto; rimborso senza reintegro → nessun carico. E la sede
   *    non collegata: nessun carico, nessuna sede inventata (⛔ qui c'era il ripiego
   *    sulla sede di spedizione), ordine «Da verificare», evento NON bruciato —
   *    collegata la location, lo stesso webhook si applica.
   */
  it('8 · reso: spedito da A, reintegrato su B → carico solo su B, una volta; senza reintegro niente; sede non collegata → segnalato e riapplicabile', async () => {
    const SEDE_B = '77102';
    const SEDE_SCONOSCIUTA = '77103';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_B), name: 'Deposito resi', active: true },
      { id: Number(SEDE_SCONOSCIUTA), name: 'Punto ritiro', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Giacca reso',
      opzioni: [{ name: 'Taglia', values: ['L'] }],
      varianti: [{ sku: 'RESO-1', barcode: null, price: '10.00', valori: ['L'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    negozio.impostaQuantitaRemota(item, SEDE_B, 0);

    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_B, { choice: 'collega', locationId: IDS.locA2 });
    await setup.scegliSede(IDS.tenantA, SEDE_SCONOSCIUTA, { choice: 'lascia' });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    await setup.attiva(IDS.tenantA);

    const variante = await varianteConSku('RESO-1');
    const livelloA = () => livello(variante.id);
    const livelloB = () =>
      prisma.inventoryLevel.findFirst({
        where: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA2 },
        select: { onHand: true, committed: true, available: true },
      });
    const carichiDaReso = (locationId: string) =>
      prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id, locationId, type: 'return' },
      });

    // Ordine di 2 pezzi da A, evaso da A: la merce esce da A.
    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'RESO-1', inventoryItemId: item, quantity: 2 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    const evaso = negozio.evadiOrdineRemoto(Number(ordine.id));
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livelloA()).toEqual({ onHand: 8, committed: 0, available: 8 });
    // La base della prima connessione ha già creato il livello di B, a zero.
    expect(await livelloB()).toEqual({ onHand: 0, committed: 0, available: 0 });

    // Reso di 1 pezzo REINTEGRATO SU B: carico solo su B, A non si muove.
    const rigaOrdine = (ordine.line_items as { id: number }[])[0]!.id;
    const conReso = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [{ lineItemId: rigaOrdine, quantity: 1, restockType: 'return', locationId: SEDE_B }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', conReso);
    expect(await livelloB()).toEqual({ onHand: 1, committed: 0, available: 1 });
    expect(await livelloA()).toEqual({ onHand: 8, committed: 0, available: 8 });
    expect(await carichiDaReso(IDS.locA2)).toBe(1);
    expect(await carichiDaReso(IDS.locA1)).toBe(0);
    expect(negozio.quantitaRemota(item, SEDE_B)).toBe(1);

    // Lo stesso webhook una seconda volta: nessun secondo carico.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', conReso);
    expect(await livelloB()).toEqual({ onHand: 1, committed: 0, available: 1 });
    expect(await carichiDaReso(IDS.locA2)).toBe(1);

    // Rimborso del secondo pezzo SENZA reintegro: solo denaro, nessun carico da nessuna parte.
    const soloDenaro = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [{ lineItemId: rigaOrdine, quantity: 1, restockType: 'no_restock' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', soloDenaro);
    expect(await livelloB()).toEqual({ onHand: 1, committed: 0, available: 1 });
    expect(await livelloA()).toEqual({ onHand: 8, committed: 0, available: 8 });
    expect((await carichiDaReso(IDS.locA2)) + (await carichiDaReso(IDS.locA1))).toBe(1);

    // ── Sede di rientro NON collegata: nessun carico, nessuna sede inventata, segnalato ──
    const ordine2 = negozio.creaOrdineRemoto({
      righe: [{ sku: 'RESO-1', inventoryItemId: item, quantity: 1 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine2);
    await sync.handleWebhook(
      IDS.tenantA,
      'orders/updated',
      negozio.evadiOrdineRemoto(Number(ordine2.id)),
    );
    expect(await livelloA()).toEqual({ onHand: 7, committed: 0, available: 7 });
    const riga2 = (ordine2.line_items as { id: number }[])[0]!.id;
    const resoAltrove = negozio.rimborsaOrdineRemoto(Number(ordine2.id), {
      righe: [
        { lineItemId: riga2, quantity: 1, restockType: 'return', locationId: SEDE_SCONOSCIUTA },
      ],
    });
    const eventiPrima = await prisma.onlineOrderEvent.count({
      where: { tenantId: IDS.tenantA, type: 'online_order_restocked' },
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', resoAltrove);
    // ⛔ Non su A (la sede di spedizione), non su B: da nessuna parte.
    expect(await livelloA()).toEqual({ onHand: 7, committed: 0, available: 7 });
    expect(await livelloB()).toEqual({ onHand: 1, committed: 0, available: 1 });
    const ordineVf2 = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine2.id}` },
      select: { requiresReview: true, reviewReason: true },
    });
    expect(ordineVf2.requiresReview).toBe(true);
    expect(ordineVf2.reviewReason).toMatch(/sede di rientro .* non è collegata/);
    // L'evento NON è stato registrato come applicato: resta ripetibile.
    expect(
      await prisma.onlineOrderEvent.count({
        where: { tenantId: IDS.tenantA, type: 'online_order_restocked' },
      }),
    ).toBe(eventiPrima);

    // Una persona crea e collega la sede del punto ritiro: lo STESSO webhook ora si applica, lì.
    const dopoScelta = await setup.scegliSede(IDS.tenantA, SEDE_SCONOSCIUTA, { choice: 'crea' });
    const sedeNuova = dopoScelta.locations.find((l) => l.shopifyLocationId === SEDE_SCONOSCIUTA)!;
    expect(sedeNuova.locationId).not.toBeNull();
    await prisma.location.update({
      where: { id: sedeNuova.locationId! },
      data: { licensedInVf: true },
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', resoAltrove);
    expect(await carichiDaReso(sedeNuova.locationId!)).toBe(1);
    expect(await livelloA()).toEqual({ onHand: 7, committed: 0, available: 7 });
    expect(await livelloB()).toEqual({ onHand: 1, committed: 0, available: 1 });
  });

  // ── 9 · Annullamento PARZIALE prima della spedizione ─────────────────────────

  /**
   * ⭐ Su Shopify togliere un pezzo da un ordine non ancora spedito è un
   *    rimborso con `restock_type = 'cancel'`: la riga resta con la quantità
   *    ORDINATA, `current_quantity` scende, l'impegno remoto si libera. Qui
   *    l'impegno segue la quantità corrente; la riga d'ordine e la Vendita
   *    online restano come ordinate (il rimborso è già la rettifica economica,
   *    `sales_order_refunds`); lo scarico all'evasione è di quanto è USCITO.
   */
  it('9 · annullamento parziale prima della spedizione: l’impegno scende, la riga resta come ordinata, all’evasione esce solo il resto', async () => {
    const remoto = negozio.semina({
      title: 'Camicia annullo',
      opzioni: [{ name: 'Taglia', values: ['S'] }],
      varianti: [{ sku: 'ANN-1', barcode: null, price: '10.00', valori: ['S'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);
    const variante = await varianteConSku('ANN-1');
    expect(await livello(variante.id)).toEqual({ onHand: 10, committed: 0, available: 10 });

    // Ordine di 3 → impegno 3.
    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'ANN-1', inventoryItemId: item, quantity: 3 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    expect(await livello(variante.id)).toEqual({ onHand: 10, committed: 3, available: 7 });
    expect(negozio.impegnoRemoto(item, SEDE_REMOTA)).toBe(3);

    // Un pezzo tolto prima della spedizione → impegno 2, come sul negozio.
    const rigaOrdine = (ordine.line_items as { id: number }[])[0]!.id;
    const ridotto = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [{ lineItemId: rigaOrdine, quantity: 1, restockType: 'cancel' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', ridotto);
    expect(await livello(variante.id)).toEqual({ onHand: 10, committed: 2, available: 8 });
    expect(negozio.impegnoRemoto(item, SEDE_REMOTA)).toBe(2);
    const ordineVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine.id}` },
      select: {
        id: true,
        lines: { select: { quantity: true } },
        refunds: { select: { kind: true } },
      },
    });
    // ⛔ La riga resta come ORDINATA: il valore economico è già rettificato dal rimborso.
    expect(ordineVf.lines.map((l) => l.quantity)).toEqual([3]);
    expect(ordineVf.refunds.map((r) => r.kind)).toEqual(['cancellation']);
    // Lo stesso webhook una seconda volta: niente cambia.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', ridotto);
    expect(await livello(variante.id)).toEqual({ onHand: 10, committed: 2, available: 8 });

    // Evasione: escono i 2 rimasti, non i 3 ordinati.
    const evaso = negozio.evadiOrdineRemoto(Number(ordine.id));
    expect(
      (evaso.fulfillments as { line_items: { quantity: number }[] }[])[0]!.line_items[0]!.quantity,
    ).toBe(2);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livello(variante.id)).toEqual({ onHand: 8, committed: 0, available: 8 });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    const movimenti = await prisma.stockMovement.findMany({
      where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'online_sale' },
      select: { quantity: true, locationId: true },
    });
    expect(movimenti).toEqual([{ quantity: 2, locationId: IDS.locA1 }]);
    const vendita = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: ordineVf.id },
      select: { inventoryStatus: true, lines: { select: { quantity: true } } },
    });
    // La Vendita online dice 3 (economico, come l'ordine); il movimento dice 2 (fisico).
    expect(vendita.inventoryStatus).toBe('unloaded');
    expect(vendita.lines.map((l) => l.quantity)).toEqual([3]);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livello(variante.id)).toEqual({ onHand: 8, committed: 0, available: 8 });

    // ── ⭐ Il REGISTRO CORRISPETTIVI (deciso dal proprietario il 13/09/2026, #1014) ──
    //    Valore originario + rettifica separata: la vendita entra alla sua evasione al
    //    valore ordinato (3 × 10,00), l'annullamento del pezzo rettifica alla SUA data,
    //    contato una volta; il netto è 20,00. Righe, riepilogo ed export dicono lo stesso.
    const corrispettivi = new CorrispettiviService(prisma as never);
    const esportazione = new CorrispettiviExportService(prisma as never, corrispettivi);
    const oggi = new Date().toISOString().slice(0, 10);
    const periodo = { placedFrom: oggi, placedTo: oggi, page: 1, pageSize: 500 };
    const righeRegistro = (await corrispettivi.buildRegisterRows(IDS.tenantA, periodo)).filter(
      (r) => r.salesOrderId === ordineVf.id,
    );
    expect(righeRegistro.map((r) => [r.kind, r.refundKind, r.totalMinor])).toEqual([
      ['sale', null, 3000],
      ['refund', 'cancellation', -1000],
    ]);
    expect(righeRegistro.reduce((t, r) => t + r.totalMinor, 0)).toBe(2000);
    // La sede sulla riga: quella di USCITA della Vendita, per raccordo — non la
    // sede dell'ordine (nulla per un ordine online).
    expect(righeRegistro.map((r) => r.locationId)).toEqual([IDS.locA1, IDS.locA1]);
    // Le quantità ANNULLATE vengono dalle righe rimborsate del canale, non per differenza.
    const righeRimborso = await prisma.salesOrderRefundLine.findMany({
      where: { refund: { salesOrderId: ordineVf.id } },
      select: { quantity: true, restockType: true, salesOrderLineId: true },
    });
    expect(righeRimborso).toEqual([
      { quantity: 1, restockType: 'cancel', salesOrderLineId: expect.any(String) },
    ]);
    // ⭐ La TESTATA somma le proprie rettifiche (scritta coi rimborsi) e il totale
    //    aggiornato lo genera il database: è ciò che rende le due colonne ordinabili
    //    sull'elenco paginato dal server (13/09/2026, «Non ha ordinamento»).
    const testata = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: ordineVf.id },
      select: { totalMinor: true, refundTotalMinor: true, currentTotalMinor: true },
    });
    expect(testata.refundTotalMinor).toBe(1000);
    expect(testata.currentTotalMinor).toBe(testata.totalMinor - 1000);
    const ordiniVendita = new SalesOrdersService(prisma as never);
    const perRettifiche = await ordiniVendita.list(IDS.tenantA, {
      page: 1,
      pageSize: 50,
      sort: 'refundTotal:desc',
    } as never);
    expect(perRettifiche.items[0]?.id).toBe(ordineVf.id);
    expect(perRettifiche.items[0]?.currentTotalMinor).toBe(testata.totalMinor - 1000);
    // Il riepilogo: una rettifica sottratta, NESSUN annullamento «dichiarato».
    const riepilogo = await corrispettivi.getSummary(IDS.tenantA, periodo as never);
    expect(riepilogo.refundCount).toBe(1);
    expect(riepilogo.refundTotalMinor).toBe(1000);
    expect(riepilogo.cancellationCount).toBe(0);
    expect(riepilogo.netTotalMinor).toBe(riepilogo.totalMinor - 1000);
    // L'export per il commercialista porta le stesse due righe, col segno.
    const csv = await esportazione.exportAccountantCsv(IDS.tenantA, periodo as never);
    const righeCsv = csv.split(/\r?\n/).filter((r) => r.includes(String(ordine.name ?? '')));
    expect(righeCsv).toHaveLength(2);
    expect(righeCsv.some((r) => r.includes('Annullamento') && r.includes('-10,00'))).toBe(true);
    // Il webhook dell'evasione ripetuto: righe e riepilogo identici.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(
      (await corrispettivi.buildRegisterRows(IDS.tenantA, periodo)).filter(
        (r) => r.salesOrderId === ordineVf.id,
      ),
    ).toHaveLength(2);
    // ⭐ Vendita e rettifica in PERIODI diversi: ognuna resta nel suo. Spostata la
    //    rettifica a ieri (solo il test può farlo: la data è quella del canale), il
    //    Registro di oggi mostra la sola vendita, quello di ieri la sola rettifica —
    //    la rettifica NON dipende dalla presenza della vendita nel periodo scelto.
    const ieri = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.salesOrderRefund.updateMany({
      where: { salesOrderId: ordineVf.id },
      data: { occurredAt: ieri },
    });
    const giornoIeri = ieri.toISOString().slice(0, 10);
    expect(
      (await corrispettivi.buildRegisterRows(IDS.tenantA, periodo))
        .filter((r) => r.salesOrderId === ordineVf.id)
        .map((r) => r.kind),
    ).toEqual(['sale']);
    expect(
      (
        await corrispettivi.buildRegisterRows(IDS.tenantA, {
          ...periodo,
          placedFrom: giornoIeri,
          placedTo: giornoIeri,
        })
      )
        .filter((r) => r.salesOrderId === ordineVf.id)
        .map((r) => [r.kind, r.totalMinor]),
    ).toEqual([['refund', -1000]]);

    // Tolti TUTTI i pezzi: l'impegno si rilascia, e l'ordine annullato non scarica.
    const ordine2 = negozio.creaOrdineRemoto({
      righe: [{ sku: 'ANN-1', inventoryItemId: item, quantity: 2 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine2);
    expect(await livello(variante.id)).toEqual({ onHand: 8, committed: 2, available: 6 });
    const riga2 = (ordine2.line_items as { id: number }[])[0]!.id;
    const azzerato = negozio.rimborsaOrdineRemoto(Number(ordine2.id), {
      righe: [{ lineItemId: riga2, quantity: 2, restockType: 'cancel' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', azzerato);
    expect(await livello(variante.id)).toEqual({ onHand: 8, committed: 0, available: 8 });
    await sync.handleWebhook(IDS.tenantA, 'orders/cancelled', {
      ...azzerato,
      cancelled_at: new Date().toISOString(),
      financial_status: 'refunded',
    });
    expect(await livello(variante.id)).toEqual({ onHand: 8, committed: 0, available: 8 });
    expect(
      await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'online_sale' },
      }),
    ).toBe(1);
    // ⭐ Nel Registro l'ordine mai evaso non c'è, e il suo `cancel` NON rettifica: resta
    //    un annullamento DICHIARATO nel riepilogo (`08` §4), contato e non sottratto.
    const ordine2Vf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine2.id}` },
      select: { id: true, fulfilledAt: true },
    });
    expect(ordine2Vf.fulfilledAt).toBeNull();
    expect(
      (await corrispettivi.buildRegisterRows(IDS.tenantA, periodo)).filter(
        (r) => r.salesOrderId === ordine2Vf.id,
      ),
    ).toEqual([]);
    const riepilogoDopo = await corrispettivi.getSummary(IDS.tenantA, periodo as never);
    expect(riepilogoDopo.cancellationCount).toBe(1);
    // L'annullamento totale di 2 pezzi da 10,00: il simulatore scrive prezzo × quantità
    // per riga rimborsata, come Shopify (fino al 13/09 scriveva '10.00' per riga).
    expect(riepilogoDopo.cancellationTotalMinor).toBe(2000);
    // Le rettifiche di oggi: nessuna (quella del primo ordine è stata spostata a ieri).
    expect(riepilogoDopo.refundCount).toBe(0);
  });

  // ── 10 · Evasione su PIÙ sedi ──────────────────────────────────────────────

  /**
   * ⭐ Le `fulfillments[]` dicono, riga per riga, da quale location è uscita la
   *    merce: ogni riga si scarica dalla SUA sede (non tutte da
   *    `fulfillments[0]`), l'impegno si consuma dove era stato preso, la
   *    testata resta VUOTA (sedi diverse: mai «la prima», 13/09/2026). Un'evasione parziale nel tempo resta
   *    «Da verificare» senza scarico finché l'ordine non è tutto evaso. ⚠️ Una
   *    riga uscita da DUE sedi si segnala e non si scarica: un movimento per
   *    riga è uno solo, e come rappresentarne due è una decisione aperta.
   */
  it('10 · evasione su più sedi: ogni riga esce dalla sua sede, alla SUA acquisizione; a completamento una Vendita sola; riga divisa fra due sedi → due movimenti', async () => {
    const SEDE_B = '77102';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_B), name: 'Deposito', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Completo due sedi',
      opzioni: [{ name: 'Pezzo', values: ['Giacca', 'Pantalone'] }],
      varianti: [
        { sku: 'MULTI-G', barcode: null, price: '10.00', valori: ['Giacca'] },
        { sku: 'MULTI-P', barcode: null, price: '10.00', valori: ['Pantalone'] },
      ],
    });
    const itemG = String(remoto.variants[0]!.inventory_item_id);
    const itemP = String(remoto.variants[1]!.inventory_item_id);
    for (const item of [itemG, itemP]) {
      negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 5);
      negozio.impostaQuantitaRemota(item, SEDE_B, 5);
    }
    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_B, { choice: 'collega', locationId: IDS.locA2 });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    await setup.attiva(IDS.tenantA);
    const giacca = await varianteConSku('MULTI-G');
    const pantalone = await varianteConSku('MULTI-P');
    const livelloIn = (variantId: string, locationId: string) =>
      prisma.inventoryLevel.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, variantId, locationId },
        select: { onHand: true, committed: true, available: true },
      });

    // Ordine con due righe, impegnato su A.
    const ordine = negozio.creaOrdineRemoto({
      righe: [
        { sku: 'MULTI-G', inventoryItemId: itemG, quantity: 1 },
        { sku: 'MULTI-P', inventoryItemId: itemP, quantity: 1 },
      ],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 5,
      committed: 1,
      available: 4,
    });
    expect(await livelloIn(pantalone.id, IDS.locA1)).toEqual({
      onHand: 5,
      committed: 1,
      available: 4,
    });
    const [rigaG, rigaP] = (ordine.line_items as { id: number }[]).map((r) => r.id);

    // Prima evasione: la giacca da A. L'ordine è PARZIALE, ma la giacca è USCITA:
    // si scarica subito da A (deciso il 12/09/2026); il pantalone resta impegnato.
    const parziale = negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_REMOTA, [{ id: rigaG! }]);
    expect(parziale.fulfillment_status).toBe('partial');
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', parziale);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 4,
      committed: 0,
      available: 4,
    });
    expect(await livelloIn(pantalone.id, IDS.locA1)).toEqual({
      onHand: 5,
      committed: 1,
      available: 4,
    });
    const inAttesa = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine.id}` },
      select: { id: true, requiresReview: true, fulfillmentStatus: true },
    });
    // Nessuna anomalia: lo stato parziale è quello dell'ordine, non un segnale.
    expect(inAttesa).toMatchObject({
      requiresReview: false,
      fulfillmentStatus: 'partially_fulfilled',
    });
    expect(await prisma.onlineSale.count({ where: { salesOrderId: inAttesa.id } })).toBe(0);
    // Lo stesso webhook parziale una seconda volta: niente due volte.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', parziale);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 4,
      committed: 0,
      available: 4,
    });

    // Seconda evasione: il pantalone da B. Ordine EVASO: ogni riga esce dalla SUA sede.
    const evaso = negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_B, [{ id: rigaP! }]);
    expect(evaso.fulfillment_status).toBe('fulfilled');
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 4,
      committed: 0,
      available: 4,
    });
    expect(await livelloIn(giacca.id, IDS.locA2)).toEqual({
      onHand: 5,
      committed: 0,
      available: 5,
    });
    // Il pantalone: impegno consumato su A (dov'era), merce uscita da B.
    expect(await livelloIn(pantalone.id, IDS.locA1)).toEqual({
      onHand: 5,
      committed: 0,
      available: 5,
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 4,
      committed: 0,
      available: 4,
    });
    expect(negozio.quantitaRemota(itemG, SEDE_REMOTA)).toBe(4);
    expect(negozio.quantitaRemota(itemP, SEDE_B)).toBe(4);
    const vendita = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: inAttesa.id },
      select: {
        locationId: true,
        inventoryStatus: true,
        lines: { select: { sku: true, locationId: true }, orderBy: { lineNumber: 'asc' } },
      },
    });
    expect(vendita.inventoryStatus).toBe('unloaded');
    // ⭐ Con uscite da sedi DIVERSE la testata resta VUOTA, per scelta: assegnare la
    //    prima direbbe che tutto è uscito da lì (proprietario, 13/09/2026). Ogni riga
    //    sulla propria sede. ⛔ Qui c'era «la testata sulla prima evasione».
    expect(vendita.locationId).toBeNull();
    expect(vendita.lines).toEqual([
      { sku: 'MULTI-G', locationId: IDS.locA1 },
      { sku: 'MULTI-P', locationId: IDS.locA2 },
    ]);
    const movimenti = await prisma.stockMovement.findMany({
      where: {
        tenantId: IDS.tenantA,
        type: 'online_sale',
        externalRef: `gid://shopify/Order/${ordine.id}`,
      },
      select: { sku: true, locationId: true, quantity: true },
      orderBy: { sku: 'asc' },
    });
    expect(movimenti).toEqual([
      { sku: 'MULTI-G', locationId: IDS.locA1, quantity: 1 },
      { sku: 'MULTI-P', locationId: IDS.locA2, quantity: 1 },
    ]);
    // Lo stesso webhook una seconda volta: niente due volte.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 4,
      committed: 0,
      available: 4,
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 4,
      committed: 0,
      available: 4,
    });

    // ── Una riga divisa fra DUE sedi: due spedizioni, due movimenti, una riga di vendita ──
    const diviso = negozio.creaOrdineRemoto({
      righe: [{ sku: 'MULTI-G', inventoryItemId: itemG, quantity: 2 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', diviso);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 4,
      committed: 2,
      available: 2,
    });
    const rigaDivisa = (diviso.line_items as { id: number }[])[0]!.id;
    const metaA = negozio.evadiOrdineRemoto(Number(diviso.id), SEDE_REMOTA, [
      { id: rigaDivisa, quantity: 1 },
    ]);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', metaA);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 3,
      committed: 1,
      available: 2,
    });
    const divisoEvaso = negozio.evadiOrdineRemoto(Number(diviso.id), SEDE_B, [
      { id: rigaDivisa, quantity: 1 },
    ]);
    expect(divisoEvaso.fulfillment_status).toBe('fulfilled');
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', divisoEvaso);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 3,
      committed: 0,
      available: 3,
    });
    expect(await livelloIn(giacca.id, IDS.locA2)).toEqual({
      onHand: 4,
      committed: 0,
      available: 4,
    });
    const ordineDiviso = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${diviso.id}` },
      select: { id: true, requiresReview: true },
    });
    expect(ordineDiviso.requiresReview).toBe(false);
    const venditaDivisa = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: ordineDiviso.id },
      select: { id: true, inventoryStatus: true, lines: { select: { id: true, quantity: true } } },
    });
    expect(venditaDivisa.inventoryStatus).toBe('unloaded');
    expect(venditaDivisa.lines.map((l) => l.quantity)).toEqual([2]);
    const movimentiDivisi = await prisma.stockMovement.findMany({
      where: {
        tenantId: IDS.tenantA,
        type: 'online_sale',
        externalRef: `gid://shopify/Order/${diviso.id}`,
      },
      select: {
        locationId: true,
        quantity: true,
        sourceDocumentType: true,
        sourceDocumentId: true,
        sourceLineId: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    // Due movimenti, adottati dalla vendita sulla testata: nessuno dei due
    // «possiede» la riga di vendita (un movimento per riga di documento resta).
    expect(movimentiDivisi).toEqual([
      {
        locationId: IDS.locA1,
        quantity: 1,
        sourceDocumentType: 'online_sale',
        sourceDocumentId: venditaDivisa.id,
        sourceLineId: null,
      },
      {
        locationId: IDS.locA2,
        quantity: 1,
        sourceDocumentType: 'online_sale',
        sourceDocumentId: venditaDivisa.id,
        sourceLineId: null,
      },
    ]);
  });

  // ── 11 · La prova chiesta dal proprietario ─────────────────────────────────

  /**
   * ⭐ «Riga da 3 pezzi, 1 spedito da A e poi 2 da B. Scarichi corretti per sede,
   *    impegno residuo corretto dopo ogni passaggio, ripetizione degli eventi
   *    senza duplicazioni.» Più: nessuna Vendita online per spedizione — una
   *    sola, a completamento, che adotta i due movimenti; e il recupero degli
   *    ordini (`recuperaOrdini`) non scarica una seconda volta.
   */
  it('11 · riga da 3: 1 da A poi 2 da B → scarichi per sede, impegno residuo esatto, ripetizioni senza doppioni, una Vendita', async () => {
    const SEDE_B = '77102';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_B), name: 'Deposito', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Cappotto in tre',
      opzioni: [{ name: 'Taglia', values: ['48'] }],
      varianti: [{ sku: 'TRE-1', barcode: null, price: '10.00', valori: ['48'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    negozio.impostaQuantitaRemota(item, SEDE_B, 10);
    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_B, { choice: 'collega', locationId: IDS.locA2 });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    const attivato = await setup.attiva(IDS.tenantA);
    const daId = attivato.esito?.attivazione?.ordersSinceId;
    expect(daId).toBe('0');
    const variante = await varianteConSku('TRE-1');
    const inA = () => livello(variante.id);
    const inB = () =>
      prisma.inventoryLevel.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA2 },
        select: { onHand: true, committed: true, available: true },
      });
    const impegno = () =>
      prisma.stockReservation.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, variantId: variante.id },
        select: { status: true, remainingQuantity: true, locationId: true },
      });
    const movimenti = (ordineId: number) =>
      prisma.stockMovement.findMany({
        where: {
          tenantId: IDS.tenantA,
          type: 'online_sale',
          externalRef: `gid://shopify/Order/${ordineId}`,
        },
        select: { locationId: true, quantity: true, sourceDocumentId: true, sourceLineId: true },
        orderBy: { createdAt: 'asc' },
      });

    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'TRE-1', inventoryItemId: item, quantity: 3 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    expect(await inA()).toEqual({ onHand: 10, committed: 3, available: 7 });
    expect(await impegno()).toEqual({
      status: 'active',
      remainingQuantity: 3,
      locationId: IDS.locA1,
    });
    const riga = (ordine.line_items as { id: number }[])[0]!.id;

    // 1 da A: esce 1 da A, l'impegno scende a 2.
    const primo = negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_REMOTA, [
      { id: riga, quantity: 1 },
    ]);
    expect(primo.fulfillment_status).toBe('partial');
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', primo);
    expect(await inA()).toEqual({ onHand: 9, committed: 2, available: 7 });
    expect(await inB()).toEqual({ onHand: 10, committed: 0, available: 10 });
    expect(await impegno()).toMatchObject({ status: 'active', remainingQuantity: 2 });
    expect(await movimenti(Number(ordine.id))).toEqual([
      { locationId: IDS.locA1, quantity: 1, sourceDocumentId: null, sourceLineId: null },
    ]);
    // Ripetizioni: lo stesso webhook, e il recupero da id.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', primo);
    await ordersPull.recuperaOrdini(IDS.tenantA, daId ?? '0');
    expect(await inA()).toEqual({ onHand: 9, committed: 2, available: 7 });
    expect(await movimenti(Number(ordine.id))).toHaveLength(1);
    expect(await prisma.onlineSale.count({ where: { tenantId: IDS.tenantA } })).toBe(0);

    // 2 da B: escono 2 da B, l'impegno (preso su A) si chiude.
    const secondo = negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_B, [
      { id: riga, quantity: 2 },
    ]);
    expect(secondo.fulfillment_status).toBe('fulfilled');
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', secondo);
    expect(await inA()).toEqual({ onHand: 9, committed: 0, available: 9 });
    expect(await inB()).toEqual({ onHand: 8, committed: 0, available: 8 });
    expect(await impegno()).toMatchObject({ status: 'consumed', remainingQuantity: 0 });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    expect(negozio.quantitaRemota(item, SEDE_B)).toBe(8);
    // UNA Vendita online, che adotta i due movimenti; nessun terzo movimento.
    const vendite = await prisma.onlineSale.findMany({
      where: { tenantId: IDS.tenantA },
      select: { id: true, inventoryStatus: true, lines: { select: { quantity: true } } },
    });
    expect(vendite).toHaveLength(1);
    expect(vendite[0]).toMatchObject({ inventoryStatus: 'unloaded' });
    expect(vendite[0]!.lines.map((l) => l.quantity)).toEqual([3]);
    expect(await movimenti(Number(ordine.id))).toEqual([
      { locationId: IDS.locA1, quantity: 1, sourceDocumentId: vendite[0]!.id, sourceLineId: null },
      { locationId: IDS.locA2, quantity: 2, sourceDocumentId: vendite[0]!.id, sourceLineId: null },
    ]);
    // Ripetizioni a ordine completo: webhook e recupero, niente due volte.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', secondo);
    await ordersPull.recuperaOrdini(IDS.tenantA, daId ?? '0');
    expect(await inA()).toEqual({ onHand: 9, committed: 0, available: 9 });
    expect(await inB()).toEqual({ onHand: 8, committed: 0, available: 8 });
    expect(await movimenti(Number(ordine.id))).toHaveLength(2);
    expect(await prisma.onlineSale.count({ where: { tenantId: IDS.tenantA } })).toBe(1);
    expect(await prisma.salesOrderShipment.count({ where: { tenantId: IDS.tenantA } })).toBe(2);
  });

  // ── 12 · Collegamento CHIUSO: la riga non si risolve, né dalla cache né dallo SKU ──

  /**
   * ⭐ Deciso dal proprietario il 12/09/2026: una riga il cui collegamento è
   *    chiuso non impegna e non scarica la variante aggirando la chiusura
   *    (cache o SKU); è «Da verificare» col motivo, senza riaggancio automatico;
   *    le altre righe proseguono; l'ordine non risulta risolto. L'impegno
   *    PREESISTENTE alla chiusura si conserva (`docs/24` §1.14.3: segue il
   *    ciclo dell'ordine) e si chiude alla spedizione, senza scarico.
   */
  it('12 · collegamento chiuso: la riga non impegna né scarica (cache o SKU), è segnalata; l’impegno preesistente si conserva e si chiude alla spedizione senza uscita', async () => {
    const remoto = negozio.semina({
      title: 'Gonna e cintura',
      opzioni: [{ name: 'Pezzo', values: ['Gonna', 'Cintura'] }],
      varianti: [
        { sku: 'CH-G', barcode: null, price: '10.00', valori: ['Gonna'] },
        { sku: 'CH-C', barcode: null, price: '10.00', valori: ['Cintura'] },
      ],
    });
    const itemG = String(remoto.variants[0]!.inventory_item_id);
    const itemC = String(remoto.variants[1]!.inventory_item_id);
    negozio.impostaQuantitaRemota(itemG, SEDE_REMOTA, 5);
    negozio.impostaQuantitaRemota(itemC, SEDE_REMOTA, 5);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);
    const gonna = await varianteConSku('CH-G');
    const cintura = await varianteConSku('CH-C');
    const gidGonna = `gid://shopify/ProductVariant/${gonna.shopifyVariantId}`;

    // a · Un ordine PRIMA della chiusura: impegno regolare su entrambe.
    const prima = negozio.creaOrdineRemoto({
      righe: [
        {
          sku: 'CH-G',
          inventoryItemId: itemG,
          variantId: Number(gonna.shopifyVariantId),
          quantity: 1,
        },
        {
          sku: 'CH-C',
          inventoryItemId: itemC,
          variantId: Number(cintura.shopifyVariantId),
          quantity: 1,
        },
      ],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', prima);
    expect(await livello(gonna.id)).toEqual({ onHand: 5, committed: 1, available: 4 });
    expect(await livello(cintura.id)).toEqual({ onHand: 5, committed: 1, available: 4 });

    // Una persona CHIUDE il collegamento della gonna (operator): periodo chiuso, cache azzerata.
    await prisma.$executeRawUnsafe(
      `UPDATE "shopify_variant_links" l SET status = 'unlinked', close_reason = 'operator',
          closed_at = GREATEST(now(), linked_at), updated_at = now()
        FROM shopify_variant_identities i
       WHERE l.identity_id = i.id AND i.shopify_variant_gid = $1 AND l.status = 'active'`,
      gidGonna,
    );
    await prisma.productVariant.update({
      where: { id: gonna.id },
      data: { shopifyVariantId: null },
    });

    // b · Lo stesso ordine aggiornato dal canale: l'impegno PREESISTENTE della gonna resta,
    //     la riga non si riaggancia, l'ordine è «Da verificare».
    const primaAggiornato = { ...prima, updated_at: new Date().toISOString(), note: 'aggiornato' };
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', primaAggiornato);
    expect(await livello(gonna.id)).toEqual({ onHand: 5, committed: 1, available: 4 });
    expect(await livello(cintura.id)).toEqual({ onHand: 5, committed: 1, available: 4 });
    const primaVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${prima.id}` },
      select: {
        id: true,
        requiresReview: true,
        reviewReason: true,
        lines: { select: { sku: true, variantId: true } },
      },
    });
    expect(primaVf.requiresReview).toBe(true);
    expect(primaVf.reviewReason).toMatch(/Riga «CH-G».*collegamento.*chiuso/);
    expect(primaVf.lines.find((l) => l.sku === 'CH-G')?.variantId).toBeNull();
    expect(primaVf.lines.find((l) => l.sku === 'CH-C')?.variantId).toBe(cintura.id);
    // ⛔ Nessun riaggancio: la cache resta vuota e il periodo chiuso.
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: gonna.id } })).shopifyVariantId,
    ).toBeNull();

    // c · Un ordine NUOVO dopo la chiusura: la gonna non si impegna (né per id né per SKU), la cintura sì.
    const dopo = negozio.creaOrdineRemoto({
      righe: [
        {
          sku: 'CH-G',
          inventoryItemId: itemG,
          variantId: Number(gonna.shopifyVariantId),
          quantity: 1,
        },
        {
          sku: 'CH-C',
          inventoryItemId: itemC,
          variantId: Number(cintura.shopifyVariantId),
          quantity: 1,
        },
      ],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', dopo);
    expect(await livello(gonna.id)).toEqual({ onHand: 5, committed: 1, available: 4 });
    expect(await livello(cintura.id)).toEqual({ onHand: 5, committed: 2, available: 3 });
    const dopoVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${dopo.id}` },
      select: { id: true, requiresReview: true, reviewReason: true },
    });
    expect(dopoVf.requiresReview).toBe(true);
    expect(dopoVf.reviewReason).toMatch(/CH-G/);

    // d · L'ordine di PRIMA viene spedito: la cintura esce e si scarica; la gonna NON si
    //     scarica, il suo impegno preesistente si chiude senza uscita, e l'ordine lo dice.
    const evaso = negozio.evadiOrdineRemoto(Number(prima.id));
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    expect(await livello(cintura.id)).toEqual({ onHand: 4, committed: 1, available: 3 });
    expect(await livello(gonna.id)).toEqual({ onHand: 5, committed: 0, available: 5 });
    expect(
      await prisma.stockReservation.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, salesOrderId: primaVf.id, variantId: gonna.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'released' });
    const venditaPrima = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: primaVf.id },
      select: { inventoryStatus: true },
    });
    expect(venditaPrima.inventoryStatus).toBe('partially_unloaded');
    const primaDopo = await prisma.salesOrder.findUniqueOrThrow({
      where: { id: primaVf.id },
      select: { requiresReview: true, reviewReason: true },
    });
    expect(primaDopo.requiresReview).toBe(true);
    expect(primaDopo.reviewReason).toMatch(/NON scaricata/);
    expect(
      await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: gonna.id, type: 'online_sale' },
      }),
    ).toBe(0);
  });

  // ── 13 · I tre raccordi chiesti prima di chiudere il blocco ────────────────

  /**
   * ⭐ 1 · I movimenti delle spedizioni restano riconducibili senza ambiguità
   *    all'ordine e alla sua riga anche con `sourceLineId` nullo sulla Vendita:
   *    movimento ← riga di spedizione → riga d'ordine (→ riga di Vendita per
   *    `salesOrderLineId`). Due righe a prezzi DIVERSI, una uscita in due volte;
   *    il report (`BusinessAnalyticsService`, quello vero) somma i totali di riga.
   * ⭐ 2 · Il ripiego sulla sede dell'impegno NON attribuisce l'uscita a una sede
   *    diversa da quella comunicata dal canale: location comunicata e non
   *    collegata → nessuno scarico, nessuna sede indovinata; collegata dopo →
   *    la stessa spedizione si applica lì.
   * ⭐ 3 · Il percorso ordinario (un'evasione completa) conserva la forma di
   *    prima: un movimento per riga con `sourceLineId` = riga di Vendita, sede
   *    dell'evasione, impegno consumato, ricavo dal totale di riga.
   */
  it('13 · raccordi: riconducibilità e report con due righe a prezzi diversi; sede comunicata ma non collegata → nessun ripiego; percorso ordinario invariato', async () => {
    const SEDE_B = '77102';
    const SEDE_SCONOSCIUTA = '77103';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_B), name: 'Deposito', active: true },
      { id: Number(SEDE_SCONOSCIUTA), name: 'Punto ritiro', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Abito e cintura',
      opzioni: [{ name: 'Pezzo', values: ['Abito', 'Cintura'] }],
      varianti: [
        { sku: 'RAC-A', barcode: null, price: '25.00', valori: ['Abito'] },
        { sku: 'RAC-C', barcode: null, price: '10.00', valori: ['Cintura'] },
      ],
    });
    const itemA = String(remoto.variants[0]!.inventory_item_id);
    const itemC = String(remoto.variants[1]!.inventory_item_id);
    for (const item of [itemA, itemC]) {
      negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
      negozio.impostaQuantitaRemota(item, SEDE_B, 10);
      negozio.impostaQuantitaRemota(item, SEDE_SCONOSCIUTA, 10);
    }
    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_B, { choice: 'collega', locationId: IDS.locA2 });
    await setup.scegliSede(IDS.tenantA, SEDE_SCONOSCIUTA, { choice: 'lascia' });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    await setup.attiva(IDS.tenantA);
    const abito = await varianteConSku('RAC-A');
    const cintura = await varianteConSku('RAC-C');
    const livelloIn = (variantId: string, locationId: string) =>
      prisma.inventoryLevel.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, variantId, locationId },
        select: { onHand: true, committed: true, available: true },
      });
    const report = new BusinessAnalyticsService(prisma as never);
    const oggi = new Date().toISOString().slice(0, 10);
    const riepilogo = async () => {
      const r = await report.getSummary(IDS.tenantA, { period: 'custom', from: oggi, to: oggi });
      return {
        ricavo: r.revenue.totalMinor,
        unita: r.sales.unitsSold,
        transazioni: r.sales.transactionCount,
      };
    };

    // ── 1 · Abito 25,00 ×3 (uscito 1 da A poi 2 da B) e cintura 10,00 ×1 (uscita con la prima) ──
    const ordine = negozio.creaOrdineRemoto({
      righe: [
        { sku: 'RAC-A', inventoryItemId: itemA, quantity: 3, price: '25.00' },
        { sku: 'RAC-C', inventoryItemId: itemC, quantity: 1, price: '10.00' },
      ],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    const [rigaA, rigaC] = (ordine.line_items as { id: number }[]).map((r) => r.id);
    const gidOrdine = `gid://shopify/Order/${ordine.id}`;
    await sync.handleWebhook(
      IDS.tenantA,
      'orders/updated',
      negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_REMOTA, [
        { id: rigaA!, quantity: 1 },
        { id: rigaC! },
      ]),
    );
    // A ordine PARZIALE la merce è uscita (movimenti, magazzino), ma il cruscotto
    // conta le VENDITE (strada A): senza Vendita, niente — né ricavo né pezzi.
    expect(await livelloIn(abito.id, IDS.locA1)).toEqual({ onHand: 9, committed: 2, available: 7 });
    expect(await livelloIn(cintura.id, IDS.locA1)).toEqual({
      onHand: 9,
      committed: 0,
      available: 9,
    });
    expect(await riepilogo()).toEqual({ ricavo: 0, unita: 0, transazioni: 0 });
    await sync.handleWebhook(
      IDS.tenantA,
      'orders/updated',
      negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_B, [{ id: rigaA!, quantity: 2 }]),
    );
    expect(await livelloIn(abito.id, IDS.locA1)).toEqual({ onHand: 9, committed: 0, available: 9 });
    expect(await livelloIn(abito.id, IDS.locA2)).toEqual({ onHand: 8, committed: 0, available: 8 });

    // Riconducibilità nel database: ogni movimento ← la sua riga di spedizione → riga d'ordine → Vendita.
    const ordineVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: gidOrdine },
      select: { id: true, lines: { select: { id: true, sku: true } } },
    });
    const vendita = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: ordineVf.id },
      select: {
        id: true,
        inventoryStatus: true,
        lines: {
          select: {
            id: true,
            sku: true,
            salesOrderLineId: true,
            unitPriceMinor: true,
            totalMinor: true,
          },
        },
      },
    });
    expect(vendita.inventoryStatus).toBe('unloaded');
    const righeSpedizione = await prisma.salesOrderShipmentLine.findMany({
      where: { tenantId: IDS.tenantA, shipment: { salesOrderId: ordineVf.id } },
      select: {
        sku: true,
        quantity: true,
        esito: true,
        salesOrderLineId: true,
        shipment: { select: { externalFulfillmentId: true, locationId: true } },
        movement: {
          select: {
            id: true,
            locationId: true,
            quantity: true,
            sourceDocumentId: true,
            sourceLineId: true,
            externalRef: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { sku: 'asc' }],
    });
    expect(righeSpedizione).toHaveLength(3);
    const rigaOrdineAbito = ordineVf.lines.find((l) => l.sku === 'RAC-A')!.id;
    const rigaOrdineCintura = ordineVf.lines.find((l) => l.sku === 'RAC-C')!.id;
    const rigaVenditaAbito = vendita.lines.find((l) => l.sku === 'RAC-A')!;
    const rigaVenditaCintura = vendita.lines.find((l) => l.sku === 'RAC-C')!;
    // Ogni riga di spedizione porta la riga d'ordine e il movimento; il movimento
    // porta la Vendita e l'ordine (externalRef); la riga di Vendita porta la riga d'ordine.
    for (const riga of righeSpedizione) {
      expect(riga.esito).toBe('scaricata');
      expect(riga.movement?.sourceDocumentId).toBe(vendita.id);
      expect(riga.movement?.externalRef).toBe(gidOrdine);
      expect(riga.movement?.locationId).toBe(riga.shipment.locationId);
      expect(riga.movement?.quantity).toBe(riga.quantity);
    }
    const spedAbito = righeSpedizione.filter((r) => r.salesOrderLineId === rigaOrdineAbito);
    const spedCintura = righeSpedizione.filter((r) => r.salesOrderLineId === rigaOrdineCintura);
    expect(
      spedAbito.map((r) => [r.quantity, r.movement?.locationId, r.movement?.sourceLineId]),
    ).toEqual([
      [1, IDS.locA1, null],
      [2, IDS.locA2, null],
    ]);
    expect(
      spedCintura.map((r) => [r.quantity, r.movement?.locationId, r.movement?.sourceLineId]),
    ).toEqual([[1, IDS.locA1, rigaVenditaCintura.id]]);
    expect(rigaVenditaAbito.salesOrderLineId).toBe(rigaOrdineAbito);
    expect(rigaVenditaCintura.salesOrderLineId).toBe(rigaOrdineCintura);
    // Il report: 25×3 + 10×1 = 85,00 — la somma dei totali di riga della Vendita — su UNA transazione.
    expect(rigaVenditaAbito.totalMinor + rigaVenditaCintura.totalMinor).toBe(8500);
    expect(await riepilogo()).toEqual({ ricavo: 8500, unita: 4, transazioni: 1 });

    // ── 2 · Sede COMUNICATA dal canale ma non collegata: nessun ripiego sull'impegno ──
    const ordine2 = negozio.creaOrdineRemoto({
      righe: [{ sku: 'RAC-C', inventoryItemId: itemC, quantity: 1, price: '10.00' }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine2);
    expect(await livelloIn(cintura.id, IDS.locA1)).toEqual({
      onHand: 9,
      committed: 1,
      available: 8,
    });
    const evasoAltrove = negozio.evadiOrdineRemoto(Number(ordine2.id), SEDE_SCONOSCIUTA);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evasoAltrove);
    // ⛔ Né su A (sede dell'impegno), né altrove: l'impegno resta, l'ordine lo dice.
    expect(await livelloIn(cintura.id, IDS.locA1)).toEqual({
      onHand: 9,
      committed: 1,
      available: 8,
    });
    const ordine2Vf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine2.id}` },
      select: { id: true, requiresReview: true, reviewReason: true },
    });
    expect(ordine2Vf.requiresReview).toBe(true);
    expect(ordine2Vf.reviewReason).toMatch(/senza sede determinabile/);
    expect(
      await prisma.salesOrderShipmentLine.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, shipment: { salesOrderId: ordine2Vf.id } },
        select: { esito: true, stockMovementId: true },
      }),
    ).toEqual({ esito: 'senza_sede', stockMovementId: null });
    expect(
      (
        await prisma.onlineSale.findFirstOrThrow({
          where: { salesOrderId: ordine2Vf.id },
          select: { inventoryStatus: true },
        })
      ).inventoryStatus,
    ).toBe('not_applied');
    // Una persona collega la sede: LA STESSA spedizione, riletta, si applica lì — non su A.
    const scelta = await setup.scegliSede(IDS.tenantA, SEDE_SCONOSCIUTA, { choice: 'crea' });
    const sedeNuova = scelta.locations.find(
      (l) => l.shopifyLocationId === SEDE_SCONOSCIUTA,
    )!.locationId!;
    await prisma.location.update({ where: { id: sedeNuova }, data: { licensedInVf: true } });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...evasoAltrove,
      updated_at: new Date().toISOString(),
    });
    expect(await livelloIn(cintura.id, IDS.locA1)).toEqual({
      onHand: 9,
      committed: 0,
      available: 9,
    });
    expect(
      await prisma.stockMovement.findMany({
        where: {
          tenantId: IDS.tenantA,
          type: 'online_sale',
          externalRef: `gid://shopify/Order/${ordine2.id}`,
        },
        select: { locationId: true, quantity: true },
      }),
    ).toEqual([{ locationId: sedeNuova, quantity: 1 }]);

    // ── 3 · Percorso ORDINARIO: un'evasione completa — la forma di prima ──
    const ordine3 = negozio.creaOrdineRemoto({
      righe: [
        { sku: 'RAC-A', inventoryItemId: itemA, quantity: 2, price: '25.00' },
        { sku: 'RAC-C', inventoryItemId: itemC, quantity: 1, price: '10.00' },
      ],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine3);
    const evaso3 = negozio.evadiOrdineRemoto(Number(ordine3.id));
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso3);
    const ordine3Vf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine3.id}` },
      select: {
        id: true,
        requiresReview: true,
        reservations: { select: { status: true, remainingQuantity: true } },
      },
    });
    const vendita3 = await prisma.onlineSale.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, salesOrderId: ordine3Vf.id },
      select: {
        id: true,
        inventoryStatus: true,
        locationId: true,
        lines: { select: { id: true, sku: true, locationId: true, reservationId: true } },
      },
    });
    expect(ordine3Vf.requiresReview).toBe(false);
    expect(ordine3Vf.reservations.map((r) => [r.status, r.remainingQuantity])).toEqual([
      ['consumed', 0],
      ['consumed', 0],
    ]);
    expect(vendita3).toMatchObject({ inventoryStatus: 'unloaded', locationId: IDS.locA1 });
    const movimenti3 = await prisma.stockMovement.findMany({
      where: {
        tenantId: IDS.tenantA,
        type: 'online_sale',
        externalRef: `gid://shopify/Order/${ordine3.id}`,
      },
      select: {
        sku: true,
        quantity: true,
        locationId: true,
        sourceDocumentType: true,
        sourceDocumentId: true,
        sourceLineId: true,
        reason: true,
      },
      orderBy: { sku: 'asc' },
    });
    // Un movimento per riga, agganciato alla SUA riga di Vendita, dalla sede dell'evasione.
    expect(movimenti3).toEqual([
      {
        sku: 'RAC-A',
        quantity: 2,
        locationId: IDS.locA1,
        sourceDocumentType: 'online_sale',
        sourceDocumentId: vendita3.id,
        sourceLineId: vendita3.lines.find((l) => l.sku === 'RAC-A')!.id,
        reason: expect.stringMatching(/^Vendita online VO/),
      },
      {
        sku: 'RAC-C',
        quantity: 1,
        locationId: IDS.locA1,
        sourceDocumentType: 'online_sale',
        sourceDocumentId: vendita3.id,
        sourceLineId: vendita3.lines.find((l) => l.sku === 'RAC-C')!.id,
        reason: expect.stringMatching(/^Vendita online VO/),
      },
    ]);
    expect(
      vendita3.lines.every((l) => l.locationId === IDS.locA1 && l.reservationId !== null),
    ).toBe(true);
    expect(await livelloIn(abito.id, IDS.locA1)).toEqual({ onHand: 7, committed: 0, available: 7 });
    expect(await livelloIn(cintura.id, IDS.locA1)).toEqual({
      onHand: 8,
      committed: 0,
      available: 8,
    });
    // Il report somma le tre Vendite: 85,00 + 10,00 + 60,00.
    expect(await riepilogo()).toEqual({ ricavo: 15500, unita: 8, transazioni: 3 });
  });

  // ── 14 · Il costo di un webhook ripetuto ───────────────────────────────────

  /**
   * ⭐ Chiesto dal proprietario prima di chiudere: gli eventi ripetuti non devono
   *    produrre scritture o elaborazioni onerose evitabili. Misurato con il
   *    contatore di query del client di prova (nessuna infrastruttura): a
   *    spedizione già applicata, un webhook ripetuto — stessa versione o
   *    versione nuova — scrive SOLO ciò che scriveva prima di questo blocco
   *    (l'upsert dell'ordine e delle sue righe, i tentativi di registrazione
   *    degli eventi, il tocco della connessione) e non tocca magazzino,
   *    spedizioni, impegni né Vendite. ⛔ Fino alla misura del 12/09 sera, una
   *    versione nuova riadottava i movimenti (3-6 UPDATE evitabili per webhook).
   */
  it('14 · un webhook ripetuto a spedizione già applicata non scrive su magazzino, spedizioni, impegni o Vendite', async () => {
    const SEDE_B = '77102';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_B), name: 'Deposito', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Misura',
      opzioni: [{ name: 'Pezzo', values: ['Uno', 'Due'] }],
      varianti: [
        { sku: 'MIS-1', barcode: null, price: '25.00', valori: ['Uno'] },
        { sku: 'MIS-2', barcode: null, price: '10.00', valori: ['Due'] },
      ],
    });
    const item1 = String(remoto.variants[0]!.inventory_item_id);
    const item2 = String(remoto.variants[1]!.inventory_item_id);
    for (const item of [item1, item2]) {
      negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
      negozio.impostaQuantitaRemota(item, SEDE_B, 10);
    }
    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_B, { choice: 'collega', locationId: IDS.locA2 });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    await setup.attiva(IDS.tenantA);
    // Le tabelle che un webhook ripetuto NON deve toccare.
    const TABELLE_DEGLI_EFFETTI = [
      'stock_movements',
      'inventory_levels',
      'sales_order_shipments',
      'sales_order_shipment_lines',
      'stock_reservations',
      'stock_reservation_events',
      'online_sales',
      'online_sale_lines',
    ];
    const scrittureDegliEffetti = () =>
      contatore.scritture().filter((s) => TABELLE_DEGLI_EFFETTI.some((t) => s.endsWith(' ' + t)));
    const misura = async (azione: () => Promise<unknown>) => {
      contatore.azzera();
      await azione();
      return { verbi: contatore.perVerbo(), effetti: scrittureDegliEffetti() };
    };

    // A · percorso ordinario: ordine + un'evasione completa
    const ordine = negozio.creaOrdineRemoto({
      righe: [
        { sku: 'MIS-1', inventoryItemId: item1, quantity: 3, price: '25.00' },
        { sku: 'MIS-2', inventoryItemId: item2, quantity: 1, price: '10.00' },
      ],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    const evaso = negozio.evadiOrdineRemoto(Number(ordine.id));
    const prima = await misura(() => sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso));
    expect(prima.effetti.length).toBeGreaterThan(0);
    const stessa = await misura(() => sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso));
    expect(stessa.effetti).toEqual([]);
    const nuova = await misura(() =>
      sync.handleWebhook(IDS.tenantA, 'orders/updated', {
        ...evaso,
        updated_at: new Date().toISOString(),
      }),
    );
    expect(nuova.effetti).toEqual([]);
    // E non costa più della ripetizione identica, se non per le letture che
    // riconoscono la spedizione già applicata (misurato: +4 SELECT).
    expect(
      (nuova.verbi['UPDATE'] ?? 0) + (nuova.verbi['INSERT'] ?? 0) + (nuova.verbi['DELETE'] ?? 0),
    ).toBe(
      (stessa.verbi['UPDATE'] ?? 0) + (stessa.verbi['INSERT'] ?? 0) + (stessa.verbi['DELETE'] ?? 0),
    );

    // B · parziale: 1 da A, poi ripetizioni, poi 2 da B, poi ripetizioni
    const ordine2 = negozio.creaOrdineRemoto({
      righe: [{ sku: 'MIS-1', inventoryItemId: item1, quantity: 3, price: '25.00' }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine2);
    const riga = (ordine2.line_items as { id: number }[])[0]!.id;
    const parziale = negozio.evadiOrdineRemoto(Number(ordine2.id), SEDE_REMOTA, [
      { id: riga, quantity: 1 },
    ]);
    expect(
      (await misura(() => sync.handleWebhook(IDS.tenantA, 'orders/updated', parziale))).effetti
        .length,
    ).toBeGreaterThan(0);
    expect(
      (await misura(() => sync.handleWebhook(IDS.tenantA, 'orders/updated', parziale))).effetti,
    ).toEqual([]);
    expect(
      (
        await misura(() =>
          sync.handleWebhook(IDS.tenantA, 'orders/updated', {
            ...parziale,
            updated_at: new Date().toISOString(),
          }),
        )
      ).effetti,
    ).toEqual([]);
    const completo = negozio.evadiOrdineRemoto(Number(ordine2.id), SEDE_B, [
      { id: riga, quantity: 2 },
    ]);
    expect(
      (await misura(() => sync.handleWebhook(IDS.tenantA, 'orders/updated', completo))).effetti
        .length,
    ).toBeGreaterThan(0);
    expect(
      (await misura(() => sync.handleWebhook(IDS.tenantA, 'orders/updated', completo))).effetti,
    ).toEqual([]);
    expect(
      (
        await misura(() =>
          sync.handleWebhook(IDS.tenantA, 'orders/updated', {
            ...completo,
            updated_at: new Date().toISOString(),
          }),
        )
      ).effetti,
    ).toEqual([]);
    expect(
      await prisma.stockMovement.count({ where: { tenantId: IDS.tenantA, type: 'online_sale' } }),
    ).toBe(4);
  });

  // ── 15 · I tempi degli indicatori a cavallo di due mesi ───────────────────

  /**
   * ⭐ Strada A, decisa dal proprietario il 12/09/2026: nel cruscotto una Vendita
   *    conta UNA volta, nel periodo della SUA data — ricavo, pezzi venduti,
   *    transazione, e il COSTO congelato sui SUOI movimenti anche se usciti in
   *    un altro mese. Le uscite fisiche restano alla data della spedizione
   *    (movimenti: 1 il 31/08, 2 il 02/09), consultabili altrove.
   *
   * ⚠️ QUALE sia la data della Vendita con più spedizioni (prima o ultima
   *    evasione) non è scritto in nessuna regola: oggi è il primo fulfillment,
   *    com'è dal 14/08, e resta così finché il proprietario non decide
   *    (`DA-FARE` §30.8). Qui si asserisce che la Vendita porta una data di
   *    evasione del canale, uguale a quella dell'ordine — non quale.
   */
  it('15 · fra due mesi: la Vendita conta una volta nel mese della sua data, col costo di tutte le sue uscite; le uscite restano alle date di spedizione', async () => {
    const SEDE_B = '77102';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_B), name: 'Deposito', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Mesi',
      opzioni: [{ name: 'Pezzo', values: ['Uno'] }],
      varianti: [{ sku: 'MESE-1', barcode: null, price: '25.00', valori: ['Uno'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    negozio.impostaQuantitaRemota(item, SEDE_B, 10);
    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_B, { choice: 'collega', locationId: IDS.locA2 });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    await setup.attiva(IDS.tenantA);
    const report = new BusinessAnalyticsService(prisma as never);
    const titolare = testOwnerUser({ tenantId: IDS.tenantA, hasAllLocationsAccess: true });
    const mese = async (from: string, to: string) => {
      const r = await report.getSummary(IDS.tenantA, { period: 'custom', from, to }, titolare);
      return `ricavo ${r.revenue.totalMinor} · unità ${r.sales.unitsSold} · transazioni ${r.sales.transactionCount} · margine ${r.margin.grossMinor}`;
    };
    // Un costo d'acquisto, perché il margine abbia qualcosa da confrontare.
    const variante = await varianteConSku('MESE-1');
    await prisma.productVariant.update({
      where: { id: variante.id },
      data: { purchasePriceMinor: 700 },
    });

    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'MESE-1', inventoryItemId: item, quantity: 3, price: '25.00' }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    const riga = (ordine.line_items as { id: number }[])[0]!.id;
    const parziale = negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_REMOTA, [
      { id: riga, quantity: 1 },
    ]);
    (parziale.fulfillments as { created_at: string }[])[0]!.created_at = '2026-08-31T10:00:00.000Z';
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', parziale);
    // Ad agosto è USCITA 1 unità (movimento), ma nessuna Vendita esiste: il
    // cruscotto non conta niente in nessuno dei due mesi.
    expect(await mese('2026-08-01', '2026-08-31')).toBe(
      'ricavo 0 · unità 0 · transazioni 0 · margine null',
    );
    expect(await mese('2026-09-01', '2026-09-30')).toBe(
      'ricavo 0 · unità 0 · transazioni 0 · margine null',
    );

    const completo = negozio.evadiOrdineRemoto(Number(ordine.id), SEDE_B, [
      { id: riga, quantity: 2 },
    ]);
    (completo.fulfillments as { created_at: string }[])[0]!.created_at = '2026-08-31T10:00:00.000Z';
    (completo.fulfillments as { created_at: string }[])[1]!.created_at = '2026-09-02T10:00:00.000Z';
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', completo);
    // La Vendita esiste: conta UNA volta, nel mese della sua data, con TUTTI i
    // suoi pezzi, il suo ricavo e il costo di ENTRAMBE le uscite (1×700 + 2×700),
    // anche se una è di un altro mese. L'altro mese resta a zero.
    const agosto = await mese('2026-08-01', '2026-08-31');
    const settembre = await mese('2026-09-01', '2026-09-30');
    const pieno = 'ricavo 7500 · unità 3 · transazioni 1 · margine 5400';
    const vuoto = 'ricavo 0 · unità 0 · transazioni 0 · margine null';
    expect([agosto, settembre].sort()).toEqual([pieno, vuoto].sort());
    const ordineVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine.id}` },
      select: {
        fulfilledAt: true,
        onlineSale: { select: { fulfilledAt: true, orderPlacedAt: true } },
      },
    });
    // La Vendita porta una data di evasione DEL CANALE, la stessa dell'ordine —
    // quale delle due, con più spedizioni, è la decisione aperta.
    const dataVendita = ordineVf.onlineSale?.fulfilledAt.toISOString();
    expect(dataVendita).toBe(ordineVf.fulfilledAt?.toISOString());
    expect(['2026-08-31T10:00:00.000Z', '2026-09-02T10:00:00.000Z']).toContain(dataVendita);
    const meseDellaVendita = dataVendita?.startsWith('2026-08') ? agosto : settembre;
    expect(meseDellaVendita).toBe(pieno);
    const movimenti = await prisma.stockMovement.findMany({
      where: { tenantId: IDS.tenantA, type: 'online_sale' },
      select: { quantity: true, createdAt: true, locationId: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(movimenti.map((m) => `${m.quantity}@${m.createdAt.toISOString().slice(0, 10)}`)).toEqual(
      ['1@2026-08-31', '2@2026-09-02'],
    );
  });

  // ── 16 · La SEDE degli impegni viene dai FULFILLMENT ORDER ────────────────────

  /**
   * ⭐ Deciso dal proprietario il 13/09/2026 (`DA-FARE` §10e.7-bis), dopo #1010 e
   *    #1011 sul negozio vero: la sede di un ordine online prima della spedizione
   *    sta nel fulfillment order, si legge in sola lettura per riga, e gli impegni
   *    la seguono. I raccordi chiesti, uno per uno:
   *    1. assegnazione DOPO l'arrivo dell'ordine → l'impegno nasce al webhook;
   *    2. SPOSTAMENTO prima della spedizione → l'impegno si sposta, nessun movimento;
   *    3. rilettura → nessun doppione;
   *    4. `location_id` sull'ordine NON prevale su un'assegnazione diversa;
   *    5. spedizione PARZIALE e rilettura → nessuna seconda sottrazione delle spedite;
   *    6. due righe su due sedi → ognuna la sua; la STESSA riga divisa → limite,
   *       protezione; permesso mancante → protezione col messaggio giusto.
   */
  it('16 · sede dai fulfillment order: assegnazione tardiva, spostamento, rilettura, location_id non prevale, spedizione parziale, righe su due sedi, riga divisa, permesso mancante, riga confermata altrove → rilascio', async () => {
    const SEDE_B = '77102';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_B), name: 'Deposito', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Sede dal fulfillment order',
      opzioni: [{ name: 'Pezzo', values: ['Giacca', 'Pantalone'] }],
      varianti: [
        { sku: 'FO-G', barcode: null, price: '10.00', valori: ['Giacca'] },
        { sku: 'FO-P', barcode: null, price: '10.00', valori: ['Pantalone'] },
      ],
    });
    const itemG = String(remoto.variants[0]!.inventory_item_id);
    const itemP = String(remoto.variants[1]!.inventory_item_id);
    for (const item of [itemG, itemP]) {
      negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
      negozio.impostaQuantitaRemota(item, SEDE_B, 10);
    }
    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_B, { choice: 'collega', locationId: IDS.locA2 });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    await setup.attiva(IDS.tenantA);
    const giacca = await varianteConSku('FO-G');
    const pantalone = await varianteConSku('FO-P');
    const livelloIn = (variantId: string, locationId: string) =>
      prisma.inventoryLevel.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, variantId, locationId },
        select: { onHand: true, committed: true, available: true },
      });
    const ordineVf = (id: unknown) =>
      prisma.salesOrder.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${String(id)}` },
        select: { id: true, requiresReview: true, reviewReason: true },
      });
    const impegniDi = (salesOrderId: string) =>
      prisma.stockReservation.findMany({
        where: { tenantId: IDS.tenantA, salesOrderId },
        select: {
          id: true,
          locationId: true,
          status: true,
          remainingQuantity: true,
          salesOrderLineId: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    const movimenti = () => prisma.stockMovement.count({ where: { tenantId: IDS.tenantA } });
    const rilasciDi = (salesOrderId: string) =>
      prisma.stockReservationEvent.count({
        where: {
          tenantId: IDS.tenantA,
          type: 'released',
          reservation: { salesOrderId },
        },
      });

    // ── 1 · Nato SENZA assegnazione (come #1010 da bozza): niente impegno, ferma ──
    const tardivo = negozio.creaOrdineRemoto({
      righe: [{ sku: 'FO-G', inventoryItemId: itemG, quantity: 2 }],
      locationId: null,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', tardivo);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 0,
      available: 10,
    });
    let inVf = await ordineVf(tardivo.id);
    expect(inVf.requiresReview).toBe(true);
    expect(inVf.reviewReason).toMatch(/Sede non determinabile: Shopify non ha ancora assegnato/);
    const fermo = await inventoryPush.pushLevel(IDS.tenantA, giacca.id, IDS.locA1);
    expect(fermo).toMatchObject({ pushed: false, reason: 'ordine_senza_sede' });
    // Il motivo sulla connessione dice l'AZIONE dell'ordine, non «collega la location».
    const conn1 = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
      select: { lastErrorMessage: true },
    });
    expect(conn1.lastErrorMessage).toContain('non ha ancora assegnato');
    expect(conn1.lastErrorMessage).not.toContain('collega la location');

    // Shopify completa l'assegnazione su A: il webhook reimporta, l'impegno NASCE.
    const routing = negozio.assegnaFulfillmentOrder(Number(tardivo.id), SEDE_REMOTA);
    const movimentiPrima = await movimenti();
    await sync.handleWebhook(IDS.tenantA, 'fulfillment_orders/order_routing_complete', routing);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 2,
      available: 8,
    });
    inVf = await ordineVf(tardivo.id);
    // Il segmento della sede se ne va, e con lui la protezione: la quantità riparte.
    expect(inVf).toMatchObject({ requiresReview: false, reviewReason: null });
    const ripreso = await inventoryPush.pushLevel(IDS.tenantA, giacca.id, IDS.locA1);
    expect(ripreso.reason).not.toBe('ordine_senza_sede');
    expect(await movimenti()).toBe(movimentiPrima);

    // ── 2 · SPOSTAMENTO su B prima della spedizione: l'impegno si sposta, nessun movimento ──
    const spostato = negozio.spostaFulfillmentOrder(Number(tardivo.id), SEDE_B);
    await sync.handleWebhook(IDS.tenantA, 'fulfillment_orders/moved', spostato);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 0,
      available: 10,
    });
    expect(await livelloIn(giacca.id, IDS.locA2)).toEqual({
      onHand: 10,
      committed: 2,
      available: 8,
    });
    expect(await movimenti()).toBe(movimentiPrima);
    let impegni = await impegniDi(inVf.id);
    expect(impegni).toEqual([
      expect.objectContaining({ locationId: IDS.locA2, status: 'active', remainingQuantity: 2 }),
    ]);

    // ── 3 · RILETTURA dello stesso ordine: nessun doppione, niente cambia ──
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...negozio.ordiniRemoti.get(Number(tardivo.id)),
      updated_at: new Date().toISOString(),
    });
    await sync.handleWebhook(IDS.tenantA, 'fulfillment_orders/moved', spostato);
    impegni = await impegniDi(inVf.id);
    expect(impegni).toHaveLength(1);
    expect(await livelloIn(giacca.id, IDS.locA2)).toEqual({
      onHand: 10,
      committed: 2,
      available: 8,
    });
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 0,
      available: 10,
    });

    // ── 4 · `location_id` = A sull'ordine, ma il fulfillment order sta su B: vince B ──
    const conLocation = negozio.creaOrdineRemoto({
      righe: [{ sku: 'FO-P', inventoryItemId: itemP, quantity: 3 }],
      locationId: null,
      assegnataA: SEDE_B,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', {
      ...conLocation,
      location_id: SEDE_REMOTA,
    });
    expect(await livelloIn(pantalone.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 0,
      available: 10,
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 10,
      committed: 3,
      available: 7,
    });
    const inVfP = await ordineVf(conLocation.id);
    expect(inVfP.requiresReview).toBe(false);

    // ── 5 · SPEDIZIONE PARZIALE (1 di 3 da B) e rilettura: l'impegno resta 2, non 1 ──
    const rigaP = Number((conLocation.line_items as { id: number }[])[0]!.id);
    const parziale = negozio.evadiOrdineRemoto(Number(conLocation.id), SEDE_B, [
      { id: rigaP, quantity: 1 },
    ]);
    expect(parziale.fulfillment_status).toBe('partial');
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', parziale);
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 2,
      available: 7,
    });
    // Il fulfillment order ora ha residuo 2: se lo usassimo come quantità e poi
    // sottraessimo la spedita, l'impegno scenderebbe a 1. Rilettura:
    expect(negozio.fulfillmentOrdersDi(Number(conLocation.id))[0]?.righe[0]?.remaining).toBe(2);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...parziale,
      updated_at: new Date(Date.now() + 1000).toISOString(),
    });
    await sync.handleWebhook(IDS.tenantA, 'fulfillment_orders/order_routing_complete', {
      fulfillment_order: {
        id: `gid://shopify/FulfillmentOrder/${negozio.fulfillmentOrdersDi(Number(conLocation.id))[0]?.id}`,
        status: 'in_progress',
      },
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 2,
      available: 7,
    });
    expect((await impegniDi(inVfP.id)).map((i) => i.remainingQuantity)).toEqual([2]);

    // ── 6 · Due righe su due sedi: ognuna la sua ──
    const dueSedi = negozio.creaOrdineRemoto({
      righe: [
        { sku: 'FO-G', inventoryItemId: itemG, quantity: 1 },
        { sku: 'FO-P', inventoryItemId: itemP, quantity: 1 },
      ],
      locationId: null,
    });
    const [rigaG2, rigaP2] = (dueSedi.line_items as { id: number }[]).map((r) => r.id);
    negozio.assegnaFulfillmentOrder(Number(dueSedi.id), SEDE_REMOTA);
    negozio.dividiRigaFraSedi(Number(dueSedi.id), rigaP2!, 1, SEDE_B);
    await sync.handleWebhook(IDS.tenantA, 'orders/create', dueSedi);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 1,
      available: 9,
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 3,
      available: 6,
    });
    const inVf2 = await ordineVf(dueSedi.id);
    expect(inVf2.requiresReview).toBe(false);
    expect(
      (await impegniDi(inVf2.id)).map((i) => [i.salesOrderLineId !== null, i.locationId]),
    ).toEqual(
      expect.arrayContaining([
        [true, IDS.locA1],
        [true, IDS.locA2],
      ]),
    );

    // La STESSA riga (giacca, 1 pezzo… serve una riga da 2) divisa fra A e B → limite:
    // l'impegno esistente si CONSERVA, non ne nasce uno nuovo, l'ordine lo dice, quantità ferma.
    const daDividere = negozio.creaOrdineRemoto({
      righe: [{ sku: 'FO-G', inventoryItemId: itemG, quantity: 2 }],
      locationId: null,
      assegnataA: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', daDividere);
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 3,
      available: 7,
    });
    const rigaDivisa = Number((daDividere.line_items as { id: number }[])[0]!.id);
    negozio.dividiRigaFraSedi(Number(daDividere.id), rigaDivisa, 1, SEDE_B);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...negozio.ordiniRemoti.get(Number(daDividere.id)),
      updated_at: new Date(Date.now() + 2000).toISOString(),
    });
    // Conservato com'era: 2 su A, niente su B.
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 3,
      available: 7,
    });
    expect(await livelloIn(giacca.id, IDS.locA2)).toEqual({
      onHand: 10,
      committed: 2,
      available: 8,
    });
    const inVf3 = await ordineVf(daDividere.id);
    expect(inVf3.requiresReview).toBe(true);
    expect(inVf3.reviewReason).toMatch(/Sede non determinabile: una riga è suddivisa fra più sedi/);
    const fermoDivisa = await inventoryPush.pushLevel(IDS.tenantA, giacca.id, IDS.locA1);
    expect(fermoDivisa).toMatchObject({ pushed: false, reason: 'ordine_senza_sede' });
    expect(rigaG2).toBeDefined();

    // ── 7 · PERMESSO MANCANTE: nessun impegno, e il messaggio dice l'ambito, non «collega» ──
    //    ⛔ E con `location_id` sull'ordine: una riga esplicitamente irrisolta NON
    //    ricade sulla sede dell'ordine (proprietario, 13/09/2026).
    negozio.permessoFulfillmentOrders = false;
    const senzaPermesso = negozio.creaOrdineRemoto({
      righe: [{ sku: 'FO-P', inventoryItemId: itemP, quantity: 1 }],
      locationId: null,
      assegnataA: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', {
      ...senzaPermesso,
      location_id: SEDE_REMOTA,
    });
    expect(await livelloIn(pantalone.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 0,
      available: 10,
    });
    const inVf4 = await ordineVf(senzaPermesso.id);
    expect(inVf4.reviewReason).toContain('read_merchant_managed_fulfillment_orders');
    expect(inVf4.reviewReason).toContain('Disconnetti e Connetti');
    const fermoPermesso = await inventoryPush.pushLevel(IDS.tenantA, pantalone.id, IDS.locA1);
    expect(fermoPermesso).toMatchObject({ pushed: false, reason: 'ordine_senza_sede' });
    const conn2 = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
      select: { lastErrorMessage: true },
    });
    expect(conn2.lastErrorMessage).toContain('read_merchant_managed_fulfillment_orders');
    expect(conn2.lastErrorMessage).not.toContain('collega la location');
    // Col permesso tornato, la stessa rilettura risolve: l'impegno nasce, l'ordine si pulisce.
    negozio.permessoFulfillmentOrders = true;
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...senzaPermesso,
      updated_at: new Date(Date.now() + 3000).toISOString(),
    });
    expect(await livelloIn(pantalone.id, IDS.locA1)).toEqual({
      onHand: 10,
      committed: 1,
      available: 9,
    });
    expect(await ordineVf(senzaPermesso.id)).toMatchObject({
      requiresReview: false,
      reviewReason: null,
    });

    // ── 8 · Una riga SPOSTATA PER INTERO su una location NON collegata: l'impegno si RILASCIA ──
    //    Deciso dal proprietario il 13/09/2026 dopo la misura su #1010: il pezzo non
    //    partirà da dove era impegnato. Ordine, riga, quantità e assegnazione — mai i
    //    totali committed. Le altre righe non si toccano; nessun movimento; la
    //    segnalazione e la protezione restano.
    const SEDE_C = '77103'; // esiste sul negozio, ma NON è collegata a nessuna sede
    // dueSedi: giacca ×1 su A (impegnata), pantalone ×1 su B (impegnata). Solo il
    // pantalone va su C — come la maglietta di #1010.
    negozio.dividiRigaFraSedi(Number(dueSedi.id), rigaP2!, 1, SEDE_C);
    const movimentiPrima8 = await movimenti();
    const giaccaPrima = await livelloIn(giacca.id, IDS.locA1);
    const spostataAltrove = {
      ...negozio.ordiniRemoti.get(Number(dueSedi.id)),
      updated_at: new Date(Date.now() + 5000).toISOString(),
    };
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', spostataAltrove);
    // Il pantalone libera B (3 → 2); la giacca su A resta com'era; nessun movimento.
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 2,
      available: 7,
    });
    expect(await livelloIn(giacca.id, IDS.locA1)).toEqual(giaccaPrima);
    expect(await movimenti()).toBe(movimentiPrima8);
    let impegni8 = await impegniDi(inVf2.id);
    expect(impegni8).toHaveLength(2);
    expect(impegni8).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locationId: IDS.locA1, status: 'active', remainingQuantity: 1 }),
        expect.objectContaining({ status: 'released', remainingQuantity: 0 }),
      ]),
    );
    expect(await rilasciDi(inVf2.id)).toBe(1);
    // La segnalazione e la protezione restano: l'ordine dice l'azione, la coppia è ferma.
    const inVf8 = await ordineVf(dueSedi.id);
    expect(inVf8.requiresReview).toBe(true);
    expect(inVf8.reviewReason).toContain(`gid://shopify/Location/${SEDE_C}`);
    expect(inVf8.reviewReason).toContain('non è collegata a una sede VestiFlow');
    expect(await inventoryPush.pushLevel(IDS.tenantA, pantalone.id, IDS.locA2)).toMatchObject({
      pushed: false,
      reason: 'ordine_senza_sede',
    });

    // Lo STESSO evento ripetuto: nessun ulteriore effetto (né un secondo rilascio).
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', spostataAltrove);
    await sync.handleWebhook(IDS.tenantA, 'fulfillment_orders/order_routing_complete', {
      fulfillment_order: {
        id: `gid://shopify/FulfillmentOrder/${negozio.fulfillmentOrdersDi(Number(dueSedi.id)).at(-1)?.id}`,
        status: 'open',
      },
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 2,
      available: 7,
    });
    expect(await impegniDi(inVf2.id)).toHaveLength(2);
    expect(await rilasciDi(inVf2.id)).toBe(1);
    expect(await movimenti()).toBe(movimentiPrima8);

    // Riportata su B (collegata): UN solo impegno per la riga, riattivato, quantità giusta.
    negozio.dividiRigaFraSedi(Number(dueSedi.id), rigaP2!, 1, SEDE_B);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...negozio.ordiniRemoti.get(Number(dueSedi.id)),
      updated_at: new Date(Date.now() + 6000).toISOString(),
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 3,
      available: 6,
    });
    impegni8 = await impegniDi(inVf2.id);
    expect(impegni8).toHaveLength(2);
    expect(impegni8.filter((i) => i.status === 'active')).toHaveLength(2);
    expect(impegni8).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locationId: IDS.locA2, status: 'active', remainingQuantity: 1 }),
      ]),
    );
    expect(await ordineVf(dueSedi.id)).toMatchObject({ requiresReview: false, reviewReason: null });
    expect(await movimenti()).toBe(movimentiPrima8);

    // ── 9 · Lettura TRONCATA (altre pagine): classifica e segnala, ma NON rilascia ──
    //    «Lettura incerta o incompleta» resta conservativa (13/09/2026).
    negozio.dividiRigaFraSedi(Number(dueSedi.id), rigaP2!, 1, SEDE_C);
    negozio.letturaFulfillmentOrdersCompleta = false;
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...negozio.ordiniRemoti.get(Number(dueSedi.id)),
      updated_at: new Date(Date.now() + 7000).toISOString(),
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 3,
      available: 6,
    });
    expect(await rilasciDi(inVf2.id)).toBe(1);
    expect((await ordineVf(dueSedi.id)).requiresReview).toBe(true);
    // Riletta per intero: ora la conferma c'è, e rilascia.
    negozio.letturaFulfillmentOrdersCompleta = true;
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', {
      ...negozio.ordiniRemoti.get(Number(dueSedi.id)),
      updated_at: new Date(Date.now() + 8000).toISOString(),
    });
    expect(await livelloIn(pantalone.id, IDS.locA2)).toEqual({
      onHand: 9,
      committed: 2,
      available: 7,
    });
    expect(await rilasciDi(inVf2.id)).toBe(2);
    expect(await movimenti()).toBe(movimentiPrima8);
  });

  // ── 17 · La TESTATA delle rettifiche sotto sforzo ─────────────────────────────

  /**
   * ⭐ La testata (`refund_total_minor`, scritta coi rimborsi; `current_total_minor`,
   *    generata dal database) deve restare COERENTE con i rimborsi persistiti, non
   *    solo ordinabile (proprietario, 13/09/2026): più rimborsi sullo stesso ordine,
   *    un rimborso già acquisito che cambia importo, lo stesso evento ripetuto, due
   *    eventi concorrenti, e il riempimento degli ordini esistenti (la migration).
   */
  it('17 · testata delle rettifiche: più rimborsi, rimborso aggiornato, eventi ripetuti e concorrenti, riempimento — sempre coerente', async () => {
    const remoto = negozio.semina({
      title: 'Felpa testata',
      opzioni: [{ name: 'Taglia', values: ['M'] }],
      varianti: [{ sku: 'TEST-1', barcode: null, price: '10.00', valori: ['M'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);

    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'TEST-1', inventoryItemId: item, quantity: 4 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    const rigaOrdine = (ordine.line_items as { id: number }[])[0]!.id;
    const gid = `gid://shopify/Order/${ordine.id}`;
    const testata = () =>
      prisma.salesOrder.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, shopifyOrderId: gid },
        select: {
          id: true,
          totalMinor: true,
          refundTotalMinor: true,
          currentTotalMinor: true,
          refunds: { select: { externalRefundId: true, totalMinor: true } },
        },
      });
    /** La somma VIVA dei rimborsi persistiti: la testata deve dire lo stesso numero. */
    const coerente = async () => {
      const t = await testata();
      const viva = t.refunds.reduce((somma, r) => somma + r.totalMinor, 0);
      expect(t.refundTotalMinor).toBe(viva);
      expect(t.currentTotalMinor).toBe(t.totalMinor - t.refundTotalMinor);
      return t;
    };
    expect((await coerente()).refundTotalMinor).toBe(0);

    // Due rimborsi sullo stesso ordine: la testata li somma entrambi.
    const primo = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [{ lineItemId: rigaOrdine, quantity: 1, restockType: 'cancel' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', primo);
    expect((await coerente()).refundTotalMinor).toBe(1000);
    const secondo = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [{ lineItemId: rigaOrdine, quantity: 1, restockType: 'cancel' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', secondo);
    let t = await coerente();
    expect(t.refundTotalMinor).toBe(2000);
    expect(t.currentTotalMinor).toBe(2000);
    expect(t.refunds).toHaveLength(2);

    // Un rimborso GIÀ acquisito che torna con un importo diverso (stesso id): la
    // testata segue il persistito, e i rimborsi restano due.
    const rimborsi = secondo.refunds as { refund_line_items: { subtotal: string }[] }[];
    const corretto = {
      ...secondo,
      refunds: rimborsi.map((r, i) =>
        i === 1
          ? {
              ...r,
              refund_line_items: r.refund_line_items.map((l) => ({ ...l, subtotal: '12.50' })),
            }
          : r,
      ),
    };
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', corretto);
    t = await coerente();
    expect(t.refundTotalMinor).toBe(2250);
    expect(t.refunds).toHaveLength(2);

    // Lo stesso evento ripetuto: niente cambia.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', corretto);
    expect((await coerente()).refundTotalMinor).toBe(2250);

    // Due eventi CONCORRENTI sullo stesso ordine: la riga dell'ordine serializza le
    // transazioni (l'aggiornamento di testata la blocca), e la somma di ciascuna vede
    // i rimborsi già scritti dall'altra. Nessun doppione, nessuna somma parziale.
    await Promise.all([
      sync.handleWebhook(IDS.tenantA, 'orders/updated', corretto),
      sync.handleWebhook(IDS.tenantA, 'orders/updated', corretto),
    ]);
    t = await coerente();
    expect(t.refundTotalMinor).toBe(2250);
    expect(t.refunds).toHaveLength(2);

    // Il RIEMPIMENTO degli ordini esistenti: la migration somma i rimborsi già
    // persistiti. Si riproduce azzerando la testata e rieseguendo il suo UPDATE.
    await prisma.$executeRawUnsafe(
      `UPDATE "sales_orders" SET "refund_total_minor" = 0 WHERE "id" = $1::uuid`,
      t.id,
    );
    expect((await testata()).refundTotalMinor).toBe(0);
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../prisma/migrations/20260913170000_testata_rettifiche_ordine/migration.sql',
      ),
      'utf8',
    );
    const riempimento = migration
      .split(/;\s*\n/)
      .map((istruzione) => istruzione.trim())
      .find((istruzione) => istruzione.startsWith('UPDATE "sales_orders"'));
    expect(riempimento).toBeDefined();
    await prisma.$executeRawUnsafe(riempimento!);
    t = await coerente();
    expect(t.refundTotalMinor).toBe(2250);
    expect(t.currentTotalMinor).toBe(1750);
  });

  // ── 18 · Il CRUSCOTTO con le rettifiche persistite ────────────────────────────

  /**
   * ⭐ Deciso dal proprietario il 13/09/2026: il Cruscotto riusa le rettifiche
   *    persistite, senza toccare le Vendite online. I PEZZI netti sono una grandezza
   *    economica — una riga rimborsata con quantità li toglie qualunque sia il
   *    reintegro (`cancel`, `return`, `no_restock`); un rimborso di solo importo
   *    toglie valore e nessun pezzo. Il COSTO resta quello congelato sui movimenti:
   *    il rientro già considerato dal movimento di reso non si sottrae di nuovo, e
   *    un costo d'acquisto cambiato dopo non rivaluta niente.
   */
  it('18 · Cruscotto: valore netto delle vendite e pezzi netti dalle rettifiche; reso con reintegro, rimborso senza, solo importo, ripetizione, periodo successivo; costo congelato', async () => {
    const remoto = negozio.semina({
      title: 'Giacca cruscotto',
      opzioni: [{ name: 'Taglia', values: ['L'] }],
      varianti: [{ sku: 'CRU-1', barcode: null, price: '10.00', valori: ['L'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    // Due prodotti DIVERSI con lo stesso nome e senza SKU (per la coda della prova).
    const gemelle = [1, 2].map(() =>
      negozio.semina({
        title: 'Gemella',
        opzioni: [{ name: 'Taglia', values: ['U'] }],
        varianti: [{ sku: '', barcode: null, price: '10.00', valori: ['U'] }],
      }),
    );
    for (const g of gemelle) {
      negozio.impostaQuantitaRemota(String(g.variants[0]!.inventory_item_id), SEDE_REMOTA, 5);
    }
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);
    const variante = await varianteConSku('CRU-1');
    // Un costo d'acquisto VERO prima della vendita: il margine deve leggerlo congelato.
    await prisma.productVariant.update({
      where: { id: variante.id },
      data: { purchasePriceMinor: 400 },
    });

    const report = new BusinessAnalyticsService(prisma as never);
    const oggi = new Date().toISOString().slice(0, 10);
    const cruscotto = async (from = oggi, to = oggi) => {
      const r = await report.getSummary(
        IDS.tenantA,
        { period: 'custom', from, to },
        testOwnerUser(),
      );
      return {
        vendite: r.sales.transactionCount,
        pezzi: r.sales.unitsSold,
        valore: r.revenue.totalMinor,
        margine: r.margin.grossMinor,
        prodotto: r.topProducts.find((p) => p.sku === 'CRU-1') ?? null,
      };
    };

    // 3 ordinati, 1 annullato prima della spedizione, 2 spediti: come #1014.
    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'CRU-1', inventoryItemId: item, quantity: 3 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    const rigaOrdine = (ordine.line_items as { id: number }[])[0]!.id;
    const annullato = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [{ lineItemId: rigaOrdine, quantity: 1, restockType: 'cancel' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', annullato);
    // Prima dell'evasione: nessuna Vendita, e l'annullamento di un ordine non evaso
    // non rettifica niente (ammissibilità del Registro).
    expect(await cruscotto()).toMatchObject({ vendite: 0, pezzi: 0, valore: 0 });
    await sync.handleWebhook(
      IDS.tenantA,
      'orders/updated',
      negozio.evadiOrdineRemoto(Number(ordine.id)),
    );
    // 1 vendita · 2 pezzi netti · 20,00 di valore netto (30,00 − 10,00) · costo 2 × 4,00.
    expect(await cruscotto()).toEqual({
      vendite: 1,
      pezzi: 2,
      valore: 2000,
      margine: 2000 - 800,
      prodotto: {
        variantId: variante.id,
        sku: 'CRU-1',
        title: expect.any(String),
        revenueMinor: 2000,
        unitsSold: 2,
      },
    });

    // RESO con reintegro di 1 pezzo: il movimento di rientro toglie il costo (4,00),
    // il rimborso toglie valore e pezzo — una volta ciascuno.
    const conReso = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [
        { lineItemId: rigaOrdine, quantity: 1, restockType: 'return', locationId: SEDE_REMOTA },
      ],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', conReso);
    expect(await cruscotto()).toMatchObject({ pezzi: 1, valore: 1000, margine: 1000 - 400 });
    expect(await livello(variante.id)).toEqual({ onHand: 9, committed: 0, available: 9 });

    // Lo stesso evento ripetuto: niente cambia, né nel magazzino né nel Cruscotto.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', conReso);
    expect(await cruscotto()).toMatchObject({ pezzi: 1, valore: 1000, margine: 600 });
    expect(await livello(variante.id)).toEqual({ onHand: 9, committed: 0, available: 9 });

    // RIMBORSO SENZA reintegro dell'ultimo pezzo: il pezzo resta fuori (il suo costo
    // resta), il cliente non lo paga più: 0 pezzi netti, valore 0, margine −4,00.
    const senzaReintegro = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [{ lineItemId: rigaOrdine, quantity: 1, restockType: 'no_restock' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', senzaReintegro);
    expect(await cruscotto()).toMatchObject({ vendite: 1, pezzi: 0, valore: 0 });
    expect(await livello(variante.id)).toEqual({ onHand: 9, committed: 0, available: 9 });

    // Rimborso di SOLO IMPORTO (la spedizione, 2,00): toglie valore, nessun pezzo.
    const soloImporto = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [],
      rettifiche: [{ kind: 'shipping_refund', amount: '-2.00' }],
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', soloImporto);
    expect(await cruscotto()).toMatchObject({ pezzi: 0, valore: -200 });

    // Il costo d'acquisto cambia DOPO: il Cruscotto non rivaluta niente.
    await prisma.productVariant.update({
      where: { id: variante.id },
      data: { purchasePriceMinor: 900 },
    });
    const prima = await cruscotto();
    expect(prima).toMatchObject({ pezzi: 0, valore: -200 });

    // Una rettifica in un PERIODO SUCCESSIVO resta nel suo: spostato il reso a domani
    // (solo il test può farlo: la data è quella del canale), oggi torna a 1 pezzo e
    // 10,00 e domani porta −1 pezzo e −10,00 — il valore del periodo intero non cambia.
    const reso = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine.id}` },
      select: { refunds: { where: { kind: 'return_with_restock' }, select: { id: true } } },
    });
    const domani = new Date();
    domani.setUTCDate(domani.getUTCDate() + 1);
    await prisma.salesOrderRefund.update({
      where: { id: reso.refunds[0]!.id },
      data: { occurredAt: domani },
    });
    const domaniIso = domani.toISOString().slice(0, 10);
    expect(await cruscotto()).toMatchObject({ pezzi: 1, valore: 800 });
    expect(await cruscotto(domaniIso, domaniIso)).toMatchObject({
      vendite: 0,
      pezzi: -1,
      valore: -1000,
    });
    expect(await cruscotto(oggi, domaniIso)).toMatchObject({ vendite: 1, pezzi: 0, valore: -200 });

    // ── ⭐ «Top prodotti»: l'identità è la VARIANTE, non SKU né titolo (13/09/2026) ──
    //    Due prodotti diversi con lo STESSO nome e SENZA SKU: sul negozio si fondevano in una
    //    riga. Restano due, e restano due anche quando entrambe le varianti sono nel cestino
    //    (l'id sopravvive; l'eliminazione definitiva è rifiutata a chi ha movimenti).
    const ordineGemelle = negozio.creaOrdineRemoto({
      righe: gemelle.map((g) => ({
        sku: '',
        inventoryItemId: String(g.variants[0]!.inventory_item_id),
        variantId: Number(g.variants[0]!.id),
        quantity: 1,
      })),
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordineGemelle);
    await sync.handleWebhook(
      IDS.tenantA,
      'orders/updated',
      negozio.evadiOrdineRemoto(Number(ordineGemelle.id)),
    );
    const righeGemelle = async () =>
      (
        await report.getSummary(
          IDS.tenantA,
          { period: 'custom', from: oggi, to: oggi },
          testOwnerUser(),
        )
      ).topProducts
        .filter((r) => r.title === 'Gemella')
        .map((r) => ({ variantId: r.variantId, sku: r.sku, unitsSold: r.unitsSold }));
    const primaDelCestino = await righeGemelle();
    expect(primaDelCestino).toHaveLength(2);
    expect(new Set(primaDelCestino.map((r) => r.variantId)).size).toBe(2);
    expect(primaDelCestino.map((r) => r.unitsSold)).toEqual([1, 1]);
    // Entrambe nel cestino, stesso nome: due righe, le stesse.
    await prisma.productVariant.updateMany({
      where: { id: { in: primaDelCestino.map((r) => r.variantId) } },
      data: { deletedAt: new Date() },
    });
    expect(await righeGemelle()).toEqual(primaDelCestino);
  });

  // ── 19 · Il recupero rilegge anche gli ordini acquisiti alla partenza, pur se chiusi ──

  /**
   * ⭐ Il buco misurato il 13/09/2026 leggendo `recuperaOrdini`: due insiemi — gli ordini
   *    con id oltre il confine dell'attivazione e quelli che VestiFlow ha APERTI. Un ordine
   *    nato PRIMA dell'attivazione, acquisito perché aperto, poi evaso, che riceve un
   *    rimborso a webhook fermi non sta in nessuno dei due: la rettifica si perdeva, e
   *    «Importa ordini» a percorso attivato È questo recupero — nessun rimedio a mano.
   *
   * ⭐ Deciso dal proprietario: si rileggono anche gli ordini già acquisiti alla partenza,
   *    evasi o annullati compresi. Il perimetro resta quello degli ordini CONOSCIUTI:
   *    nessuna importazione dello storico, nessun orologio. Il costo si misura in
   *    chiamate: una scansione per id più una lettura per ordine conosciuto fuori dalla
   *    scansione.
   */
  it('19 · ordine precedente all’attivazione, acquisito aperto ed evaso: un rimborso a webhook fermi si recupera una volta; nessun secondo scarico né seconda Vendita; Registro, Cruscotto ed export coerenti; secondo recupero e webhook tardivo senza doppioni; lo storico estraneo resta fuori', async () => {
    const remoto = negozio.semina({
      title: 'Cardigan recupero',
      opzioni: [{ name: 'Taglia', values: ['S'] }],
      varianti: [{ sku: 'REC-1', barcode: null, price: '10.00', valori: ['S'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    // Lo STORICO estraneo al perimetro: un ordine già evaso prima della partenza. Non si
    // acquisisce alla partenza («niente storico») e non deve entrare con nessun recupero.
    const storico = negozio.creaOrdineRemoto({
      righe: [{ sku: 'REC-1', inventoryItemId: item, quantity: 1 }],
      locationId: SEDE_REMOTA,
    });
    negozio.evadiOrdineRemoto(Number(storico.id));
    // L'ordine APERTO prima della partenza: 2 pezzi. Shopify: on_hand 9, committed 2.
    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'REC-1', inventoryItemId: item, quantity: 2 }],
      locationId: SEDE_REMOTA,
    });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(7);

    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    const attivato = await setup.attiva(IDS.tenantA);
    // Il confine «da qui in poi» è l'ultimo ordine del negozio: proprio quello acquisito.
    const daId = attivato.esito?.attivazione?.ordersSinceId;
    expect(daId).toBe(String(ordine.id));
    expect(attivato.esito?.attivazione?.ordini).toMatchObject({ totale: 1, acquisiti: 1 });
    const variante = await varianteConSku('REC-1');
    expect(await livello(variante.id)).toEqual({ onHand: 9, committed: 2, available: 7 });
    const gidStorico = `gid://shopify/Order/${storico.id}`;
    const conosciuti = () =>
      prisma.salesOrder.count({ where: { tenantId: IDS.tenantA, shopifyOrderId: { not: null } } });
    expect(await conosciuti()).toBe(1);

    // Evaso dopo l'attivazione, col webhook: scarico una volta, l'ordine è CHIUSO per VestiFlow.
    const evaso = negozio.evadiOrdineRemoto(Number(ordine.id));
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    const ordineVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine.id}` },
      select: { id: true, fulfilledAt: true },
    });
    expect(ordineVf.fulfilledAt).not.toBeNull();
    const fotografia = async () => ({
      scarichi: await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'online_sale' },
      }),
      carichi: await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'return' },
      }),
      vendite: await prisma.onlineSale.count({
        where: { tenantId: IDS.tenantA, salesOrderId: ordineVf.id },
      }),
      rimborsi: await prisma.salesOrderRefund.count({ where: { salesOrderId: ordineVf.id } }),
      // Gli eventi hanno una chiave: una riapplicazione con la stessa chiave non ne aggiunge.
      eventi: await prisma.onlineOrderEvent.count({ where: { salesOrderId: ordineVf.id } }),
      testata: await prisma.salesOrder.findUniqueOrThrow({
        where: { id: ordineVf.id },
        select: { totalMinor: true, refundTotalMinor: true, currentTotalMinor: true },
      }),
      livello: await livello(variante.id),
    });
    expect(await fotografia()).toMatchObject({
      scarichi: 1,
      carichi: 0,
      vendite: 1,
      rimborsi: 0,
      testata: { totalMinor: 2000, refundTotalMinor: 0, currentTotalMinor: 2000 },
      livello: { onHand: 7, committed: 0, available: 7 },
    });

    // I webhook si fermano. Un pezzo torna, REINTEGRATO sulla sede: Shopify on_hand 8,
    // VestiFlow non ne sa niente.
    const rigaOrdine = (ordine.line_items as { id: number }[])[0]!.id;
    const conReso = negozio.rimborsaOrdineRemoto(Number(ordine.id), {
      righe: [
        { lineItemId: rigaOrdine, quantity: 1, restockType: 'return', locationId: SEDE_REMOTA },
      ],
    });
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    expect((await fotografia()).rimborsi).toBe(0);

    // ⛔ Il recupero: l'ordine ha id ≤ confine (fuori dalla scansione per id) ed è evaso
    //    (fuori dagli «aperti»). Deve essere RILETTO lo stesso, perché è conosciuto.
    negozio.azzeraChiamate();
    const recupero = await ordersPull.recuperaOrdini(IDS.tenantA, daId!);
    expect(recupero).toMatchObject({ nuovi: 0, aggiornati: 1, riletti: 1, falliti: [] });
    // Il costo, misurato: UNA scansione per id e UNA lettura per ordine conosciuto fuori
    // dalla scansione. Niente altro.
    expect(negozio.chiamate.get('listOrdersSinceId')).toBe(1);
    expect(negozio.chiamate.get('getOrder')).toBe(1);
    const dopoRecupero = await fotografia();
    // Rimborso recuperato una volta: carico del reso una volta, nessun nuovo scarico né
    // seconda Vendita, testata che somma la rettifica.
    expect(dopoRecupero).toMatchObject({
      scarichi: 1,
      carichi: 1,
      vendite: 1,
      rimborsi: 1,
      testata: { totalMinor: 2000, refundTotalMinor: 1000, currentTotalMinor: 1000 },
      livello: { onHand: 8, committed: 0, available: 8 },
    });
    // ⛔ Lo storico estraneo resta fuori: il recupero non acquisisce ordini che VestiFlow
    //    non conosceva.
    expect(
      await prisma.salesOrder.count({
        where: { tenantId: IDS.tenantA, shopifyOrderId: gidStorico },
      }),
    ).toBe(0);
    expect(await conosciuti()).toBe(1);

    // Registro, Cruscotto, elenco ordini ed export dicono lo stesso: 20,00 − 10,00.
    const corrispettivi = new CorrispettiviService(prisma as never);
    const esportazione = new CorrispettiviExportService(prisma as never, corrispettivi);
    const oggi = new Date().toISOString().slice(0, 10);
    const periodo = { placedFrom: oggi, placedTo: oggi, page: 1, pageSize: 500 };
    const righeRegistro = async () =>
      (await corrispettivi.buildRegisterRows(IDS.tenantA, periodo))
        .filter((r) => r.salesOrderId === ordineVf.id)
        .map((r) => [r.kind, r.refundKind, r.totalMinor]);
    // Il Registro è in ordine DECRESCENTE di data: la rettifica, più recente, sta sopra.
    expect(await righeRegistro()).toEqual([
      ['refund', 'return_with_restock', -1000],
      ['sale', null, 2000],
    ]);
    const riepilogo = await corrispettivi.getSummary(IDS.tenantA, periodo as never);
    expect(riepilogo).toMatchObject({ refundCount: 1, refundTotalMinor: 1000 });
    expect(riepilogo.netTotalMinor).toBe(riepilogo.totalMinor - 1000);
    const report = new BusinessAnalyticsService(prisma as never);
    const cruscotto = async () => {
      const r = await report.getSummary(
        IDS.tenantA,
        { period: 'custom', from: oggi, to: oggi },
        testOwnerUser(),
      );
      return {
        vendite: r.sales.transactionCount,
        pezzi: r.sales.unitsSold,
        valore: r.revenue.totalMinor,
      };
    };
    expect(await cruscotto()).toEqual({ vendite: 1, pezzi: 1, valore: 1000 });
    const ordiniVendita = new SalesOrdersService(prisma as never);
    const elenco = await ordiniVendita.list(IDS.tenantA, {
      page: 1,
      pageSize: 50,
      sort: 'refundTotal:desc',
    } as never);
    expect(elenco.items[0]).toMatchObject({ id: ordineVf.id, currentTotalMinor: 1000 });
    const csv = await esportazione.exportAccountantCsv(IDS.tenantA, periodo as never);
    const righeCsv = csv.split(/\r?\n/).filter((r) => r.includes(String(ordine.name ?? '')));
    expect(righeCsv).toHaveLength(2);
    expect(righeCsv.some((r) => r.includes('-10,00'))).toBe(true);

    // Un secondo recupero, e poi il webhook in ritardo: niente due volte, da nessuna parte.
    // ⭐ Misurato anche sul database: un recupero a cose ferme non scrive sulle tabelle
    //    degli effetti FISICI e delle Vendite (movimenti, giacenze, impegni, Vendite) —
    //    ciò che conta per un controllo periodico. ⚠️ Le righe del rimborso invece si
    //    riscrivono per intero a ogni riapplicazione (`persistRefunds`: «il canale è la
    //    verità»): è una riscrittura in posto, non un doppione — lo dice la fotografia.
    contatore.azzera();
    negozio.azzeraChiamate();
    await ordersPull.recuperaOrdini(IDS.tenantA, daId!);
    expect(negozio.chiamate.get('listOrdersSinceId')).toBe(1);
    expect(negozio.chiamate.get('getOrder')).toBe(1);
    const scrittureFisiche = contatore
      .scritture()
      .filter((s) =>
        [
          'stock_movements',
          'inventory_levels',
          'stock_reservations',
          'stock_reservation_events',
          'online_sales',
          'online_sale_lines',
        ].some((t) => s.endsWith(' ' + t)),
      );
    expect(scrittureFisiche).toEqual([]);
    expect(await fotografia()).toEqual(dopoRecupero);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', conReso);
    expect(await fotografia()).toEqual(dopoRecupero);
    expect(await righeRegistro()).toHaveLength(2);
    expect(await cruscotto()).toEqual({ vendite: 1, pezzi: 1, valore: 1000 });
    expect(await conosciuti()).toBe(1);
  });

  // ── 20 · Un evento VECCHIO che arriva dopo: l'ordine non torna indietro ──

  /**
   * ⭐ Shopify non garantisce l'ordine di consegna: nella prova 4 (13/09/2026) l'`orders/updated`
   *    di uno stato intermedio è arrivato DOPO che l'ordine era già evaso in VestiFlow, e non ha
   *    fatto danni. Nessuna prova lo teneva fermo. Qui il payload della creazione (aperto, senza
   *    spedizioni) torna dopo l'evasione, da solo e insieme a quello evaso: niente si riapre,
   *    nessun impegno rinasce, nessun secondo scarico o seconda Vendita.
   */
  it('20 · un vecchio «orders/updated» aperto che arriva DOPO l’evasione: l’ordine non torna indietro, nessun impegno rinasce, nessun secondo scarico né seconda Vendita — da solo e in concorrenza con l’evaso', async () => {
    const remoto = negozio.semina({
      title: 'Camicia tardiva',
      opzioni: [{ name: 'Taglia', values: ['M'] }],
      varianti: [{ sku: 'TARD-1', barcode: null, price: '10.00', valori: ['M'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);
    const variante = await varianteConSku('TARD-1');

    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'TARD-1', inventoryItemId: item, quantity: 2 }],
      locationId: SEDE_REMOTA,
    });
    // Il payload della creazione, fotografato: è quello che Shopify riconsegna tale e quale.
    //    Un vero `orders/create` arriva spesso PRIMA del pagamento: `pending`.
    const vecchio = {
      ...(JSON.parse(JSON.stringify(ordine)) as Record<string, unknown>),
      financial_status: 'pending',
    };
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    expect(await livello(variante.id)).toEqual({ onHand: 10, committed: 2, available: 8 });
    const evaso = negozio.evadiOrdineRemoto(Number(ordine.id));
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso);
    const ordineVf = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: `gid://shopify/Order/${ordine.id}` },
      select: { id: true },
    });
    const fotografia = async () => ({
      testata: await prisma.salesOrder.findUniqueOrThrow({
        where: { id: ordineVf.id },
        select: {
          fulfillmentStatus: true,
          financialStatus: true,
          fulfilledAt: true,
          cancelledAt: true,
          refundTotalMinor: true,
        },
      }),
      impegniAttivi: await prisma.stockReservation.count({
        where: { salesOrderId: ordineVf.id, status: 'active' },
      }),
      livello: await livello(variante.id),
      scarichi: await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'online_sale' },
      }),
      vendite: await prisma.onlineSale.count({
        where: { tenantId: IDS.tenantA, salesOrderId: ordineVf.id },
      }),
      spedizioni: await prisma.salesOrderShipment.count({ where: { salesOrderId: ordineVf.id } }),
    });
    const evasoInVf = await fotografia();
    expect(evasoInVf).toMatchObject({
      testata: { fulfillmentStatus: 'fulfilled', cancelledAt: null },
      impegniAttivi: 0,
      livello: { onHand: 8, committed: 0, available: 8 },
      scarichi: 1,
      vendite: 1,
      spedizioni: 1,
    });
    expect(evasoInVf.testata.fulfilledAt).not.toBeNull();

    // Il VECCHIO evento arriva dopo: come `orders/updated` e come `orders/create` riconsegnato.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', vecchio);
    expect(await fotografia()).toEqual(evasoInVf);
    await sync.handleWebhook(IDS.tenantA, 'orders/create', vecchio);
    expect(await fotografia()).toEqual(evasoInVf);
    // E in CONCORRENZA con l'evaso: qualunque sia l'ordine di applicazione, lo stesso stato.
    await Promise.all([
      sync.handleWebhook(IDS.tenantA, 'orders/updated', vecchio),
      sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso),
    ]);
    expect(await fotografia()).toEqual(evasoInVf);
    // Dieci volte, in ordine casuale d'arrivo: la riga bloccata decide, non la fortuna.
    for (let giro = 0; giro < 10; giro += 1) {
      await Promise.all([
        sync.handleWebhook(IDS.tenantA, 'orders/updated', evaso),
        sync.handleWebhook(IDS.tenantA, 'orders/updated', vecchio),
        sync.handleWebhook(IDS.tenantA, 'orders/create', vecchio),
      ]);
    }
    expect(await fotografia()).toEqual(evasoInVf);

    // ⭐ La regola, esplicita: l'ordine ricorda l'ULTIMO `updated_at` applicato; un payload
    //    più vecchio è «skipped», uno con lo STESSO `updated_at` si applica (è così che la
    //    rilettura dopo `fulfillment_orders/moved` — stesso `updated_at` — cambia la sede,
    //    percorso 16) e resta senza effetti nuovi.
    expect(
      (
        await prisma.salesOrder.findUniqueOrThrow({
          where: { id: ordineVf.id },
          select: { shopifyUpdatedAt: true },
        })
      ).shopifyUpdatedAt,
    ).toEqual(new Date(String(evaso.updated_at)));
    expect(await sync.applyOrderFromShopify(IDS.tenantA, vecchio, 'continua')).toBe('skipped');
    expect(await sync.applyOrderFromShopify(IDS.tenantA, evaso, 'continua')).toBe('updated');
    expect(await fotografia()).toEqual(evasoInVf);
  });

  // ── 21 · Annullamento e rimborso a webhook fermi, ordini POST-attivazione ──

  /**
   * ⭐ La scansione per id del recupero rilegge TUTTI gli ordini nati dopo il confine
   *    (`status=any`): un annullamento e un rimborso avvenuti nel silenzio si acquisiscono da
   *    lì, senza letture singole. Tre ordini: uno aperto poi ANNULLATO, uno evaso poi
   *    RIMBORSATO (reso con reintegro), uno nato E annullato — tutto a webhook fermi.
   */
  it('21 · annullamento e rimborso a webhook fermi su ordini dopo l’attivazione: il recupero li acquisisce; secondo recupero e notifiche tardive lasciano quantità e rettifiche applicate una volta', async () => {
    const remoto = negozio.semina({
      title: 'Pantalone silenzio',
      opzioni: [{ name: 'Taglia', values: ['46'] }],
      varianti: [{ sku: 'SIL-1', barcode: null, price: '10.00', valori: ['46'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    const attivato = await setup.attiva(IDS.tenantA);
    const daId = attivato.esito?.attivazione?.ordersSinceId;
    expect(daId).toBe('0');
    const variante = await varianteConSku('SIL-1');
    const riga = (o: Record<string, unknown>) => (o.line_items as { id: number }[])[0]!.id;
    const gid = (o: Record<string, unknown>) => `gid://shopify/Order/${o.id}`;
    const annullaSulNegozio = (id: number) => {
      // Come fa Shopify quando si annulla con rimborso: `cancelled_at` e stato finanziario.
      const stato = negozio.ordiniRemoti.get(id)!;
      negozio.ordiniRemoti.set(id, {
        ...stato,
        cancelled_at: new Date().toISOString(),
        financial_status: 'refunded',
        updated_at: new Date().toISOString(),
      });
      return negozio.ordiniRemoti.get(id)!;
    };

    // A · aperto col webhook (impegno 2)…
    const aperto = negozio.creaOrdineRemoto({
      righe: [{ sku: 'SIL-1', inventoryItemId: item, quantity: 2 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', aperto);
    // B · …evaso col webhook (scarico 3, Vendita).
    const evaso = negozio.creaOrdineRemoto({
      righe: [{ sku: 'SIL-1', inventoryItemId: item, quantity: 3 }],
      locationId: SEDE_REMOTA,
    });
    await sync.handleWebhook(IDS.tenantA, 'orders/create', evaso);
    await sync.handleWebhook(
      IDS.tenantA,
      'orders/updated',
      negozio.evadiOrdineRemoto(Number(evaso.id)),
    );
    expect(await livello(variante.id)).toEqual({ onHand: 7, committed: 2, available: 5 });

    // I webhook si fermano. A viene annullato; B rimborsato di 1 con reintegro; C nasce e
    // viene annullato subito. Shopify: on_hand 8 (il reso), impegni 0.
    negozio.rimborsaOrdineRemoto(Number(aperto.id), {
      righe: [{ lineItemId: riga(aperto), quantity: 2, restockType: 'cancel' }],
    });
    const apertoAnnullato = annullaSulNegozio(Number(aperto.id));
    const evasoRimborsato = negozio.rimborsaOrdineRemoto(Number(evaso.id), {
      righe: [
        { lineItemId: riga(evaso), quantity: 1, restockType: 'return', locationId: SEDE_REMOTA },
      ],
    });
    const natoEAnnullato = negozio.creaOrdineRemoto({
      righe: [{ sku: 'SIL-1', inventoryItemId: item, quantity: 1 }],
      locationId: SEDE_REMOTA,
    });
    negozio.rimborsaOrdineRemoto(Number(natoEAnnullato.id), {
      righe: [{ lineItemId: riga(natoEAnnullato), quantity: 1, restockType: 'cancel' }],
    });
    const natoEAnnullatoFinale = annullaSulNegozio(Number(natoEAnnullato.id));
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    // VestiFlow non sa niente: A ancora impegnato, B senza rimborso, C assente.
    expect(await livello(variante.id)).toEqual({ onHand: 7, committed: 2, available: 5 });
    expect(
      await prisma.salesOrder.count({
        where: { tenantId: IDS.tenantA, shopifyOrderId: gid(natoEAnnullato) },
      }),
    ).toBe(0);

    const fotografia = async () => {
      const ordini = await prisma.salesOrder.findMany({
        where: { tenantId: IDS.tenantA, shopifyOrderId: { not: null } },
        orderBy: { orderNumber: 'asc' },
        select: {
          shopifyOrderId: true,
          fulfillmentStatus: true,
          refundTotalMinor: true,
          currentTotalMinor: true,
          _count: { select: { refunds: true } },
        },
      });
      const annullati = await prisma.salesOrder.findMany({
        where: { tenantId: IDS.tenantA, shopifyOrderId: { not: null }, cancelledAt: { not: null } },
        select: { shopifyOrderId: true },
      });
      return {
        ordini: ordini.map((o) => [
          o.shopifyOrderId,
          o.fulfillmentStatus,
          o.refundTotalMinor,
          o.currentTotalMinor,
          o._count.refunds,
        ]),
        annullati: annullati.map((o) => o.shopifyOrderId).sort(),
        impegniAttivi: await prisma.stockReservation.count({
          where: { tenantId: IDS.tenantA, status: 'active' },
        }),
        livello: await livello(variante.id),
        scarichi: await prisma.stockMovement.count({
          where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'online_sale' },
        }),
        carichi: await prisma.stockMovement.count({
          where: { tenantId: IDS.tenantA, variantId: variante.id, type: 'return' },
        }),
        vendite: await prisma.onlineSale.count({ where: { tenantId: IDS.tenantA } }),
        // ⚠️ Niente conteggio degli eventi: una notifica in ritardo di uno stato INTERMEDIO
        //    (il payload della creazione di C, `updated_at` più vecchio) entra come evento
        //    con la propria chiave, senza effetti — come nella prova 4 sul negozio. Gli
        //    effetti sono le righe qui sopra, non il registro tecnico.
      };
    };

    // Il recupero: tutto dalla scansione per id, nessuna lettura singola.
    negozio.azzeraChiamate();
    const recupero = await ordersPull.recuperaOrdini(IDS.tenantA, daId!);
    expect(recupero).toMatchObject({ nuovi: 1, aggiornati: 2, riletti: 0, falliti: [] });
    expect(negozio.chiamate.get('listOrdersSinceId')).toBe(1);
    expect(negozio.chiamate.get('getOrder')).toBeUndefined();
    const dopoRecupero = await fotografia();
    expect(dopoRecupero).toMatchObject({
      ordini: [
        [gid(aperto), 'unfulfilled', 2000, 0, 1],
        [gid(evaso), 'fulfilled', 1000, 2000, 1],
        [gid(natoEAnnullato), 'unfulfilled', 1000, 0, 1],
      ],
      annullati: [gid(aperto), gid(natoEAnnullato)].sort(),
      impegniAttivi: 0,
      // A rilasciato (−2 impegnati), B reintegrato di 1 (on_hand 7 → 8), C mai impegnato.
      livello: { onHand: 8, committed: 0, available: 8 },
      scarichi: 1,
      carichi: 1,
      vendite: 1,
    });

    // Registro, riepilogo e Cruscotto: la vendita di B con la sua rettifica; A e C sono
    // annullamenti DICHIARATI, mai evasi, fuori dal Registro.
    const corrispettivi = new CorrispettiviService(prisma as never);
    const oggi = new Date().toISOString().slice(0, 10);
    const periodo = { placedFrom: oggi, placedTo: oggi, page: 1, pageSize: 500 };
    const registro = async () =>
      (await corrispettivi.buildRegisterRows(IDS.tenantA, periodo)).map((r) => [
        r.kind,
        r.totalMinor,
      ]);
    expect(await registro()).toEqual([
      ['refund', -1000],
      ['sale', 3000],
    ]);
    const riepilogo = await corrispettivi.getSummary(IDS.tenantA, periodo as never);
    expect(riepilogo).toMatchObject({
      refundCount: 1,
      refundTotalMinor: 1000,
      cancellationCount: 2,
    });
    const report = new BusinessAnalyticsService(prisma as never);
    const cruscotto = async () => {
      const r = await report.getSummary(
        IDS.tenantA,
        { period: 'custom', from: oggi, to: oggi },
        testOwnerUser(),
      );
      return {
        vendite: r.sales.transactionCount,
        pezzi: r.sales.unitsSold,
        valore: r.revenue.totalMinor,
      };
    };
    expect(await cruscotto()).toEqual({ vendite: 1, pezzi: 2, valore: 2000 });

    // Secondo recupero, poi le notifiche in ritardo (riconsegnate da Shopify), poi ancora
    // un recupero: quantità e rettifiche applicate una volta sola, ovunque.
    await ordersPull.recuperaOrdini(IDS.tenantA, daId!);
    expect(await fotografia()).toEqual(dopoRecupero);
    await sync.handleWebhook(IDS.tenantA, 'orders/cancelled', apertoAnnullato);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', evasoRimborsato);
    await sync.handleWebhook(IDS.tenantA, 'orders/create', natoEAnnullato);
    await sync.handleWebhook(IDS.tenantA, 'orders/cancelled', natoEAnnullatoFinale);
    expect(await fotografia()).toEqual(dopoRecupero);
    await ordersPull.recuperaOrdini(IDS.tenantA, daId!);
    expect(await fotografia()).toEqual(dopoRecupero);
    expect(await registro()).toEqual([
      ['refund', -1000],
      ['sale', 3000],
    ]);
    expect(await cruscotto()).toEqual({ vendite: 1, pezzi: 2, valore: 2000 });
  });

  // ── 22 e 23 · Lo scarto dei payload vecchi non perde ciò che non è ancora acquisito ──

  /**
   * Tre stati dello stesso ordine con `updated_at` crescenti — creato → evaso → rimborsato di
   * 1 con reintegro — e la fotografia degli effetti, per i percorsi 22 e 23.
   */
  async function ordineInTreStati(sku: string, item: string, sedeEvasione = SEDE_REMOTA) {
    const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const creato = negozio.creaOrdineRemoto({
      righe: [{ sku, inventoryItemId: item, quantity: 3 }],
      locationId: SEDE_REMOTA,
    });
    const payloadCreato = JSON.parse(JSON.stringify(creato)) as Record<string, unknown>;
    await attesa(5);
    const payloadEvaso = JSON.parse(
      JSON.stringify(negozio.evadiOrdineRemoto(Number(creato.id), sedeEvasione)),
    ) as Record<string, unknown>;
    await attesa(5);
    const rigaOrdine = (creato.line_items as { id: number }[])[0]!.id;
    const payloadRimborsato = negozio.rimborsaOrdineRemoto(Number(creato.id), {
      righe: [
        { lineItemId: rigaOrdine, quantity: 1, restockType: 'return', locationId: SEDE_REMOTA },
      ],
    });
    const quando = (o: Record<string, unknown>) => new Date(String(o.updated_at)).getTime();
    expect(quando(payloadEvaso)).toBeGreaterThan(quando(payloadCreato));
    expect(quando(payloadRimborsato)).toBeGreaterThan(quando(payloadEvaso));
    return {
      gid: `gid://shopify/Order/${creato.id}`,
      payloadCreato,
      payloadEvaso,
      payloadRimborsato,
    };
  }

  async function fotografiaEffetti(gid: string, variantId: string) {
    const ordine = await prisma.salesOrder.findFirst({
      where: { tenantId: IDS.tenantA, shopifyOrderId: gid },
      select: {
        id: true,
        fulfillmentStatus: true,
        fulfilledAt: true,
        refundTotalMinor: true,
        currentTotalMinor: true,
        shopifyUpdatedAt: true,
        _count: { select: { refunds: true, shipments: true } },
      },
    });
    return {
      stato: ordine
        ? [
            ordine.fulfillmentStatus,
            ordine.fulfilledAt !== null,
            ordine.refundTotalMinor,
            ordine.currentTotalMinor,
          ]
        : null,
      rimborsi: ordine?._count.refunds ?? 0,
      spedizioni: ordine?._count.shipments ?? 0,
      applicato: ordine?.shopifyUpdatedAt ?? null,
      impegniAttivi: ordine
        ? await prisma.stockReservation.count({
            where: { salesOrderId: ordine.id, status: 'active' },
          })
        : 0,
      livello: await livello(variantId),
      scarichi: await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId, type: 'online_sale' },
      }),
      carichi: await prisma.stockMovement.count({
        where: { tenantId: IDS.tenantA, variantId, type: 'return' },
      }),
      vendite: ordine
        ? await prisma.onlineSale.count({
            where: { tenantId: IDS.tenantA, salesOrderId: ordine.id },
          })
        : 0,
    };
  }

  /**
   * ⭐ Il payload di `orders/updated` è l'ordine INTERO al momento dell'evento: il più
   *    recente porta anche spedizioni e rimborsi degli eventi precedenti. Se arriva per
   *    primo si applica tutto da lui, e i vecchi che seguono non hanno niente da aggiungere.
   */
  it('22 · il più recente arriva per primo e porta spedizione e rimborso; i vecchi dopo sono scartati e non tolgono né aggiungono', async () => {
    const remoto = negozio.semina({
      title: 'Gonna intera',
      opzioni: [{ name: 'Taglia', values: ['42'] }],
      varianti: [{ sku: 'INT-1', barcode: null, price: '10.00', valori: ['42'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);
    const variante = await varianteConSku('INT-1');
    const { gid, payloadCreato, payloadEvaso, payloadRimborsato } = await ordineInTreStati(
      'INT-1',
      item,
    );

    await sync.handleWebhook(IDS.tenantA, 'orders/updated', payloadRimborsato);
    const completo = await fotografiaEffetti(gid, variante.id);
    expect(completo).toEqual({
      stato: ['fulfilled', true, 1000, 2000],
      rimborsi: 1,
      spedizioni: 1,
      applicato: new Date(String(payloadRimborsato.updated_at)),
      impegniAttivi: 0,
      livello: { onHand: 8, committed: 0, available: 8 },
      scarichi: 1,
      carichi: 1,
      vendite: 1,
    });
    expect(await sync.applyOrderFromShopify(IDS.tenantA, payloadCreato, 'continua')).toBe(
      'skipped',
    );
    expect(await sync.applyOrderFromShopify(IDS.tenantA, payloadEvaso, 'continua')).toBe('skipped');
    await sync.handleWebhook(IDS.tenantA, 'orders/create', payloadCreato);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', payloadEvaso);
    expect(await fotografiaEffetti(gid, variante.id)).toEqual(completo);
  });

  /**
   * ⚠️ Il rischio da smentire è lo scarto INDISCRIMINATO: che una spedizione NON ancora
   *    acquisita — la sede da cui è partita non è collegata, quindi «Da verificare» e
   *    ripetibile (percorso 8) — non si possa più acquisire perché la testata ha già preso
   *    l'`updated_at` di quel payload. Non succede: uguale si applica, e dopo il collegamento
   *    della sede la STESSA notifica scarica una volta. I vecchi restano scartati.
   */
  it('23 · spedizione da una sede non collegata: il più recente scrive testata e rimborso ma non la spedizione; i vecchi sono scartati; collegata la sede, la stessa notifica (stesso updated_at) scarica una volta', async () => {
    const SEDE_SCONOSCIUTA = '77103';
    negozio.impostaLocation([
      { id: Number(SEDE_REMOTA), name: 'Negozio centro', active: true },
      { id: Number(SEDE_SCONOSCIUTA), name: 'Punto ritiro', active: true },
    ]);
    const remoto = negozio.semina({
      title: 'Gonna altrove',
      opzioni: [{ name: 'Taglia', values: ['44'] }],
      varianti: [{ sku: 'INT-2', barcode: null, price: '10.00', valori: ['44'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    negozio.impostaQuantitaRemota(item, SEDE_SCONOSCIUTA, 5);
    await setup.scegliDirezione(IDS.tenantA, ShopifySetupDirection.shopify_to_vestiflow);
    await setup.scegliSede(IDS.tenantA, SEDE_REMOTA, { choice: 'collega', locationId: IDS.locA1 });
    await setup.scegliSede(IDS.tenantA, SEDE_SCONOSCIUTA, { choice: 'lascia' });
    await setup.anteprima(IDS.tenantA);
    await setup.conferma(IDS.tenantA);
    await transfer.attendi(IDS.tenantA);
    await setup.attiva(IDS.tenantA);
    const variante = await varianteConSku('INT-2');
    // Evaso dal punto ritiro (non collegato), reso reintegrato al negozio (collegato).
    const { gid, payloadCreato, payloadEvaso, payloadRimborsato } = await ordineInTreStati(
      'INT-2',
      item,
      SEDE_SCONOSCIUTA,
    );

    await sync.handleWebhook(IDS.tenantA, 'orders/updated', payloadRimborsato);
    const aMeta = await fotografiaEffetti(gid, variante.id);
    // Testata, rimborso (carico del reso al negozio: 10 → 11), spedizione e Vendita sono
    // FATTI del canale e si registrano; lo SCARICO fisico no: la riga non ha sede, l'ordine
    // è «Da verificare» (percorsi 12 e 16), e l'uscita resta da applicare.
    expect(aMeta).toMatchObject({
      applicato: new Date(String(payloadRimborsato.updated_at)),
      rimborsi: 1,
      spedizioni: 1,
      scarichi: 0,
      carichi: 1,
      vendite: 1,
      livello: { onHand: 11, committed: 0, available: 11 },
    });
    const segnalato = await prisma.salesOrder.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyOrderId: gid },
      select: { requiresReview: true, reviewReason: true },
    });
    expect(segnalato.requiresReview).toBe(true);
    // I vecchi arrivano adesso: scartati, e non «completano» niente con dati vecchi.
    expect(await sync.applyOrderFromShopify(IDS.tenantA, payloadCreato, 'continua')).toBe(
      'skipped',
    );
    expect(await sync.applyOrderFromShopify(IDS.tenantA, payloadEvaso, 'continua')).toBe('skipped');
    expect(await fotografiaEffetti(gid, variante.id)).toEqual(aMeta);

    // Una persona crea e collega il punto ritiro: la STESSA notifica (stesso `updated_at`)
    // ora scarica da lì, una volta.
    const dopoScelta = await setup.scegliSede(IDS.tenantA, SEDE_SCONOSCIUTA, { choice: 'crea' });
    const sedeNuova = dopoScelta.locations.find((l) => l.shopifyLocationId === SEDE_SCONOSCIUTA)!;
    expect(sedeNuova.locationId).not.toBeNull();
    await prisma.location.update({
      where: { id: sedeNuova.locationId! },
      data: { licensedInVf: true },
    });
    expect(await sync.applyOrderFromShopify(IDS.tenantA, payloadRimborsato, 'continua')).toBe(
      'updated',
    );
    const completo = await fotografiaEffetti(gid, variante.id);
    expect(completo).toMatchObject({
      stato: ['fulfilled', true, 1000, 2000],
      rimborsi: 1,
      spedizioni: 1,
      applicato: new Date(String(payloadRimborsato.updated_at)),
      impegniAttivi: 0,
      scarichi: 1,
      carichi: 1,
      vendite: 1,
      livello: { onHand: 11, committed: 0, available: 11 },
    });
    expect(
      await prisma.stockMovement.count({
        where: {
          tenantId: IDS.tenantA,
          variantId: variante.id,
          locationId: sedeNuova.locationId!,
          type: 'online_sale',
        },
      }),
    ).toBe(1);
    // Ancora la stessa notifica, e ancora i vecchi: niente cambia.
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', payloadRimborsato);
    await sync.handleWebhook(IDS.tenantA, 'orders/updated', payloadEvaso);
    await sync.handleWebhook(IDS.tenantA, 'orders/create', payloadCreato);
    expect(await fotografiaEffetti(gid, variante.id)).toEqual(completo);
  });

  /**
   * MISURA (15/09/2026, `docs/30` 7-bis): due `orders/create` per lo STESSO ordine NUOVO,
   * insieme. Letto nel codice: entrambe trovano «assente», entrambe creano, la seconda cade
   * sull'unicità `[tenantId, shopifyOrderId]`. Qui si misura che cosa succede davvero —
   * senza cambiare il comportamento prima di averlo misurato.
   */
  it('24 · due «orders/create» concorrenti sullo stesso ordine NUOVO: un solo ordine, un solo impegno, e l’esito delle due chiamate misurato', async () => {
    const remoto = negozio.semina({
      title: 'Felpa concorrente',
      opzioni: [{ name: 'Taglia', values: ['M'] }],
      varianti: [{ sku: 'CONC-1', barcode: null, price: '10.00', valori: ['M'] }],
    });
    const item = String(remoto.variants[0]!.inventory_item_id);
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await percorsoFinoATrasferito(ShopifySetupDirection.shopify_to_vestiflow);
    await setup.attiva(IDS.tenantA);
    const variante = await varianteConSku('CONC-1');

    const ordine = negozio.creaOrdineRemoto({
      righe: [{ sku: 'CONC-1', inventoryItemId: item, quantity: 4 }],
      locationId: SEDE_REMOTA,
    });
    const gid = `gid://shopify/Order/${ordine.id}`;

    const esiti = await Promise.allSettled([
      sync.handleWebhook(IDS.tenantA, 'orders/create', ordine),
      sync.handleWebhook(IDS.tenantA, 'orders/create', ordine),
    ]);
    const letti = esiti.map((e) =>
      e.status === 'fulfilled'
        ? 'ok'
        : `rifiutata: ${(e.reason as { code?: string; message?: string }).code ?? ''} ${String(
            (e.reason as { message?: string }).message ?? '',
          )
            .split(String.fromCharCode(10))[0]
            ?.slice(0, 80)}`,
    );

    // Gli effetti: un ordine solo, un impegno solo da 4, un evento canonico di creazione.
    expect(
      await prisma.salesOrder.count({ where: { tenantId: IDS.tenantA, shopifyOrderId: gid } }),
    ).toBe(1);
    const effetti = await fotografiaEffetti(gid, variante.id);
    expect(effetti.impegniAttivi).toBe(1);
    expect(effetti.livello.committed).toBe(4);
    // ⚠️ MISURATO il 15/09/2026: una riesce, l'altra cade con P2002 (unicità
    //    `[tenantId, shopifyOrderId]`) non gestito → al controller è un 5xx → Shopify la
    //    ritenta. Non è un doppione, è un ritentativo in più. Cambiarlo (es. accogliere il
    //    P2002 come «già creato» e proseguire come aggiornamento) è una decisione a parte.
    expect(letti.sort()).toEqual(['ok', 'rifiutata: P2002 ']);

    // Il ritentativo di Shopify, ora che l'ordine esiste: aggiornamento idempotente, effetti
    // uguali a prima (stesso `updated_at`, stessa chiave degli eventi).
    const eventi = () =>
      prisma.onlineOrderEvent.findMany({
        where: { tenantId: IDS.tenantA, externalOrderId: gid },
        select: { type: true },
        orderBy: { type: 'asc' },
      });
    const prima = { effetti: await fotografiaEffetti(gid, variante.id), eventi: await eventi() };
    await sync.handleWebhook(IDS.tenantA, 'orders/create', ordine);
    // Effetti identici; nel registro un solo evento in più, ed è la TRACCIA dell'aggiornamento
    // (`online_order_updated`), non un secondo impegno o una seconda creazione.
    expect(await fotografiaEffetti(gid, variante.id)).toEqual(prima.effetti);
    expect(await eventi()).toEqual(
      [...prima.eventi, { type: 'online_order_updated' }].sort((x, y) =>
        x.type.localeCompare(y.type),
      ),
    );
  });
});
