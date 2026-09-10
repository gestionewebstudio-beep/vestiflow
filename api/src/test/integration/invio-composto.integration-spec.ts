import { Logger } from '@nestjs/common';
import { OnlineOrderEventType, SalesOrderSource, type PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserProfileDto } from '../../auth/dto/user-profile.dto';
import { ChannelSyncFacade } from '../../channels/channel-sync.facade';
import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { CreationIntentService } from '../../common/idempotency/creation-intent.util';
import { DocumentPriceModePreferenceService } from '../../documents/document-price-mode-preference.service';
import { DocumentSettingsService } from '../../documents/document-settings.service';
import { OnlineOrderLifecycleService } from '../../order-reservations/online-order-lifecycle.service';
import { OnlineSaleFulfillmentService } from '../../order-reservations/online-sale-fulfillment.service';
import { StockReservationService } from '../../order-reservations/stock-reservation.service';
import { StoreSalesService } from '../../store-sales/store-sales.service';
import { applyCommittedDelta } from '../../order-reservations/committed-delta.util';
import { applyInventoryDelta } from '../../inventory/inventory-level-delta.util';
import { ShopifyInventoryAlignService } from '../../shopify/shopify-inventory-align.service';
import type {
  BloccoAllineamento,
  CoppiaNonAllineata,
  MotivoNonAllineata,
  PosizioneAllineamento,
} from '../../shopify/shopify-inventory-align.service';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import { ShopifyInventoryRepublishService } from '../../shopify/shopify-inventory-republish.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * IL VALORE COMPOSTO — il percorso completo, non la contabilità.
 *
 * ⛔ **Perché serviva questa prova.** Quelle sui contatori chiamano le funzioni
 *    delle quantità **a mano**, passando l'origine: dimostrano che la
 *    registrazione è giusta, non che l'invio usi la distinzione. Qui girano i
 *    **servizi veri** contro PostgreSQL e il negozio simulato.
 *
 * ⭐ **Il caso centrale, per intero**:
 *
 * ```text
 *   partenza          VestiFlow 10   Shopify 10
 *   vendita ONLINE    VestiFlow 10   Shopify  9   (non ancora acquisita)
 *   vendita al banco  VestiFlow  9   Shopify  9
 *   INVIO             VestiFlow  9   Shopify  8   <- composto su 9, non su 10
 *   arriva l ordine   VestiFlow  8   Shopify  8   <- nessuna seconda sottrazione
 * ```
 */
describe('Invio composto — il percorso completo su servizi reali', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;

  const DOMINIO = 'composto.myshopify.com';
  const SEDE_REMOTA = '77001';

  let variantId: string;
  let inventoryItemId: string;

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
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
    negozio = new NegozioSimulato(DOMINIO, 997000);

    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/997001' },
    });
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId: riga.id,
        scopes: ['read_products', 'write_products', 'write_inventory'],
      },
    });
    await prisma.shopifyCredential.create({
      data: {
        tenantId: IDS.tenantA,
        shopDomain: DOMINIO,
        accessTokenEnc: 'cifrato',
        scopes: ['read_products', 'write_products', 'write_inventory'],
      },
    });
    await prisma.location.update({
      where: { id: IDS.locA1 },
      data: { shopifyLocationId: SEDE_REMOTA },
    });

    const prodotto = await prisma.product.create({
      data: { tenantId: IDS.tenantA, name: 'Articolo composto', articleCode: 'COMP-1' },
    });
    // ⚠️ NUMERICO, non GID: il percorso di scrittura del simulatore normalizza
    //    il GID a numero mentre la lettura no, e le due chiavi non coinciderebbero.
    inventoryItemId = '997050';
    const variante = await prisma.productVariant.create({
      data: {
        tenantId: IDS.tenantA,
        productId: prodotto.id,
        sku: 'COMP-1',
        sellingPriceMinor: 100,
        shopifyVariantId: 'gid://shopify/ProductVariant/997040',
        shopifyInventoryItemId: inventoryItemId,
      },
    });
    variantId = variante.id;

    await prisma.inventoryLevel.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        onHand: 10,
        available: 10,
        committed: 0,
      },
    });
  });

  /** ⭐ Un esecutore NUOVO: niente sopravvive in memoria fra una fase e l'altra. */
  function nuovoEsecutore(graphql: unknown = negozio.graphql()) {
    return new ShopifyInventoryPushService(
      prisma as never,
      negozio.oauth() as never,
      negozio.admin() as never,
      graphql as never,
      { touchSync: vi.fn() } as never,
      new ShopifyInventoryReconciliationService(prisma as never),
      storico,
      registro,
    );
  }

  /** La riga di stato CON base: è la partenza controllata, fatta a mano qui. */
  async function conBase(P: number, L = 0, C = 0) {
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        lastPushedAvailable: P,
        localPendingDelta: L,
        channelAcquiredDelta: C,
      },
    });
  }

  const stato = async () =>
    prisma.shopifyInventorySyncState.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
      select: {
        lastPushedAvailable: true,
        localPendingDelta: true,
        channelAcquiredDelta: true,
        pendingKey: true,
      },
    });

  const disponibile = async () =>
    (
      await prisma.inventoryLevel.findFirstOrThrow({
        where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
        select: { available: true },
      })
    ).available;

  const remoto = () => negozio.quantitaRemota(inventoryItemId, SEDE_REMOTA);

  it('⭐ IL CASO CENTRALE, per intero: 10 → 9 online → banco → invio 8 → acquisizione', async () => {
    await conBase(10);
    negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

    // 1. Vendita ONLINE su Shopify: il canale scende a 9. Da noi ancora niente.
    negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 9);
    expect(await disponibile()).toBe(10);

    // 2. Vendita al banco di 1: locale, da trasmettere.
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
    });
    expect(await disponibile()).toBe(9);
    expect((await stato()).localPendingDelta).toBe(-1);

    // 3. INVIO: composto su ciò che il canale porta ADESSO (9), non su 10.
    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

    expect(esito.pushed).toBe(true);
    // ⭐ Il canale scende a 8: la vendita al banco è arrivata SENZA cancellare
    //    l'ordine online che Shopify aveva già applicato.
    expect(remoto()).toBe(8);

    const dopo = await stato();
    expect(dopo.lastPushedAvailable).toBe(8);
    // ⭐ Scaricato esattamente quanto trasmesso: L torna a zero.
    expect(dopo.localPendingDelta).toBe(0);
    expect(dopo.pendingKey).toBeNull();

    // 4. Arriva l'ordine online e viene acquisito: impegno +1 → disponibile −1.
    await prisma.$transaction(async (tx) => {
      await applyCommittedDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'canale');
    });
    expect(await disponibile()).toBe(8);

    // ⛔ E NON parte una seconda sottrazione sul canale: non c'è lavoro locale.
    const secondo = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
    expect(secondo.pushed).toBe(false);
    expect(secondo.reason).toBe('unchanged');
    expect(remoto()).toBe(8);
    expect(await disponibile()).toBe(8);
  });

  it('⭐ operazione arrivata DURANTE l’invio: non viene cancellata dalla conferma', async () => {
    await conBase(10);
    negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
    });

    // ⭐ Una seconda vendita al banco entra MENTRE la scrittura è in volo, cioè
    //    dopo la fotografia del tentativo e prima della conferma.
    const graphql = negozio.graphql();
    const scritturaVera = graphql.setInventoryQuantities;
    graphql.setInventoryQuantities = vi.fn(async (...args: unknown[]) => {
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });
      return scritturaVera(...(args as Parameters<typeof scritturaVera>));
    }) as typeof scritturaVera;

    const esito = await nuovoEsecutore(graphql).pushLevel(IDS.tenantA, variantId, IDS.locA1);

    expect(esito.pushed).toBe(true);
    expect(remoto()).toBe(9);

    const dopo = await stato();
    // ⛔ Lo scarico toglie solo il −1 FOTOGRAFATO: il secondo sopravvive.
    //    Un'assegnazione a zero lo avrebbe perso, e quella vendita non sarebbe
    //    mai arrivata al canale.
    expect(dopo.localPendingDelta).toBe(-1);
    expect(await disponibile()).toBe(8);

    // E il giro dopo lo trasmette: 9 → 8.
    const secondo = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
    expect(secondo.pushed).toBe(true);
    expect(remoto()).toBe(8);
    expect((await stato()).localPendingDelta).toBe(0);
  });

  it('⭐ il lavoro arrivato durante l’invio lo ritrova la CODA, non una chiamata a mano', async () => {
    // ⛔ **La prova qui sopra dimostra che il residuo SOPRAVVIVE, non che
    //    qualcuno lo vada a prendere.** Chiamare un secondo `pushLevel` a mano
    //    è l'operatore che rifà il gesto: in esercizio nessuno lo rifà, e la
    //    vendita entrata durante la scrittura resterebbe ferma finché su quella
    //    coppia non capita per caso un altro movimento.
    await conBase(10);
    negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
    });

    const graphql = negozio.graphql();
    const scritturaVera = graphql.setInventoryQuantities;
    graphql.setInventoryQuantities = vi.fn(async (...args: unknown[]) => {
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });
      return scritturaVera(...(args as Parameters<typeof scritturaVera>));
    }) as typeof scritturaVera;

    const esito = await nuovoEsecutore(graphql).pushLevel(IDS.tenantA, variantId, IDS.locA1);
    expect(esito.pushed).toBe(true);
    expect(remoto()).toBe(9);
    expect((await stato()).localPendingDelta).toBe(-1);

    // ⭐ **Da qui in poi nessuno sa più niente di questa coppia**: la coda parte
    //    da sola e si porta un esecutore NUOVO, costruito adesso. Se il residuo
    //    non fosse scritto sulla riga, qui non ci sarebbe niente da trovare.
    const coda = new ShopifyInventoryRepublishService(prisma as never, nuovoEsecutore() as never);
    const esitoCoda = await coda.retryPending(IDS.tenantA);

    expect(esitoCoda.pending).toBeGreaterThanOrEqual(1);
    expect(esitoCoda.republished).toBe(1);
    expect(remoto()).toBe(8);
    expect(await disponibile()).toBe(8);
    expect((await stato()).localPendingDelta).toBe(0);
  });

  it('⭐ RISPOSTA PERSA: alla ripartenza non si applica due volte', async () => {
    await conBase(10);
    negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -2, 'locale');
    });

    // L'effetto viene applicato sul canale, la conferma non torna.
    negozio.perdiProssimaRisposta('setInventoryQuantities');
    const primo = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
    expect(primo.pushed).toBe(false);

    // Il canale ha già 8; il tentativo è rimasto aperto sulla riga.
    expect(remoto()).toBe(8);
    const mezzo = await stato();
    expect(mezzo.pendingKey).not.toBeNull();
    // ⛔ Il confermato NON è avanzato, e i contatori non si sono scaricati.
    expect(mezzo.lastPushedAvailable).toBe(10);
    expect(mezzo.localPendingDelta).toBe(-2);

    // ⭐ Ripartenza con un ESECUTORE NUOVO: il recupero sta sulla riga.
    const secondo = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

    // La chiave è la stessa: Shopify riconosce la ripetizione e non riapplica.
    expect(remoto()).toBe(8);
    expect(await disponibile()).toBe(8);
    const fine = await stato();
    expect(fine.pendingKey).toBeNull();
    expect(fine.lastPushedAvailable).toBe(8);
    // Scaricato UNA volta sola.
    expect(fine.localPendingDelta).toBe(0);
    // ⚠️ L'esito del RECUPERO non e' un invio nuovo: il tentativo si risolve
    //    ripetendo la chiave, e cio' che conta e' lo stato qui sopra.
    expect(secondo.reason).not.toBe('shopify_error');
  });

  it('⭐ residuo NEGATIVO: si pubblica 0 e il debito resta sul contatore', async () => {
    await conBase(10);
    negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

    // Oversell locale: −13 su 10.
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -13, 'locale');
    });

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

    expect(esito.pushed).toBe(true);
    // ⛔ Mai merce inesistente: si pubblica 0, non −3.
    expect(remoto()).toBe(0);
    const dopo = await stato();
    expect(dopo.lastPushedAvailable).toBe(0);
    // ⭐ Trasmesso 10 − 0 = −10; il debito residuo resta −3.
    expect(dopo.localPendingDelta).toBe(-3);

    // Un carico insufficiente non fa ripartire una scrittura inutile.
    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 2, 'locale');
    });
    const secondo = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
    expect(secondo.pushed).toBe(false);
    expect(secondo.reason).toBe('unchanged');
    expect(remoto()).toBe(0);
    expect((await stato()).localPendingDelta).toBe(-1);
  });

  /**
   * I TRE RACCORDI, trovati leggendo il codice e non eseguendolo.
   *
   * ⛔ Tutti e tre hanno la stessa forma: una decisione scritta quando
   *    `available` era l'unica quantita' che contava, rimasta intatta accanto al
   *    percorso nuovo. Il percorso nuovo funzionava; il contorno no.
   */
  describe('i raccordi col regime composto', () => {
    it('⭐ 1 · compensazione: Disponibile invariato, ma L va trasmesso', async () => {
      // ⛔ La scorciatoia dell'«invariata» guarda il Disponibile: qui torna a 10
      //    come l'ultimo confermato, e direbbe «niente da fare». Ma il carico
      //    locale non e' mai arrivato al canale.
      await conBase(10);
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 9);

      await prisma.$transaction(async (tx) => {
        // carico locale +1
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'locale');
        // ordine online −1, gia' applicato dal canale e ora acquisito
        await applyCommittedDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'canale');
      });

      expect(await disponibile()).toBe(10);
      const prima = await stato();
      expect(prima.lastPushedAvailable).toBe(10);
      expect(prima.localPendingDelta).toBe(1);

      const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

      // ⭐ T = max(0, 9 + 1) = 10: il canale sale, e il carico arriva.
      expect(esito.pushed).toBe(true);
      expect(remoto()).toBe(10);
      expect((await stato()).localPendingDelta).toBe(0);
    });

    it('⭐ 2 · il RITENTATIVO compone anch esso, non torna al totale assoluto', async () => {
      // Riga inizializzata con lavoro locale, marcata come disallineata.
      await conBase(10, -1);
      await prisma.shopifyInventorySyncState.updateMany({
        where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
        data: { mismatchDetected: true },
      });
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });
      // Disponibile 9, L = −2, canale a 9.
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 9);

      const esito = await nuovoEsecutore().ripubblicaDisallineamento(
        IDS.tenantA,
        variantId,
        IDS.locA1,
      );

      // ⛔ Il totale assoluto manderebbe 9. Il composto manda 9 + (−2) = 7.
      expect(esito.pushed).toBe(true);
      expect(remoto()).toBe(7);
      expect((await stato()).localPendingDelta).toBe(0);
    });

    it('⭐ 3 · la PRESA vede L: due variazioni che si compensano la fanno fallire', async () => {
      await conBase(10);
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });

      // ⭐ Fra la lettura coerente e la presa entrano DUE variazioni di origine
      //    diversa che si annullano sul Disponibile: +1 locale e −1 di canale.
      //    `available` resta 9, ma L passa da −1 a 0.
      let interposto = false;
      // ⭐ **Le prese TENTATE si contano**, ed è ciò che rende la prova specifica
      //    sull'incrocio: senza, resterebbe verde anche se a fermare l'invio
      //    fosse una guardia a monte, per un motivo che con la presa non
      //    c'entra niente. La presa è l'unica istruzione che scrive
      //    `pending_key` insieme a `pending_at`.
      let preseTentate = 0;
      const prismaSpia = new Proxy(prisma, {
        get(target, prop, receiver) {
          if (prop === '$queryRaw' || prop === '$executeRaw') {
            const originale = Reflect.get(target, prop, receiver) as (
              ...a: unknown[]
            ) => Promise<unknown>;
            const suLettura = prop === '$queryRaw';
            return async (...args: unknown[]) => {
              const pezzi = Array.isArray(args[0]) ? (args[0] as string[]).join(' ') : '';
              if (pezzi.includes('pending_key = ') && pezzi.includes('pending_at = NOW()')) {
                preseTentate += 1;
              }
              const esito = await originale.apply(target, args);
              // ⭐ L'interposizione avviene DOPO la lettura coerente e PRIMA
              //    della presa: è esattamente la finestra del rilievo.
              if (suLettura && !interposto) {
                interposto = true;
                await prisma.$transaction(async (tx) => {
                  await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'locale');
                  await applyCommittedDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'canale');
                });
              }
              return esito;
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });

      const esecutore = new ShopifyInventoryPushService(
        prismaSpia as never,
        negozio.oauth() as never,
        negozio.admin() as never,
        negozio.graphql() as never,
        { touchSync: vi.fn() } as never,
        new ShopifyInventoryReconciliationService(prisma as never),
        storico,
        registro,
      );

      const esito = await esecutore.pushLevel(IDS.tenantA, variantId, IDS.locA1);

      expect(interposto).toBe(true);
      // ⭐ **L'incrocio è avvenuto DAVVERO, ed è la premessa della prova**: il
      //    Disponibile è rimasto quello di prima — le due variazioni si sono
      //    annullate — mentre `L` è passato da −1 a 0. Senza queste due righe
      //    la prova non direbbe di stare misurando l'incrocio, ma solo che non
      //    è partito niente.
      expect(await disponibile()).toBe(9);
      expect((await stato()).localPendingDelta).toBe(0);

      // ⛔ Con L a 0 non c'e' niente da trasmettere: la presa DEVE fallire e il
      //    ciclo ricomporre, invece di scrivere un bersaglio calcolato su un L
      //    che non esiste piu'.
      expect(esito.pushed).toBe(false);
      // ⛔ **E deve fermarlo LA PRESA, non una guardia a monte.** La presa è
      //    stata tentata almeno una volta e non ha chiuso: senza questa
      //    asserzione la prova resterebbe verde anche se l'invio si fosse
      //    fermato prima, per un motivo che con l'incrocio non c'entra.
      expect(preseTentate).toBeGreaterThanOrEqual(1);
      // ⭐ **E l'esito è `unchanged`, non `stato_cambiato`**: la presa fallisce,
      //    il ciclo RICOMPONE sui valori nuovi e trova `L = 0`, cioè niente da
      //    trasmettere. È il comportamento voluto — non si scrive un bersaglio
      //    calcolato su un `L` che non esiste più.
      expect(esito.reason).toBe('unchanged');
      expect(remoto()).toBe(10);
      // ⭐ Nessun tentativo è rimasto aperto: la presa non è mai riuscita.
      expect((await stato()).pendingKey).toBeNull();
    });

    it('⭐ 4 · il RECUPERO non si ferma sull osservato: la domanda si fa su R fresco', async () => {
      // ⛔ **Il quarto punto della stessa famiglia**, trovato il 10/09/2026 da
      //    una verifica indipendente. `recuperoDaFermare` è chiamato PRIMA di
      //    `componi()` e giudica su `publishable`, che lì è ancora il
      //    Disponibile ASSOLUTO: se l'ultima osservazione coincide con quello,
      //    esce con «unchanged» e il valore composto non viene mai calcolato.
      //
      // ⭐ Lo scenario è quello del proprietario, dal lato del ritentativo:
      //    carico locale +1 e ordine online acquisito −1 lasciano il Disponibile
      //    a 10, `L` vale +1, e il canale porta 9.
      await conBase(10, 1);
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 9);
      await prisma.shopifyInventorySyncState.updateMany({
        where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
        data: {
          mismatchDetected: true,
          // ⚠️ L'ultima OSSERVAZIONE coincide col Disponibile: è la condizione
          //    che fa scattare la scorciatoia sbagliata.
          lastObservedShopifyAvailable: 10,
        },
      });
      expect(await disponibile()).toBe(10);

      const esito = await nuovoEsecutore().ripubblicaDisallineamento(
        IDS.tenantA,
        variantId,
        IDS.locA1,
      );

      // ⭐ T = max(0, 9 + 1) = 10, e R = 9: c'è da trasmettere.
      expect(esito.pushed).toBe(true);
      expect(remoto()).toBe(10);
      expect((await stato()).localPendingDelta).toBe(0);
    });

    it('⛔ 5 · senza base il recupero resta al regime di prima, osservato compreso', async () => {
      // ⚠️ **Il contorno della correzione, e va tenuto fermo**: su una riga
      //    senza base non esiste un valore composto, quindi la scorciatoia
      //    sull'osservato è ancora la domanda giusta — e deve continuare a
      //    fermare il recupero.
      await prisma.shopifyInventorySyncState.create({
        data: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA1,
          lastPushedAvailable: 10,
          mismatchDetected: true,
          lastObservedShopifyAvailable: 10,
        },
      });
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 9);

      const esito = await nuovoEsecutore().ripubblicaDisallineamento(
        IDS.tenantA,
        variantId,
        IDS.locA1,
      );

      expect(esito.pushed).toBe(false);
      expect(esito.reason).toBe('unchanged');
      // ⛔ E il canale non è stato toccato: nessuna inizializzazione nascosta.
      expect(remoto()).toBe(9);
      expect((await stato()).localPendingDelta).toBeNull();
    });
  });

  it('⛔ riga SENZA base: regime di prima, nessuna inizializzazione nascosta', async () => {
    // Nessun contatore: `localPendingDelta` resta NULL.
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        lastPushedAvailable: 10,
      },
    });
    // ⚠️ Il regime di prima confronta con l'ULTIMO CONFERMATO: perche' la
    //    scrittura passi, il canale deve portarlo. E' esattamente il limite che
    //    il valore composto toglie.
    negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

    await prisma.$transaction(async (tx) => {
      await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
    });

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

    expect(esito.pushed).toBe(true);
    // ⛔ Valore ASSOLUTO come prima: si manda `max(0, available)` = 9, non 8.
    //    La base non si inventa: la crea la partenza controllata.
    expect(remoto()).toBe(9);
    const dopo = await stato();
    expect(dopo.lastPushedAvailable).toBe(9);
    expect(dopo.localPendingDelta).toBeNull();
  });

  /**
   * IL CASO CENTRALE ATTRAVERSO I SERVIZI APPLICATIVI.
   *
   * ⛔ **Perché la prova qui sopra non basta.** Quella chiama
   *    `applyInventoryDelta` e `applyCommittedDelta` **a mano**, passando
   *    l'origine come argomento: dimostra che il modello regge, non che chi
   *    vende e chi acquisisce un ordine passino davvero di lì con l'origine
   *    giusta. Se un giorno la Vendita al banco scrivesse la giacenza per
   *    un'altra strada, quella prova resterebbe verde.
   *
   * ⭐ **Qui girano i servizi veri**: `StoreSalesService.createSale` con le sue
   *    dipendenze effettive, `ChannelSyncFacade` col push simulato, e
   *    `OnlineOrderLifecycleService` per l'acquisizione. Nessuna origine
   *    dichiarata dalla prova: la decide il codice.
   */
  describe('sui servizi applicativi reali', () => {
    /**
     * Chi sta al banco: il commesso della fixture, assegnato alla SOLA A1.
     *
     * ⚠️ **Un utente VERO, non un id inventato**: la memoria della modalità
     *    prezzo scrive su `user_document_price_mode_preferences`, che ha una
     *    chiave esterna. Con un id sintetico il servizio assorbe l'errore e
     *    prosegue — la vendita si salva lo stesso, ma la prova esercita un
     *    percorso mutilato senza dirlo.
     */
    const cassiere = () =>
      ({
        id: IDS.utenteA1,
        tenantId: IDS.tenantA,
        displayName: 'Commesso A1',
        role: 'clerk',
        supportSession: false,
        hasAllLocationsAccess: false,
        assignedLocationIds: [IDS.locA1],
        // ⚠️ Il permesso serve DAVVERO: `authorizeStoreDocumentLocations` lo
        //    esige prima di toccare una giacenza, e senza la prova si ferma
        //    con un 403 — cioè sta esercitando l'autorizzazione vera.
        permissions: ['inventory.manage'],
      }) as unknown as UserProfileDto;

    /**
     * La Vendita al banco **vera**, col ponte canali vero.
     *
     * ⚠️ Gli altri tre push del ponte sono doppi inerti: il tenant è Shopify,
     *    quindi non vengono nemmeno interrogati — e se lo fossero, la prova
     *    fallirebbe invece di tacere.
     */
    function venditaAlBanco(ponteDichiarato?: ChannelSyncFacade) {
      const inerte = () => {
        throw new Error('canale non previsto in questa prova');
      };
      const ponte =
        ponteDichiarato ??
        new ChannelSyncFacade(
          prisma as never,
          nuovoEsecutore() as never,
          { enqueuePush: inerte } as never,
          { pushVariantStock: inerte } as never,
          { enqueuePush: inerte } as never,
        );
      return new StoreSalesService(
        prisma as never,
        new DocumentSettingsService(prisma as never),
        ponte,
        new CreationIntentService(prisma as never),
        new DocumentPriceModePreferenceService(prisma as never),
      );
    }

    /**
     * ⚠️ **Il push post-vendita è fire-and-forget**, e non è un dettaglio del
     *    banco di prova: `pushInventoryAsync` lascia andare la promessa perché
     *    la cassa non deve aspettare Shopify. Qui si attende la conseguenza
     *    osservabile, non un tempo fisso.
     */
    async function attendi(condizione: () => boolean | Promise<boolean>) {
      for (let giro = 0; giro < 100; giro += 1) {
        if (await condizione()) {
          return;
        }
        await new Promise((risolvi) => setTimeout(risolvi, 20));
      }
      throw new Error('la conseguenza attesa non è arrivata entro 2 secondi');
    }

    /** L'acquisizione dell'ordine online, dal servizio del ciclo di vita. */
    async function acquisisciOrdineOnline(quantita: number) {
      const ordine = await prisma.salesOrder.create({
        data: {
          tenantId: IDS.tenantA,
          orderNumber: 'SH-COMP-1',
          customerName: 'Cliente online',
          placedAt: new Date(),
          source: SalesOrderSource.shopify_online,
          locationId: IDS.locA1,
        },
      });
      const riga = await prisma.salesOrderLine.create({
        data: {
          orderId: ordine.id,
          lineNumber: 1,
          variantId,
          sku: 'COMP-1',
          title: 'Riga di canale',
          variantLabel: 'Unica',
          quantity: quantita,
          unitPriceMinor: 1000,
          totalMinor: 1000 * quantita,
        },
      });
      const impegni = new StockReservationService(prisma as never);
      const ciclo = new OnlineOrderLifecycleService(
        prisma as never,
        impegni,
        new OnlineSaleFulfillmentService(impegni),
      );
      return ciclo.handle({
        tenantId: IDS.tenantA,
        channel: SalesOrderSource.shopify_online,
        type: OnlineOrderEventType.online_order_created,
        salesOrderId: ordine.id,
        externalOrderId: 'EXT-COMP-1',
        locationId: IDS.locA1,
        lines: [{ salesOrderLineId: riga.id, variantId, sku: 'COMP-1', quantity: quantita }],
      });
    }

    it('⭐ 10 → vendita online → VENDITA AL BANCO vera → invio 8 → ACQUISIZIONE vera', async () => {
      await conBase(10);
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

      // 1 · La vendita online avviene SU SHOPIFY: il canale scende a 9, e da
      //     noi non è ancora arrivato niente.
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 9);
      expect(await disponibile()).toBe(10);

      // 2 · La vendita al banco passa dal servizio applicativo: è lui a
      //     decidere l'origine, e nessuno gliela suggerisce da qui.
      const vendita = await venditaAlBanco().createSale(
        IDS.tenantA,
        {
          creationIntentId: 'intento-composto-000001',
          locationId: IDS.locA1,
          documentDate: '2026-09-10',
          pricesIncludeVat: true,
          lines: [{ variantId, quantity: 1, loadsStock: true, unitPriceMinor: 2049.1803 }],
        } as never,
        cassiere(),
      );
      expect(vendita.id).toBeTruthy();

      expect(await disponibile()).toBe(9);
      // ⭐ L'origine l'ha scritta il percorso vero: locale, perché è una vendita
      //    fatta qui — non un effetto del canale.
      await attendi(async () => (await stato()).localPendingDelta === 0);

      // 3 · Il push post-vendita è partito da sé e ha composto su 9, non su 10.
      expect(remoto()).toBe(8);
      const dopoInvio = await stato();
      expect(dopoInvio.lastPushedAvailable).toBe(8);
      expect(dopoInvio.localPendingDelta).toBe(0);

      // 4 · Ora l'ordine online arriva e viene acquisito dal servizio vero.
      const esito = await acquisisciOrdineOnline(1);
      expect(esito).toBe('applied');
      expect(await disponibile()).toBe(8);

      // ⛔ E NON parte una seconda sottrazione: l'ordine era già sul canale.
      const secondo = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
      expect(secondo.pushed).toBe(false);
      expect(secondo.reason).toBe('unchanged');
      expect(remoto()).toBe(8);
      expect(await disponibile()).toBe(8);
    });

    /**
     * LA RECUPERABILITÀ SENZA UN ALTRO GESTO.
     *
     * ⛔ **Il criterio è che nessuno debba fare niente.** Non un'altra vendita,
     *    non un pulsante, non un secondo `pushLevel` chiamato dalla prova: il
     *    lavoro deve essere ritrovabile da un esecutore **nuovo** partendo solo
     *    da quello che è scritto sulla riga.
     */
    describe('la recuperabilità senza un altro gesto', () => {
      /** Il ponte canali che NON spinge: è il processo che muore prima del push. */
      function ponteMuto() {
        return {
          pushInventoryLevels: async () => {
            /* il processo si è fermato qui: nessuna scrittura verso il canale */
          },
        } as unknown as ChannelSyncFacade;
      }

      it('⭐ 1 · vendita SALVATA e arresto prima del push: la coda la ritrova da sola', async () => {
        // ⛔ **La finestra che restava scoperta.** La variazione locale
        //    incrementa `L` ma non accende nessuno dei marcatori che la coda
        //    guarda: se il processo muore fra il commit della vendita e
        //    l'inizio del push, quel lavoro non è in coda e nessuno lo cerca.
        await conBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

        const vendita = await venditaAlBanco(ponteMuto()).createSale(
          IDS.tenantA,
          {
            creationIntentId: 'intento-arresto-000001',
            locationId: IDS.locA1,
            documentDate: '2026-09-10',
            pricesIncludeVat: true,
            lines: [{ variantId, quantity: 1, loadsStock: true, unitPriceMinor: 2049.1803 }],
          } as never,
          cassiere(),
        );
        expect(vendita.id).toBeTruthy();

        // Il lavoro c'è: la giacenza è scesa e `L` lo registra.
        expect(await disponibile()).toBe(9);
        expect((await stato()).localPendingDelta).toBe(-1);
        // ⭐ E il canale non ha ricevuto niente: il push non è mai partito.
        expect(remoto()).toBe(10);

        // ⛔ Da qui in poi NESSUN gesto: nessuna seconda vendita, nessun push a
        //    mano. Solo la coda, con un esecutore costruito adesso.
        const coda = new ShopifyInventoryRepublishService(
          prisma as never,
          nuovoEsecutore() as never,
        );
        const esito = await coda.retryPending(IDS.tenantA);

        expect(esito.pending).toBeGreaterThanOrEqual(1);
        expect(esito.republished).toBe(1);
        // ⭐ T = max(0, 10 + (−1)) = 9.
        expect(remoto()).toBe(9);
        expect((await stato()).localPendingDelta).toBe(0);
        expect((await stato()).lastPushedAvailable).toBe(9);
      });

      it('⭐ 2 · tentativo persistito e SOLO quello: la coda lo ripete con la STESSA chiave', async () => {
        await conBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);
        await prisma.$transaction(async (tx) => {
          await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -2, 'locale');
        });

        // La scrittura arriva al canale, la risposta si perde.
        negozio.perdiProssimaRisposta('setInventoryQuantities');
        const primo = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
        expect(primo.pushed).toBe(false);

        const aperto = await stato();
        expect(aperto.pendingKey).not.toBeNull();

        // ⛔ **Si spengono gli ALTRI marcatori apposta.** Senza, la riga
        //    starebbe in coda per il lavoro locale e la prova non direbbe
        //    niente sul tentativo aperto: qui si isola quel solo criterio.
        await prisma.shopifyInventorySyncState.updateMany({
          where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
          data: { localPushPending: false, mismatchDetected: false },
        });

        const chiaviPrima = negozio.chiaviViste.length;
        const coda = new ShopifyInventoryRepublishService(
          prisma as never,
          nuovoEsecutore() as never,
        );
        const esito = await coda.retryPending(IDS.tenantA);

        expect(esito.pending).toBeGreaterThanOrEqual(1);
        // ⭐ **La stessa chiave, non una nuova.** Una chiave nuova su un esito
        //    ignoto è il modo di applicare due volte lo stesso effetto.
        expect(negozio.chiaviViste.slice(chiaviPrima)).toEqual([aperto.pendingKey]);

        const dopo = await stato();
        expect(dopo.pendingKey).toBeNull();
        expect(dopo.lastPushedAvailable).toBe(8);
        expect(dopo.localPendingDelta).toBe(0);
        expect(remoto()).toBe(8);
      });

      it('⛔ 3 · tentativo SCADUTO: si conserva e si segnala, non si reinvia alla cieca', async () => {
        await conBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);
        await prisma.$transaction(async (tx) => {
          await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -2, 'locale');
        });

        negozio.perdiProssimaRisposta('setInventoryQuantities');
        await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
        const aperto = await stato();
        expect(aperto.pendingKey).not.toBeNull();

        // ⭐ Il tentativo invecchia oltre la finestra di idempotenza: da lì in
        //    poi il canale non deduplica più, e ripetere potrebbe applicare
        //    l'effetto una seconda volta.
        await prisma.shopifyInventorySyncState.updateMany({
          where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
          data: {
            pendingAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
            localPushPending: false,
            mismatchDetected: false,
          },
        });

        const chiaviPrima = negozio.chiaviViste.length;
        const coda = new ShopifyInventoryRepublishService(
          prisma as never,
          nuovoEsecutore() as never,
        );
        const esito = await coda.retryPending(IDS.tenantA);

        // ⛔ **Questa coppia distingue le due cose che si assomigliano.** Senza,
        //    la prova resterebbe verde anche se la coda non lo avesse MAI
        //    trovato — che è come passava prima della correzione, e non
        //    dimostrava niente sulla prudenza.
        expect(esito.pending).toBeGreaterThanOrEqual(1); // l'ha trovato
        expect(esito.republished).toBe(0); // e non l'ha reinviato

        // ⛔ Nessuna scrittura, e nessuna chiave nuova.
        expect(negozio.chiaviViste.slice(chiaviPrima)).toEqual([]);
        expect(remoto()).toBe(8);
        const dopo = await stato();
        // ⭐ Il tentativo RESTA: riconoscibile, e chiede riconciliazione.
        expect(dopo.pendingKey).toBe(aperto.pendingKey);
        expect(dopo.lastPushedAvailable).toBe(10);
      });

      it('⛔ 4 · un residuo che non si può trasmettere NON blocca le righe dietro', async () => {
        // ⭐ La riga davanti porta un debito che il canale non può
        //    rappresentare: `T` è clampato a zero e non si scarica mai. Deve
        //    restare visibile, ma non deve impedire di raggiungere le altre.
        await conBase(0, -3);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 0);
        await prisma.shopifyInventorySyncState.updateMany({
          where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
          data: { localPushPending: true, createdAt: new Date(Date.now() - 3_600_000) },
        });

        // Una seconda coppia, entrata DOPO, con lavoro trasmissibile.
        const prodotto = await prisma.product.findFirstOrThrow({
          where: { tenantId: IDS.tenantA },
        });
        const seconda = await prisma.productVariant.create({
          data: {
            tenantId: IDS.tenantA,
            productId: prodotto.id,
            sku: 'COMP-2',
            sellingPriceMinor: 100,
            shopifyVariantId: 'gid://shopify/ProductVariant/997041',
            shopifyInventoryItemId: '997051',
          },
        });
        await prisma.inventoryLevel.create({
          data: {
            tenantId: IDS.tenantA,
            variantId: seconda.id,
            locationId: IDS.locA1,
            onHand: 4,
            available: 4,
            committed: 0,
          },
        });
        await prisma.shopifyInventorySyncState.create({
          data: {
            tenantId: IDS.tenantA,
            variantId: seconda.id,
            locationId: IDS.locA1,
            lastPushedAvailable: 5,
            localPendingDelta: -1,
            channelAcquiredDelta: 0,
            localPushPending: true,
          },
        });
        negozio.impostaQuantitaRemota('997051', SEDE_REMOTA, 5);

        const coda = new ShopifyInventoryRepublishService(
          prisma as never,
          nuovoEsecutore() as never,
        );
        const esito = await coda.retryPending(IDS.tenantA);

        // ⭐ La seconda è stata raggiunta e trasmessa nella STESSA passata.
        expect(esito.attempted).toBe(2);
        expect(negozio.quantitaRemota('997051', SEDE_REMOTA)).toBe(4);
        // ⛔ E la prima resta dov'è: debito conservato, canale a zero.
        expect(remoto()).toBe(0);
        const bloccata = await stato();
        expect(bloccata.localPendingDelta).toBe(-3);
      });

      it('⛔ 5 · lavoro ANNULLATO da una compensazione: la riga esce dalla coda', async () => {
        // ⛔ **Il rumore che l'accensione all'origine poteva introdurre.** Ogni
        //    variazione locale accende il marcatore; se lo spegnimento continua
        //    a chiedersi «l'ultimo confermato è uguale al Disponibile?», una
        //    riga con `L` tornato a zero ma con un effetto di canale in mezzo
        //    NON si spegne, e resta in coda per sempre a farsi riesaminare.
        //
        // ⭐ Nel regime composto la domanda giusta è un'altra: **`L` è zero?**
        await conBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 9);

        await prisma.$transaction(async (tx) => {
          // L'ordine online, già applicato dal canale, viene acquisito qui.
          await applyCommittedDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'canale');
          // E due movimenti locali che si annullano fra loro.
          await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
          await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'locale');
        });

        const prima = await stato();
        expect(prima.localPendingDelta).toBe(0);
        expect(await disponibile()).toBe(9);
        // ⚠️ L'ultimo confermato è 10 e il Disponibile è 9: la vecchia domanda
        //    risponde «diversi», e non spegnerebbe.
        expect(prima.lastPushedAvailable).toBe(10);

        const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
        expect(esito.pushed).toBe(false);
        expect(esito.reason).toBe('unchanged');

        // ⭐ E la coda torna vuota: non c'è lavoro, quindi non c'è riga.
        const coda = new ShopifyInventoryRepublishService(
          prisma as never,
          nuovoEsecutore() as never,
        );
        expect((await coda.retryPending(IDS.tenantA)).pending).toBe(0);
      });
    });
  });

  /**
   * IL RINVIO, distinto fra i due regimi — deciso dal proprietario il 10/09/2026.
   *
   * ⭐ **La protezione non si toglie: nel regime composto è già data dalla
   *    forma del valore.** Il rinvio esisteva perché il valore ASSOLUTO,
   *    pubblicato, annullava la sottrazione che Shopify aveva già applicato
   *    per un ordine aperto. `T = max(0, R + L)` parte da `R` — quella
   *    sottrazione la conserva per costruzione — e la scrittura viaggia con
   *    `changeFromQuantity = R`: se il canale si muove nel frattempo, Shopify
   *    rifiuta.
   *
   * ⛔ **La condizione di validità, e va riletta se il modello cambia**:
   *    regge finché `T` parte da `R` letto FRESCO e il confronto remoto
   *    viaggia con `R`. Se il composto cambiasse origine, il rinvio andrebbe
   *    ripristinato anche qui.
   *
   * ⚠️ **Le altre protezioni restano intatte**: pausa, collegamenti esclusi,
   *    confronto remoto, idempotenza, tentativi incerti.
   */
  describe('il rinvio, distinto fra regime vecchio e composto', () => {
    /** Un ordine Shopify APERTO: impegno attivo di canale su questa coppia. */
    async function ordineShopifyAperto(quantita = 3) {
      const ordine = await prisma.salesOrder.create({
        data: {
          tenantId: IDS.tenantA,
          orderNumber: 'SH-APERTO-1',
          customerName: 'Cliente online',
          placedAt: new Date(),
          source: SalesOrderSource.shopify_online,
          locationId: IDS.locA1,
        },
      });
      await prisma.stockReservation.create({
        data: {
          tenantId: IDS.tenantA,
          locationId: IDS.locA1,
          variantId,
          channel: SalesOrderSource.shopify_online,
          salesOrderId: ordine.id,
          sku: 'COMP-1',
          quantity: quantita,
          remainingQuantity: quantita,
        },
      });
    }

    /** La riga in coda per disallineamento, con l'ultima osservazione. */
    async function disallineata(osservato: number) {
      await prisma.shopifyInventorySyncState.updateMany({
        where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
        data: { mismatchDetected: true, lastObservedShopifyAvailable: osservato },
      });
    }

    it('⭐ COMPOSTO: gli ordini aperti NON trattengono la vendita al banco', async () => {
      // ⛔ **E oggi la trattengono per una ragione che peggiora il caso**: il
      //    confronto è fra l'osservato (7) e il Disponibile ASSOLUTO (9), che
      //    è più alto perché i tre ordini aperti non sono ancora acquisiti da
      //    noi. Il rinvio legge «sta alzando» dove in realtà si sta
      //    abbassando: T = 7 − 1 = 6.
      await conBase(10);
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });
      expect(await disponibile()).toBe(9);
      expect((await stato()).localPendingDelta).toBe(-1);

      // Shopify ha già sottratto i tre ordini aperti: porta 7.
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      await disallineata(7);
      await ordineShopifyAperto(3);

      const esito = await nuovoEsecutore().ripubblicaDisallineamento(
        IDS.tenantA,
        variantId,
        IDS.locA1,
      );

      // ⭐ T = max(0, 7 + (−1)) = 6: la vendita al banco arriva al canale, e
      //    la sottrazione dei tre ordini resta dov'era.
      expect(esito.pushed).toBe(true);
      expect(remoto()).toBe(6);
      expect((await stato()).localPendingDelta).toBe(0);
    });

    it('⭐ COMPOSTO: nemmeno un CARICO viene trattenuto, e non annulla gli ordini', async () => {
      // ⚠️ Il caso che il rinvio temeva davvero: si alza la quantità con
      //    ordini aperti. ⭐ Ma si alza PARTENDO da R, quindi i tre ordini
      //    restano sottratti — il carico si aggiunge, non li cancella.
      await conBase(10);
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 2, 'locale');
      });
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      await disallineata(7);
      await ordineShopifyAperto(3);

      const esito = await nuovoEsecutore().ripubblicaDisallineamento(
        IDS.tenantA,
        variantId,
        IDS.locA1,
      );

      expect(esito.pushed).toBe(true);
      // ⭐ 7 + 2 = 9, non 12: il valore assoluto avrebbe rimesso in vendita
      //    anche i tre pezzi già venduti sul canale.
      expect(remoto()).toBe(9);
    });

    it('⛔ VECCHIO REGIME: il rinvio resta, esattamente com era', async () => {
      // ⚠️ **Senza base non esiste un valore composto**: si pubblicherebbe il
      //    Disponibile assoluto, che annullerebbe davvero la sottrazione degli
      //    ordini aperti. Qui la protezione serve, e non si tocca.
      await prisma.shopifyInventorySyncState.create({
        data: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA1,
          lastPushedAvailable: 10,
        },
      });
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });
      // ⭐ La riga resta senza base: `NULL + n` in SQL è `NULL`.
      expect((await stato()).localPendingDelta).toBeNull();

      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      await disallineata(7);
      await ordineShopifyAperto(3);

      const esito = await nuovoEsecutore().ripubblicaDisallineamento(
        IDS.tenantA,
        variantId,
        IDS.locA1,
      );

      expect(esito.pushed).toBe(false);
      expect(esito.reason).toBe('rinvio_attivo');
      // ⛔ E il canale non è stato toccato.
      expect(remoto()).toBe(7);
    });

    it('⭐ l AVVISO «alza» descrive la variazione TENTATA: T contro R', async () => {
      // ⛔ **Oggi l'avviso confronta l'osservato col Disponibile assoluto**,
      //    cioè con un numero che non parte: può avvisare quando in realtà si
      //    abbassa, e tacere quando si alza. Deve descrivere la scrittura
      //    effettiva.
      const avvisi: string[] = [];
      const spia = vi.spyOn(Logger.prototype, 'warn').mockImplementation((messaggio: unknown) => {
        avvisi.push(String(messaggio));
      });

      try {
        await conBase(10);
        await prisma.$transaction(async (tx) => {
          await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 2, 'locale');
        });
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
        await disallineata(7);

        await nuovoEsecutore().ripubblicaDisallineamento(IDS.tenantA, variantId, IDS.locA1);
      } finally {
        spia.mockRestore();
      }

      const alza = avvisi.filter((a) => a.includes('ALZA la quantità'));
      expect(alza).toHaveLength(1);
      // ⭐ I due numeri della SCRITTURA: da 7 (quello che il canale porta) a 9
      //    (quello che parte). ⛔ Non 12, che è il Disponibile locale e non
      //    parte da nessuna parte.
      expect(alza[0]).toContain('da 7');
      expect(alza[0]).toContain('a 9');
      expect(alza[0]).not.toContain('12');
    });

    it('⛔ e TACE quando la variazione tentata ABBASSA', async () => {
      // ⚠️ Il difetto speculare: con l'osservato (7) più basso del Disponibile
      //    assoluto (9) il criterio vecchio avvisa, mentre la scrittura vera
      //    porta il canale da 7 a 6 — cioè abbassa.
      const avvisi: string[] = [];
      const spia = vi.spyOn(Logger.prototype, 'warn').mockImplementation((messaggio: unknown) => {
        avvisi.push(String(messaggio));
      });

      try {
        await conBase(10);
        await prisma.$transaction(async (tx) => {
          await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
        });
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
        await disallineata(7);

        await nuovoEsecutore().ripubblicaDisallineamento(IDS.tenantA, variantId, IDS.locA1);
      } finally {
        spia.mockRestore();
      }

      expect(avvisi.filter((a) => a.includes('ALZA la quantità'))).toEqual([]);
    });
  });

  /**
   * LA PARTENZA CONTROLLATA, e la sequenza completa che ne discende.
   *
   * ```text
   *   1  ALLINEAMENTO INIZIALE   il valore di VestiFlow arriva sul canale
   *   2  BASE STABILITA          la riga entra nel regime nuovo
   *   3  REGIME CONTINUO         gli effetti locali viaggiano, quelli di canale no
   * ```
   *
   * ⛔ **Nessuna inizializzazione nascosta**: prima del passo 1 il push
   *    ordinario non stabilisce niente, e ha una prova sua.
   */
  describe('la partenza controllata', () => {
    /** La riga di stato SENZA base: è lo stato di ogni coppia oggi. */
    async function senzaBase(P: number | null = null) {
      await prisma.shopifyInventorySyncState.create({
        data: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA1,
          lastPushedAvailable: P,
        },
      });
    }

    function allineatore() {
      return new ShopifyInventoryAlignService(prisma as never, nuovoEsecutore() as never);
    }

    /** Quante coppie il blocco ha lasciato non allineate con QUEL motivo. */
    function conMotivo(blocco: BloccoAllineamento, motivo: MotivoNonAllineata): number {
      return blocco.nonAllineate.filter((riga) => riga.motivo === motivo).length;
    }

    /**
     * IL GIRO COMPLETO: incatena i blocchi come fa il pulsante.
     *
     * ⭐ **È la forma in cui il comando si usa davvero**: una pressione, blocchi
     *    automatici, elenco finale. Un blocco solo non è un'operazione.
     *
     * ⚠️ Il tetto sui blocchi non è una protezione del comando: è la rete della
     *    prova, perché un ciclo che non converge non deve girare per sempre.
     */
    async function giroCompleto(
      fabbrica: () => ShopifyInventoryAlignService = allineatore,
      tettoBlocchi = 20,
    ) {
      let prossimo: PosizioneAllineamento | undefined;
      let blocchi = 0;
      let esaminate = 0;
      let allineate = 0;
      let giaAllineate = 0;
      let totale = 0;
      let fine = false;
      const nonAllineate: CoppiaNonAllineata[] = [];
      while (blocchi < tettoBlocchi) {
        const blocco = await fabbrica().allinea(IDS.tenantA, prossimo);
        esaminate += blocco.esaminate;
        allineate += blocco.allineate;
        giaAllineate += blocco.giaAllineate;
        nonAllineate.push(...blocco.nonAllineate);
        totale = blocco.totale;
        blocchi += 1;
        if (blocco.fine) {
          fine = true;
          break;
        }
        prossimo = blocco.prossimo ?? undefined;
      }
      return { totale, esaminate, allineate, giaAllineate, nonAllineate, fine, blocchi };
    }

    /** Crea `quante` coppie collegate su una sede, col canale a `remotoIniziale`. */
    async function coppieInMassa(quante: number, locationId: string, sedeRemota: string) {
      const prodotto = await prisma.product.create({
        data: {
          tenantId: IDS.tenantA,
          name: `Massa ${sedeRemota}`,
          articleCode: `MASSA-${sedeRemota}`,
        },
      });
      for (let i = 0; i < quante; i += 1) {
        const item = `${sedeRemota}${String(i).padStart(4, '0')}`;
        const variante = await prisma.productVariant.create({
          data: {
            tenantId: IDS.tenantA,
            productId: prodotto.id,
            sku: `MASSA-${sedeRemota}-${i}`,
            sellingPriceMinor: 100,
            shopifyVariantId: `gid://shopify/ProductVariant/9${sedeRemota}${i}`,
            shopifyInventoryItemId: item,
          },
        });
        await prisma.inventoryLevel.create({
          data: {
            tenantId: IDS.tenantA,
            variantId: variante.id,
            locationId,
            onHand: 5,
            available: 5,
            committed: 0,
          },
        });
        // Il canale porta un valore DIVERSO: ogni coppia ha da lavorare.
        negozio.impostaQuantitaRemota(item, sedeRemota, 1);
      }
    }

    /**
     * Crea `quante` coppie GIÀ inizializzate, col canale allineato o no.
     *
     * ⭐ **`esaminateDa` rende la rotazione DETERMINISTICA**: senza, tutte
     *    nascono con `last_attempt_at` a `null` e a decidere chi entra nel
     *    tetto è l'ordine degli uuid — cioè il caso. Con un istante base
     *    l'ordine di rotazione è quello degli indici, e si può dire QUALI
     *    coppie il tetto lascia fuori.
     *
     * ⚠️ È anche lo stato reale al SECONDO uso di Allinea: le righe hanno
     *    già un `last_attempt_at`, messo dall'allineamento di prima o dalla
     *    coda del ritentativo.
     */
    async function coppieConBase(
      quante: number,
      locationId: string,
      sedeRemota: string,
      differisconoDaIndice: number,
      esaminateDa?: Date,
    ) {
      const prodotto = await prisma.product.create({
        data: {
          tenantId: IDS.tenantA,
          name: `Base ${sedeRemota}`,
          articleCode: `BASE-${sedeRemota}`,
        },
      });
      for (let i = 0; i < quante; i += 1) {
        const item = `8${sedeRemota}${String(i).padStart(4, '0')}`;
        const variante = await prisma.productVariant.create({
          data: {
            tenantId: IDS.tenantA,
            productId: prodotto.id,
            sku: `BASE-${sedeRemota}-${i}`,
            sellingPriceMinor: 100,
            shopifyVariantId: `gid://shopify/ProductVariant/8${sedeRemota}${i}`,
            shopifyInventoryItemId: item,
          },
        });
        await prisma.inventoryLevel.create({
          data: {
            tenantId: IDS.tenantA,
            variantId: variante.id,
            locationId,
            onHand: 5,
            available: 5,
            committed: 0,
          },
        });
        // ⭐ Tutte con la BASE già stabilita: è l'uso RICORRENTE di Allinea.
        await prisma.shopifyInventorySyncState.create({
          data: {
            tenantId: IDS.tenantA,
            variantId: variante.id,
            locationId,
            lastPushedAvailable: 5,
            localPendingDelta: 0,
            channelAcquiredDelta: 0,
            lastAttemptAt: esaminateDa
              ? new Date(esaminateDa.getTime() + i * 1000)
              : null,
          },
        });
        // Le prime portano già il valore; dall'indice in poi differiscono.
        negozio.impostaQuantitaRemota(item, sedeRemota, i >= differisconoDaIndice ? 1 : 5);
      }
    }

    it('⛔ PRIMA: il push ordinario NON stabilisce la base, e non scrive', async () => {
      // ⛔ **È la guardia contro l'inizializzazione implicita.** Una coppia
      //    senza base non entra nel regime nuovo perché qualcuno ha venduto:
      //    ci entra quando una persona preme Allinea.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });

      const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

      expect(esito.pushed).toBe(false);
      expect(esito.reason).toBe('base_assente');
      expect(remoto()).toBe(7);
      const dopo = await stato();
      expect(dopo.localPendingDelta).toBeNull();
      expect(dopo.lastPushedAvailable).toBeNull();
    });

    it('⛔ riga con ULTIMO CONFERMATO ma senza base: il push scrive e NON inizializza', async () => {
      // ⛔ **È il caso reale di oggi, e la prova che mancava.** Una riga che ha
      //    già pubblicato nel regime vecchio ha `P` valorizzato e `L` NULL:
      //    il push ordinario NON si ferma su `base_assente`, arriva alla
      //    scrittura, e alla conferma potrebbe far nascere la base senza che
      //    nessuno l'abbia chiesta.
      //
      // ⭐ A impedirlo è `scarichiInvioOrdinario`, che su una riga senza base
      //    non fotografa niente: senza fotografia la conferma usa la formula
      //    vecchia, e `NULL − n` resta `NULL`.
      await senzaBase(10);
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });

      const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

      // ⭐ La scrittura AVVIENE: il regime vecchio funziona come sempre.
      expect(esito.pushed).toBe(true);
      expect(remoto()).toBe(9);
      const dopo = await stato();
      expect(dopo.lastPushedAvailable).toBe(9);
      // ⛔ **Ma la base NON nasce.** Nessuna inizializzazione al primo invio
      //    ordinario: quella riga entra nel regime nuovo solo con Allinea.
      expect(dopo.localPendingDelta).toBeNull();
      expect(dopo.channelAcquiredDelta).toBeNull();
    });

    it('⭐ CIÒ CHE RESTA si conta per COPPIA: una sede allineata non copre l altra', async () => {
      // ⛔ **Il conteggio deve legare variante E sede.** Con il solo filtro
      //    sulla variante, un magazzino allineato farebbe risultare a posto
      //    anche gli altri, e il comando direbbe «finito» con metà lavoro da
      //    fare.
      await senzaBase();
      // Sede 1: il canale differisce → verrà allineata, e la base nasce.
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);

      const SEDE_REMOTA_2 = '77002';
      await prisma.location.update({
        where: { id: IDS.locA2 },
        data: { shopifyLocationId: SEDE_REMOTA_2 },
      });
      await prisma.inventoryLevel.create({
        data: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA2,
          onHand: 4,
          available: 4,
          committed: 0,
        },
      });
      // ⭐ Sede 2: il canale NON risponde per quella sede — la coppia esce
      //    esclusa e resta senza base. È quella che deve restare contata.
      //
      // ⚠️ Non basta più «il canale porta già il valore»: da quando la
      //    partenza stabilisce la base anche senza scrivere, quella coppia
      //    sarebbe a posto e il conteggio non discriminerebbe più niente.

      const esito = await allineatore().allinea(IDS.tenantA);

      expect(esito.totale).toBe(2);
      expect(esito.allineate).toBe(1);
      // ⛔ L'altra sede resta NON allineata, e l'elenco dice quale e perché.
      expect(esito.nonAllineate).toHaveLength(1);
      expect(esito.nonAllineate[0]?.locationId).toBe(IDS.locA2);
      expect(esito.nonAllineate[0]?.motivo).toBe('livello_non_disponibile');

      const conBase = await prisma.shopifyInventorySyncState.count({
        where: { tenantId: IDS.tenantA, variantId, localPendingDelta: { not: null } },
      });
      expect(conBase).toBe(1);
    });

    it('⭐ LA SEQUENZA COMPLETA: allineamento → base → regime continuo', async () => {
      // ── 1 · la situazione di partenza ────────────────────────────────
      //    VestiFlow 10, Shopify 7 (storia sconosciuta: rettifiche a mano,
      //    ordini vecchi, quello che sia). Nessuna base.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      expect(await disponibile()).toBe(10);

      // ── 2 · ALLINEAMENTO INIZIALE ────────────────────────────────────
      const esito = await allineatore().allinea(IDS.tenantA);

      expect(esito.allineate).toBe(1);
      expect(esito.nonAllineate).toEqual([]);
      // ⭐ Il canale porta ora il valore di VestiFlow. Mai il contrario: il
      //    Disponibile locale non si è mosso di un pezzo.
      expect(remoto()).toBe(10);
      expect(await disponibile()).toBe(10);

      // ── 3 · LA BASE È STABILITA ──────────────────────────────────────
      const dopoAllineamento = await stato();
      expect(dopoAllineamento.lastPushedAvailable).toBe(10);
      expect(dopoAllineamento.localPendingDelta).toBe(0);
      expect(dopoAllineamento.channelAcquiredDelta).toBe(0);
      expect(dopoAllineamento.pendingKey).toBeNull();
      // ⭐ E il controllo si è concluso: nessuna coppia non allineata.
      expect(esito.nonAllineate).toEqual([]);
      expect(esito.fine).toBe(true);

      // ── 4 · REGIME CONTINUO · vendita al banco → si manda il meno ─────
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
      });
      const vendita = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
      expect(vendita.pushed).toBe(true);
      expect(remoto()).toBe(9);
      expect((await stato()).localPendingDelta).toBe(0);

      // ── 5 · REGIME CONTINUO · carico → si manda il più ────────────────
      await prisma.$transaction(async (tx) => {
        await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 3, 'locale');
      });
      const carico = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
      expect(carico.pushed).toBe(true);
      expect(remoto()).toBe(12);

      // ── 6 · REGIME CONTINUO · ordine da Shopify → NON si rimanda ──────
      //    Shopify lo applica da sé, noi lo acquisiamo: il canale non deve
      //    ricevere una seconda sottrazione.
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 11);
      await prisma.$transaction(async (tx) => {
        await applyCommittedDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'canale');
      });
      const acquisizione = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
      expect(acquisizione.pushed).toBe(false);
      expect(acquisizione.reason).toBe('unchanged');
      expect(remoto()).toBe(11);
      expect(await disponibile()).toBe(11);
    });

    it('⭐ il DISPONIBILE NEGATIVO parte da zero e conserva il debito', async () => {
      // ⚠️ Quantità inviate e stati locali sono due cose diverse: l'API
      //    rifiuta le negative, quindi si pubblica 0 — e il debito resta
      //    scritto in `L`, invece di sparire.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 5);
      await prisma.inventoryLevel.updateMany({
        where: { tenantId: IDS.tenantA, variantId, locationId: IDS.locA1 },
        data: { onHand: -2, available: -2 },
      });

      const esito = await allineatore().allinea(IDS.tenantA);

      expect(esito.allineate).toBe(1);
      expect(remoto()).toBe(0);
      const dopo = await stato();
      expect(dopo.lastPushedAvailable).toBe(0);
      // ⭐ `A_w − T = −2 − 0 = −2`: il debito che il canale non può
      //    rappresentare resta qui, e non viene dimenticato.
      expect(dopo.localPendingDelta).toBe(-2);
    });

    it('⭐ una coppia GIÀ allineata non riscrive e non consuma quota', async () => {
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);
      negozio.azzeraChiamate();

      const esito = await allineatore().allinea(IDS.tenantA);

      // ⛔ Il canale porta già 10: «si aggiorna solo ciò che differisce».
      expect(esito.allineate).toBe(0);
      expect(esito.giaAllineate).toBe(1);
      expect(negozio.quantitaMandate).toEqual([]);
      // ⭐ **E la base VIENE stabilita lo stesso.** Qui la prova asseriva il
      //    contrario — «non abbiamo scritto, quindi non sappiamo di aver
      //    messo noi quel valore» — e quel ragionamento lasciava fuori dal
      //    regime nuovo il caso più comune dopo un import iniziale, per
      //    sempre. Per fissare la base serve sapere quanto vale il canale,
      //    e lo abbiamo LETTO.
      expect((await stato()).localPendingDelta).toBe(0);
      expect((await stato()).lastPushedAvailable).toBe(10);
      expect(esito.nonAllineate).toEqual([]);
    });

    it('⭐ RIPRENDERE non duplica: la seconda passata non riscrive', async () => {
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);

      const primo = await allineatore().allinea(IDS.tenantA);
      expect(primo.allineate).toBe(1);
      expect(remoto()).toBe(10);

      // ⚠️ `azzeraChiamate` non tocca le quantità mandate: si conta il
      //    prima e il dopo, che è anche la domanda giusta — «ha scritto di
      //    nuovo?», non «ha mai scritto?».
      const scrittureDopoIlPrimo = negozio.quantitaMandate.length;
      const secondo = await allineatore().allinea(IDS.tenantA);

      // ⭐ La coppia è già a posto: nessuna scrittura, nessun effetto doppio.
      expect(secondo.allineate).toBe(0);
      expect(secondo.giaAllineate).toBe(1);
      expect(negozio.quantitaMandate).toHaveLength(scrittureDopoIlPrimo);
      expect(remoto()).toBe(10);
      expect((await stato()).localPendingDelta).toBe(0);
    });

    it('⛔ un articolo con la sincronizzazione SPENTA è fuori dal perimetro', async () => {
      // ⚠️ **Il perimetro è «articoli e varianti abilitati alla
      //    sincronizzazione»**: un articolo spento non è né allineato né
      //    escluso — per questo comando non esiste, e il denominatore lo dice.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      const prodotto = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { productId: true },
      });
      await prisma.product.update({
        where: { id: prodotto.productId },
        data: { shopifySyncEnabled: false },
      });

      const esito = await allineatore().allinea(IDS.tenantA);

      expect(esito.totale).toBe(0);
      expect(esito.allineate).toBe(0);
      expect(remoto()).toBe(7);
    });

    it('⛔ SCOPE di scrittura assente: tutte ESCLUSE, nessuna scrittura', async () => {
      // ⭐ **«Non eseguibile in sicurezza» è un esito a sé** (§31.12), diverso
      //    da «tentato e non riuscito»: qui il canale non viene nemmeno
      //    interrogato, perché il permesso di scrivere l'inventario non c'è.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      await prisma.shopifyConnection.updateMany({
        where: { tenantId: IDS.tenantA },
        data: { scopes: ['read_products', 'write_products'] },
      });

      const esito = await allineatore().allinea(IDS.tenantA);

      expect({ totale: esito.totale, allineate: esito.allineate }).toEqual({
        totale: 1,
        allineate: 0,
      });
      expect(remoto()).toBe(7);
      expect(conMotivo(esito, 'permesso_mancante')).toBe(1);
    });

    it('⛔ una coppia che il canale non riconosce è FALLITA, non allineata', async () => {
      // ⚠️ **Fallita, non esclusa, e la differenza è onesta**: da qui non si
      //    distingue un articolo sparito su Shopify da un guasto della
      //    chiamata. Chi legge l'esito deve riprovare o andare a vedere —
      //    non gli si dice «non era eseguibile», che suonerebbe come una
      //    decisione presa con cognizione.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
      await prisma.productVariant.update({
        where: { id: variantId },
        data: {
          shopifyInventoryItemId: null,
          // ⭐ Un identificativo che il negozio simulato non conosce: la
          //    risoluzione fallisce e la coppia esce come non collegata.
          shopifyVariantId: 'gid://shopify/ProductVariant/999999',
        },
      });

      const esito = await allineatore().allinea(IDS.tenantA);

      expect({
        totale: esito.totale,
        allineate: esito.allineate,
        giaAllineate: esito.giaAllineate,
      }).toEqual({ totale: 1, allineate: 0, giaAllineate: 0 });
      expect(remoto()).toBe(7);
      // ⛔ E resta nell'elenco: non è stata dichiarata a posto.
      expect(esito.nonAllineate).toHaveLength(1);
      // ⭐ **Errore di LETTURA**: la risoluzione è fallita prima di prenotare
      //    qualunque scrittura, quindi non c'è niente di incerto da riconciliare.
      expect(esito.nonAllineate[0]?.motivo).toBe('errore_di_lettura');
    });

    it('⛔ il canale che si muove fra lettura e scrittura FERMA l allineamento', async () => {
      // ⭐ **Il confronto vale anche per l'allineamento iniziale**: se Shopify
      //    cambia quantità fra la lettura e la scrittura, la scrittura viene
      //    rifiutata invece di sovrascrivere alla cieca.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);

      const graphql = negozio.graphql();
      const letturaVera = graphql.getRemoteLevelAtLocation;
      graphql.getRemoteLevelAtLocation = (async (...args: unknown[]) => {
        const esito = await letturaVera(...(args as Parameters<typeof letturaVera>));
        // Subito dopo la lettura, il canale si muove.
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);
        return esito;
      }) as typeof letturaVera;

      const esito = await new ShopifyInventoryAlignService(
        prisma as never,
        nuovoEsecutore(graphql) as never,
      ).allinea(IDS.tenantA);

      expect(esito.allineate).toBe(0);
      expect(conMotivo(esito, 'divergenza_accertata')).toBe(1);
      // ⛔ Il canale è rimasto dove si era mosso: nessuna sovrascrittura.
      expect(remoto()).toBe(4);
      const dopoIlFallimento = await stato();
      // ⭐ **Il rifiuto ANNULLA l'inizializzazione.** I contatori nascono alla
      //    presa perché i movimenti della finestra non svaniscano su un NULL;
      //    se il canale rifiuta e nessun movimento è arrivato, la riga torna
      //    fuori dal regime nuovo — altrimenti risulterebbe inizializzata
      //    benché l'allineamento non sia riuscito.
      //
      // ⚠️ Se un movimento FOSSE arrivato, i contatori resterebbero: quel
      //    lavoro esiste. Ha una prova sua (`2-bis`).
      expect(dopoIlFallimento.localPendingDelta).toBeNull();
      expect(dopoIlFallimento.lastPushedAvailable).toBeNull();
      // ⛔ E la coppia resta nell'elenco delle non allineate.
      expect(esito.nonAllineate).toHaveLength(1);
    });

    it('⭐ per SEDE: due magazzini, esiti distinti, una chiamata sola', async () => {
      // ⚠️ L'operatore non deve lanciare un comando per magazzino.
      await senzaBase();
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);

      const SEDE_REMOTA_2 = '77002';
      await prisma.location.update({
        where: { id: IDS.locA2 },
        data: { shopifyLocationId: SEDE_REMOTA_2 },
      });
      await prisma.inventoryLevel.create({
        data: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA2,
          onHand: 4,
          available: 4,
          committed: 0,
        },
      });
      negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA_2, 1);

      const esito = await allineatore().allinea(IDS.tenantA);

      expect(esito.allineate).toBe(2);
      expect(esito.esaminate).toBe(2);
      expect(remoto()).toBe(10);
      expect(negozio.quantitaRemota(inventoryItemId, SEDE_REMOTA_2)).toBe(4);
      // ⭐ **Una chiamata sola ha raggiunto due magazzini.**
      //
      // ⚠️ Il riepilogo per sede non c'è più, e non è una perdita: la sede
      //    sta su OGNI riga dell'elenco delle non allineate, che è dove
      //    serviva distinguerle. Qui non ce ne sono.
      expect(esito.nonAllineate).toEqual([]);
      expect(esito.fine).toBe(true);
    });

    /**
     * I CINQUE RILIEVI del proprietario sulla partenza controllata, 10/09/2026.
     *
     * ⛔ Tutti trovati LEGGENDO, e tutti riprodotti prima di essere corretti.
     */
    describe('i cinque rilievi sulla partenza', () => {
      function allineatore2(graphql: unknown = negozio.graphql()) {
        return new ShopifyInventoryAlignService(prisma as never, nuovoEsecutore(graphql) as never);
      }

      it('⛔ 1a · le GIÀ allineate non devono consumare il tetto delle scritture', async () => {
        // ⛔ **L'uso ricorrente di Allinea**: tutte le coppie hanno la base, e
        //    solo alcune differiscono dal canale. Con un tetto solo — quello
        //    che conta le coppie esaminate — le cinquanta già a posto lo
        //    riempivano e le dieci da correggere non venivano raggiunte.
        //
        // ⭐ Il tetto che protegge la quota è quello delle SCRITTURE: una
        //    coppia già allineata costa una lettura, non una scrittura.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
        await coppieConBase(60, IDS.locA1, SEDE_REMOTA, 50);

        const esito = await allineatore2().allinea(IDS.tenantA);

        expect(esito.giaAllineate).toBe(50);
        // ⭐ Le dieci che differiscono sono state raggiunte nello STESSO blocco.
        expect(esito.allineate).toBe(10);
        expect(esito.nonAllineate).toEqual([]);
      });

      it('⭐ 1b · oltre il primo blocco, il giro raggiunge comunque tutti', async () => {
        // ⛔ **Qui l'ordinamento decideva tutto**: con un catalogo più grande del
        //    blocco, chi finiva oltre il duecentesimo posto poteva non essere
        //    raggiunto mai, e la prova dipendeva da quale ordine capitava.
        //
        // ⭐ **Adesso non decide più niente**: una pressione attraversa il
        //    perimetro INTERO a blocchi, quindi l'ordine è indifferente e la
        //    copertura è per costruzione.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
        // 205 con base e già a posto, più 5 senza base da inizializzare.
        await coppieConBase(205, IDS.locA1, SEDE_REMOTA, 999);
        await coppieInMassa(5, IDS.locA1, SEDE_REMOTA);

        const giro = await giroCompleto(allineatore2);

        // ⭐ Tutte e cinque, e in più di un blocco: il giro non si ferma.
        expect(giro.allineate).toBe(5);
        expect(giro.giaAllineate).toBe(205);
        expect(giro.blocchi).toBeGreaterThan(1);
        expect(giro.fine).toBe(true);
        expect(giro.nonAllineate).toEqual([]);
      });

      it('⛔ 1 · 120 coppie su due sedi: piu passate le raggiungono TUTTE', async () => {
        // ⛔ **Il difetto**: ogni passata seleziona le stesse prime 50, nello
        //    stesso ordine, e anche le gia' allineate consumano il tetto.
        //    Ripremere non arriva mai alla cinquantunesima.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        const SEDE_REMOTA_2 = '77002';
        await prisma.location.update({
          where: { id: IDS.locA2 },
          data: { shopifyLocationId: SEDE_REMOTA_2 },
        });
        await coppieInMassa(70, IDS.locA1, SEDE_REMOTA);
        await coppieInMassa(50, IDS.locA2, SEDE_REMOTA_2);

        const giro = await giroCompleto(allineatore2);

        // ⭐ Tutte e 120, in piu' blocchi: il tetto delle scritture c'e', e il
        //    giro lo attraversa da solo — senza chiedere un altro clic.
        expect(giro.allineate).toBe(120);
        expect(giro.blocchi).toBeGreaterThan(1);
        expect(giro.fine).toBe(true);
        const senzaBase = await prisma.shopifyInventorySyncState.count({
          where: { tenantId: IDS.tenantA, localPendingDelta: null },
        });
        expect(senzaBase).toBe(0);
      });

      it('⛔ 2 · quantita GIA UGUALI: la partenza deve comunque stabilire la base', async () => {
        // ⛔ **Il caso normalissimo dopo un import iniziale**: VestiFlow 10,
        //    Shopify 10. Non c'e' niente da scrivere — giusto — ma la coppia
        //    deve entrare nella sincronizzazione continua lo stesso, senza
        //    costringere nessuno a cambiare una quantita' per finta.
        await senzaBase();
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);
        const scrittePrima = negozio.quantitaMandate.length;

        const esito = await allineatore2().allinea(IDS.tenantA);

        // ⭐ Nessuna scrittura sul canale: si aggiorna solo cio' che differisce.
        expect(negozio.quantitaMandate).toHaveLength(scrittePrima);
        expect(remoto()).toBe(10);
        // ⭐ Ma la BASE c'e', e la coppia non resta indietro.
        const dopo = await stato();
        expect(dopo.lastPushedAvailable).toBe(10);
        expect(dopo.localPendingDelta).toBe(0);
        expect(dopo.channelAcquiredDelta).toBe(0);
        expect(esito.nonAllineate).toEqual([]);

        // ⭐ E da qui il regime continuo funziona: una vendita viaggia.
        await prisma.$transaction(async (tx) => {
          await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
        });
        const vendita = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
        expect(vendita.pushed).toBe(true);
        expect(remoto()).toBe(9);
      });

      it('⛔ 3 · vendita DURANTE la prima scrittura: il meno non si perde', async () => {
        // ⛔ **Il rilievo piu' grave.** Alla prima inizializzazione i contatori
        //    sono NULL, quindi `increment` non accumula: una vendita entrata
        //    nella finestra sparisce dalla contabilita' degli invii, e Shopify
        //    resta a 10 mentre VestiFlow e' a 9 senza un −1 da recuperare.
        await senzaBase();
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);

        const graphql = negozio.graphql();
        const scritturaVera = graphql.setInventoryQuantities;
        graphql.setInventoryQuantities = vi.fn(async (...args: unknown[]) => {
          // La vendita entra mentre la scrittura e' in volo.
          await prisma.$transaction(async (tx) => {
            await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
          });
          return scritturaVera(...(args as Parameters<typeof scritturaVera>));
        }) as typeof scritturaVera;

        const esito = await allineatore2(graphql).allinea(IDS.tenantA);

        expect(esito.allineate).toBe(1);
        expect(remoto()).toBe(10);
        expect(await disponibile()).toBe(9);
        const dopo = await stato();
        expect(dopo.lastPushedAvailable).toBe(10);
        // ⭐ **Il −1 e' CONSERVATO**: la vendita e' entrata dopo la fotografia e
        //    non e' stata trasmessa, quindi resta da trasmettere.
        expect(dopo.localPendingDelta).toBe(-1);

        // ⭐ E il giro dopo arriva al canale.
        const dopoVendita = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);
        expect(dopoVendita.pushed).toBe(true);
        expect(remoto()).toBe(9);
      });

      it('⛔ 4 · presa fallita: il giro dopo ricalcola con ALLINEA, non con l ordinario', async () => {
        // ⛔ **Il difetto**: nel ciclo di presa si richiama sempre il calcolo
        //    della sincronizzazione ordinaria, che su una riga senza base non
        //    compone nulla — e con l'ultimo confermato assente esce
        //    `base_assente`, invece di riallineare come richiesto.
        await senzaBase();
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);

        // Fra la lettura coerente e la presa, il Disponibile si muove: la presa
        // fallisce e il ciclo deve RICOMPORRE col calcolo di Allinea.
        let interposto = false;
        const prismaSpia = new Proxy(prisma, {
          get(target, prop, receiver) {
            if (prop === '$queryRaw') {
              const originale = Reflect.get(target, prop, receiver) as (
                ...a: unknown[]
              ) => Promise<unknown>;
              return async (...args: unknown[]) => {
                const esito = await originale.apply(target, args);
                if (!interposto) {
                  interposto = true;
                  await prisma.$transaction(async (tx) => {
                    await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, 2, 'locale');
                  });
                }
                return esito;
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });

        const push = new ShopifyInventoryPushService(
          prismaSpia as never,
          negozio.oauth() as never,
          negozio.admin() as never,
          negozio.graphql() as never,
          { touchSync: vi.fn() } as never,
          new ShopifyInventoryReconciliationService(prisma as never),
          storico,
          registro,
        );
        const esito = await push.riallineaCoppia(IDS.tenantA, variantId, IDS.locA1);

        expect(interposto).toBe(true);
        // ⭐ Ricomposto con Allinea sui valori NUOVI: 10 + 2 = 12.
        expect(esito.pushed).toBe(true);
        expect(remoto()).toBe(12);
        expect((await stato()).lastPushedAvailable).toBe(12);
        expect((await stato()).localPendingDelta).toBe(0);
      });

      it('⛔ 5 · una coppia GIA inizializzata che fallisce resta nel lavoro residuo', async () => {
        // ⛔ **Il difetto**: «restano» conta solo le coppie senza base, quindi
        //    una gia' inizializzata che fallisce dava `fallite: 1, restano: 0`
        //    — cioe' «non c'e' piu' niente da fare» mentre c'e'.
        await conBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);
        negozio.guastaProssima('setInventoryQuantities');

        const esito = await allineatore2().allinea(IDS.tenantA);

        expect(esito.allineate).toBe(0);
        // ⭐ L'elenco include cio' che e' fallito, col motivo giusto: una
        //    scrittura era stata PRENOTATA, quindi il suo esito e' incerto —
        //    non e' un errore di lettura, e non si riprova di iniziativa.
        expect(esito.nonAllineate).toHaveLength(1);
        expect(esito.nonAllineate[0]?.motivo).toBe('scrittura_esito_incerto');
      });
    });

    /**
     * I QUATTRO CASI rimasti scoperti dopo la prima tornata di correzioni.
     * Trovati dal proprietario leggendo il codice, 10/09/2026.
     */
    describe('i quattro casi scoperti', () => {
      function allineatore3(graphql: unknown = negozio.graphql()) {
        return new ShopifyInventoryAlignService(prisma as never, nuovoEsecutore(graphql) as never);
      }

      it('⛔ 1 · la rotazione deve valere anche FRA le sedi', async () => {
        // ⛔ **Il difetto**: il ciclo parte sempre dalla prima sede in ordine di
        //    nome. Con 205 coppie là, ogni passata riempie il tetto di
        //    scansione e si interrompe — e la seconda sede non viene raggiunta
        //    mai. La prova sulle 210 coppie usava una sede sola, quindi non lo
        //    vedeva.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });

        const SEDE_REMOTA_2 = '77002';
        await prisma.location.update({
          where: { id: IDS.locA2 },
          data: { shopifyLocationId: SEDE_REMOTA_2 },
        });
        // Sede A1 (prima in ordine di nome): 205 coppie già a posto.
        await coppieConBase(205, IDS.locA1, SEDE_REMOTA, 999);
        // Sede A2: 5 coppie che hanno bisogno di essere corrette.
        await coppieConBase(5, IDS.locA2, SEDE_REMOTA_2, 0);

        const giro = await giroCompleto(allineatore3);

        // ⭐ Le cinque della SECONDA sede vengono raggiunte: il giro attraversa
        //    il perimetro INTERO, quindi l'ordine fra le sedi non decide piu' chi
        //    viene servito e chi no.
        expect(giro.allineate).toBe(5);
        expect(giro.giaAllineate).toBe(205);
        expect(giro.fine).toBe(true);
        expect(negozio.quantitaRemota('8770020000', SEDE_REMOTA_2)).toBe(5);
      });

      it('⛔ 2 · primo Allinea RIFIUTATO su riga preesistente: non entra nel regime', async () => {
        // ⛔ **Il caso che «resta senza ultimo confermato» non copre.** Una riga
        //    che ha già pubblicato nel regime vecchio ha `P` valorizzato e `L`
        //    NULL. La presa mette `L` a zero; se Shopify rifiuta, il vecchio `P`
        //    resta — e il codice vede una coppia inizializzata benché
        //    l'allineamento non sia riuscito.
        //
        // ⛔ **E la conseguenza è peggiore dell'inizializzazione**: con `L = 0` e
        //    il disallineamento acceso, il RECUPERO non corregge più niente,
        //    mentre con `L` NULL avrebbe ripubblicato il valore assoluto.
        await senzaBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);

        // ⭐ **Il canale RIFIUTA**: si muove fra la lettura e la scrittura, e il
        //    confronto lo respinge. È il rifiuto che CHIUDE il tentativo — il
        //    caso del rilievo.
        const graphql = negozio.graphql();
        const letturaVera = graphql.getRemoteLevelAtLocation;
        graphql.getRemoteLevelAtLocation = (async (...args: unknown[]) => {
          const letto = await letturaVera(...(args as Parameters<typeof letturaVera>));
          negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 2);
          return letto;
        }) as typeof letturaVera;

        const esito = await allineatore3(graphql).allinea(IDS.tenantA);

        expect(conMotivo(esito, 'divergenza_accertata')).toBe(1);
        const dopo = await stato();
        // ⭐ **La riga NON è entrata nel regime nuovo**: l'allineamento non è
        //    riuscito, e l'ultimo confermato di prima è ancora quello.
        expect(dopo.localPendingDelta).toBeNull();
        expect(dopo.channelAcquiredDelta).toBeNull();
        expect(dopo.lastPushedAvailable).toBe(10);
        // ⛔ E resta nell'elenco delle non allineate.
        expect(esito.nonAllineate).toHaveLength(1);
      });

      it('⭐ 2-ter · con un tentativo ancora APERTO i contatori restano', async () => {
        // ⚠️ **Il contorno dell'altra correzione, e va tenuto distinto.** Se la
        //    chiamata solleva, non sappiamo se la scrittura sia arrivata: il
        //    tentativo resta aperto e verrà ripreso. Lì i contatori NON si
        //    annullano — se l'effetto è andato, i movimenti successivi devono
        //    accumulare, e la riga è legittimamente «in corso».
        await senzaBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);
        negozio.guastaProssima('setInventoryQuantities');

        await allineatore3().allinea(IDS.tenantA);

        const dopo = await stato();
        expect(dopo.pendingKey).not.toBeNull();
        expect(dopo.localPendingDelta).toBe(0);
      });

      it('⭐ 2-bis · ma i MOVIMENTI arrivati durante il tentativo si conservano', async () => {
        // ⚠️ **Il contorno che rende la correzione non banale**: annullare
        //    l'inizializzazione non deve buttare via una vendita entrata nella
        //    finestra. Se `L` non è più zero, quel lavoro esiste e va tenuto.
        await senzaBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);

        // ⭐ **Il canale RIFIUTA — chiudendo il tentativo — DOPO che il
        //    movimento è arrivato.** È la combinazione che conta: se
        //    l'annullamento non guardasse i valori, quella vendita sparirebbe
        //    insieme all'inizializzazione.
        const graphql = negozio.graphql();
        const letturaVera = graphql.getRemoteLevelAtLocation;
        const scritturaVera = graphql.setInventoryQuantities;
        let mossoIlCanale = false;
        let movimentoFatto = false;
        graphql.getRemoteLevelAtLocation = (async (...args: unknown[]) => {
          const letto = await letturaVera(...(args as Parameters<typeof letturaVera>));
          if (!mossoIlCanale) {
            mossoIlCanale = true;
            // Il canale si muove: il confronto rifiuterà, e il tentativo si
            // chiuderà — è la condizione in cui l'annullamento entra in gioco.
            negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 2);
          }
          return letto;
        }) as typeof letturaVera;
        graphql.setInventoryQuantities = vi.fn(async (...args: unknown[]) => {
          if (!movimentoFatto) {
            movimentoFatto = true;
            // ⭐ **DOPO la presa**: qui i contatori esistono già, quindi il
            //    movimento accumula invece di svanire su un NULL.
            await prisma.$transaction(async (tx) => {
              await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
            });
          }
          return scritturaVera(...(args as Parameters<typeof scritturaVera>));
        }) as typeof scritturaVera;

        await allineatore3(graphql).allinea(IDS.tenantA);

        const dopo = await stato();
        expect(await disponibile()).toBe(9);
        // ⭐ **La vendita si conserva**, anche se il tentativo è stato chiuso
        //    senza conferma: quel lavoro esiste e va trasmesso.
        expect(dopo.localPendingDelta).toBe(-1);
        // ⛔ **E la riga NON ha una base valida**: l'allineamento non è
        //    riuscito, quindi il vecchio confermato — che è del regime
        //    precedente — non certifica niente qui. Prosegue in `D`.
        expect(dopo.lastPushedAvailable).toBeNull();
      });

      it('⛔ 4-ter · «pronta» ha UN criterio solo: niente doppie nel residuo', async () => {
        // ⛔ **Il caso in cui i due criteri divergevano.** Dopo un primo rifiuto
        //    con un movimento in mezzo, la coppia ha `L` valorizzato e `P`
        //    ancora NULL. Con «pronta = ha L» risultava pronta nella selezione
        //    e non pronta nel conteggio: al secondo rifiuto veniva contata due
        //    volte, e il residuo diceva 2 dove il lavoro è 1.
        await senzaBase();
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);

        // Primo giro: rifiuto con un movimento nella finestra → L = −1, P NULL.
        const graphql = negozio.graphql();
        const letturaVera = graphql.getRemoteLevelAtLocation;
        const scritturaVera = graphql.setInventoryQuantities;
        let mossoIlCanale = false;
        let movimentoFatto = false;
        graphql.getRemoteLevelAtLocation = (async (...args: unknown[]) => {
          const letto = await letturaVera(...(args as Parameters<typeof letturaVera>));
          if (!mossoIlCanale) {
            mossoIlCanale = true;
            // Il canale si muove: il confronto rifiuterà, e il tentativo si
            // chiuderà — è la condizione in cui l'annullamento entra in gioco.
            negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 2);
          }
          return letto;
        }) as typeof letturaVera;
        graphql.setInventoryQuantities = vi.fn(async (...args: unknown[]) => {
          if (!movimentoFatto) {
            movimentoFatto = true;
            // ⭐ **DOPO la presa**: qui i contatori esistono già, quindi il
            //    movimento accumula invece di svanire su un NULL.
            await prisma.$transaction(async (tx) => {
              await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
            });
          }
          return scritturaVera(...(args as Parameters<typeof scritturaVera>));
        }) as typeof scritturaVera;

        await allineatore3(graphql).allinea(IDS.tenantA);
        const dopoPrimo = await stato();
        expect(dopoPrimo.localPendingDelta).toBe(-1);
        expect(dopoPrimo.lastPushedAvailable).toBeNull();

        // Secondo giro: fallisce di nuovo. La coppia è UNA, e il residuo è 1.
        negozio.guastaProssima('setInventoryQuantities');
        const secondo = await allineatore3().allinea(IDS.tenantA);

        // ⛔ Non 2: la stessa coppia non si conta due volte, ed e' esaminata
        //    una volta sola nel giro.
        expect(secondo.nonAllineate).toHaveLength(1);
        expect(secondo.nonAllineate[0]?.motivo).toBe('scrittura_esito_incerto');
      });

      it('⛔ 3 · «non serve scrivere» non deve SOPRAVVIVERE al ricalcolo', async () => {
        // ⛔ **Il difetto**: con VestiFlow 10 e Shopify 10 si decide «basta la
        //    base». Se poi una vendita locale porta VestiFlow a 9 e la presa
        //    fallisce, il ricalcolo trova che bisogna inviare 9 — ma la
        //    decisione di NON scrivere resta memorizzata, e si conferma 9
        //    senza mandarlo: Shopify resta a 10.
        await senzaBase();
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 10);

        let interposto = false;
        const prismaSpia = new Proxy(prisma, {
          get(target, prop, receiver) {
            if (prop === '$queryRaw') {
              const originale = Reflect.get(target, prop, receiver) as (
                ...a: unknown[]
              ) => Promise<unknown>;
              return async (...args: unknown[]) => {
                const esito = await originale.apply(target, args);
                if (!interposto) {
                  interposto = true;
                  await prisma.$transaction(async (tx) => {
                    await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
                  });
                }
                return esito;
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });

        const push = new ShopifyInventoryPushService(
          prismaSpia as never,
          negozio.oauth() as never,
          negozio.admin() as never,
          negozio.graphql() as never,
          { touchSync: vi.fn() } as never,
          new ShopifyInventoryReconciliationService(prisma as never),
          storico,
          registro,
        );
        const esito = await push.riallineaCoppia(IDS.tenantA, variantId, IDS.locA1);

        expect(interposto).toBe(true);
        // ⭐ Il 9 è stato SCRITTO davvero, non solo confermato.
        expect(esito.pushed).toBe(true);
        expect(remoto()).toBe(9);
        expect((await stato()).lastPushedAvailable).toBe(9);
      });

      it('⛔ 3-bis · e la direzione opposta: diversi, poi UGUALI nel ricalcolo', async () => {
        // ⛔ **L'uscita anticipata che salta la creazione della base.** Se al
        //    primo giro i valori differiscono e al ricalcolo coincidono, il
        //    ciclo usciva con «invariata» senza prendere e senza confermare: la
        //    coppia restava fuori dal regime nuovo.
        await senzaBase();
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);

        // Fra la lettura e la presa il Disponibile scende a 7: da lì in poi
        // locale e canale coincidono.
        let interposto = false;
        const prismaSpia = new Proxy(prisma, {
          get(target, prop, receiver) {
            if (prop === '$queryRaw') {
              const originale = Reflect.get(target, prop, receiver) as (
                ...a: unknown[]
              ) => Promise<unknown>;
              return async (...args: unknown[]) => {
                const esito = await originale.apply(target, args);
                if (!interposto) {
                  interposto = true;
                  await prisma.$transaction(async (tx) => {
                    await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -3, 'locale');
                  });
                }
                return esito;
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });

        const push = new ShopifyInventoryPushService(
          prismaSpia as never,
          negozio.oauth() as never,
          negozio.admin() as never,
          negozio.graphql() as never,
          { touchSync: vi.fn() } as never,
          new ShopifyInventoryReconciliationService(prisma as never),
          storico,
          registro,
        );
        await push.riallineaCoppia(IDS.tenantA, variantId, IDS.locA1);

        expect(interposto).toBe(true);
        expect(await disponibile()).toBe(7);
        const dopo = await stato();
        // ⭐ **La base c'è**: locale e canale coincidono, e la coppia entra nel
        //    regime continuo senza che sia servita una scrittura.
        expect(dopo.lastPushedAvailable).toBe(7);
        expect(dopo.localPendingDelta).toBe(0);
        expect(remoto()).toBe(7);
      });

      it('⛔ 4 · il residuo non conta due volte, e comprende le ESCLUSE già pronte', async () => {
        // ⛔ **Criteri incoerenti**: la selezione considerava «con base» una riga
        //    col solo `L`, il conteggio pretendeva anche `P`. Una coppia con
        //    `L = 0` e `P` NULL veniva contata due volte al secondo rifiuto.
        //    E una coppia già pronta, esclusa, spariva dal residuo.
        await conBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);
        // Lo scope di scrittura non c'è: la coppia esce ESCLUSA, e ha la base.
        await prisma.shopifyConnection.updateMany({
          where: { tenantId: IDS.tenantA },
          data: { scopes: ['read_products', 'write_products'] },
        });

        const esito = await allineatore3().allinea(IDS.tenantA);

        // ⭐ Non è stata allineata, e l'elenco lo dice con il motivo.
        expect(esito.nonAllineate).toHaveLength(1);
        expect(esito.nonAllineate[0]?.motivo).toBe('permesso_mancante');
      });

      it('⛔ A · dopo un rifiuto CON movimento: non «pronta», e C non resta NULL', async () => {
        // ⛔ **Il ramo che la correzione precedente non copriva.** Conservare il
        //    movimento è giusto, ma non dimostra che l'allineamento sia
        //    riuscito: restano il vecchio `P` e un `L` valorizzato, e il
        //    criterio «pronta» li vede entrambi — la coppia risulta a posto
        //    mentre il rifiuto c'è stato.
        //
        // ⛔ **E i due contatori venivano annullati SEPARATAMENTE**: `L = −1`
        //    conservato e `C` riportato a NULL. Da lì ogni acquisizione di
        //    canale sarebbe svanita su un `increment` di NULL.
        await senzaBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);

        const graphql = negozio.graphql();
        const letturaVera = graphql.getRemoteLevelAtLocation;
        const scritturaVera = graphql.setInventoryQuantities;
        let mosso = false;
        let venduto = false;
        graphql.getRemoteLevelAtLocation = (async (...args: unknown[]) => {
          const letto = await letturaVera(...(args as Parameters<typeof letturaVera>));
          if (!mosso) {
            mosso = true;
            negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 2);
          }
          return letto;
        }) as typeof letturaVera;
        graphql.setInventoryQuantities = vi.fn(async (...args: unknown[]) => {
          if (!venduto) {
            venduto = true;
            await prisma.$transaction(async (tx) => {
              await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
            });
          }
          return scritturaVera(...(args as Parameters<typeof scritturaVera>));
        }) as typeof scritturaVera;

        const esito = await allineatore3(graphql).allinea(IDS.tenantA);

        const dopo = await stato();
        // ⭐ Il movimento SOPRAVVIVE: non si risolve cancellando il −1.
        expect(dopo.localPendingDelta).toBe(-1);
        // ⭐ **E `C` non resta NULL**: i due contatori vivono o muoiono insieme.
        expect(dopo.channelAcquiredDelta).toBe(0);
        // ⛔ L'allineamento NON è riuscito: la coppia resta nell'elenco.
        expect(esito.allineate).toBe(0);
        expect(esito.nonAllineate).toHaveLength(1);

        // ⭐ **E le acquisizioni successive restano registrate**: è la
        //    conseguenza che il `C` a NULL avrebbe fatto sparire.
        await prisma.$transaction(async (tx) => {
          await applyCommittedDelta(tx, IDS.tenantA, variantId, IDS.locA1, 1, 'canale');
        });
        expect((await stato()).channelAcquiredDelta).toBe(-1);
      });

      it('⛔ B · le non pronte STABILMENTE escluse non affamano le pronte', async () => {
        // ⛔ **La priorità assoluta blocca.** Mettere sempre le non pronte
        //    davanti significa che 205 coppie escluse in modo stabile occupano
        //    le duecento posizioni a ogni passata: la rotazione avviene DENTRO
        //    il gruppo prioritario, e le pronte da correggere non arrivano mai.
        //    È lo stesso blocco di testa già pagato nella coda del ritentativo.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });

        // 205 coppie che il canale non risolve: restano non pronte per sempre.
        const prodotto = await prisma.product.create({
          data: { tenantId: IDS.tenantA, name: 'Escluse', articleCode: 'ESCL' },
        });
        for (let i = 0; i < 205; i += 1) {
          const variante = await prisma.productVariant.create({
            data: {
              tenantId: IDS.tenantA,
              productId: prodotto.id,
              sku: `ESCL-${i}`,
              sellingPriceMinor: 100,
              // ⚠️ Un identificativo che il negozio simulato non conosce.
              shopifyVariantId: `gid://shopify/ProductVariant/6660${i}`,
            },
          });
          await prisma.inventoryLevel.create({
            data: {
              tenantId: IDS.tenantA,
              variantId: variante.id,
              locationId: IDS.locA1,
              onHand: 3,
              available: 3,
              committed: 0,
            },
          });
        }
        // 5 coppie già pronte, che differiscono dal canale.
        await coppieConBase(5, IDS.locA1, SEDE_REMOTA, 0);

        const giro = await giroCompleto(allineatore3);

        // ⭐ **Le cinque pronte vengono raggiunte lo stesso**, e non perche' una
        //    priorita' le porti in testa: perche' il giro non si ferma prima della
        //    fine del perimetro. Duecento coppie stabilmente non risolvibili non
        //    possono piu' affamare nessuno.
        expect(giro.allineate).toBe(5);
        expect(giro.fine).toBe(true);
        // ⭐ E le duecentocinque restano nell'elenco, nominate: errore di LETTURA,
        //    non scrittura incerta — la risoluzione fallisce prima di prenotare
        //    qualunque cosa, quindi non c'e' niente di sospeso da riconciliare.
        expect(conMotivo(giro as never, 'errore_di_lettura')).toBe(205);
        // ⭐ **E il conto torna**: ogni coppia esaminata e' finita in uno dei tre
        //    esiti, nessuna e' sparita e nessuna e' stata contata due volte.
        expect(giro.allineate + giro.giaAllineate + giro.nonAllineate.length).toBe(
          giro.esaminate,
        );
        expect(giro.esaminate).toBe(giro.totale);
      });

      it('⛔ C · un BLOCCO non è un\u0027operazione: il perimetro non è finito', async () => {
        // ⛔ **Qui il comando poteva dire «zero da fare» avendone lette 200 su
        //    300.** Il difetto non era il conteggio: era che una passata si
        //    dichiarava conclusa senza aver attraversato il perimetro.
        //
        // ⭐ Adesso un blocco dice soltanto **dove si è fermato**, e `fine` è
        //    vero solo quando il perimetro è finito davvero.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
        // ⚠️ **Tutte e trecento UGUALI al canale**: così nessuna scrittura
        //    consuma il tetto, e a fermare la passata è solo quello di
        //    scansione. Con un misto, a decidere quante se ne esaminano
        //    sarebbe l'ordine degli uuid — cioè il caso.
        await coppieConBase(300, IDS.locA1, SEDE_REMOTA, 999);

        const blocco = await allineatore3().allinea(IDS.tenantA);

        expect(blocco.esaminate).toBe(200);
        expect(blocco.giaAllineate).toBe(200);
        expect(blocco.totale).toBe(300);
        // ⛔ **Il blocco NON si dichiara concluso**, e dice da dove riprendere.
        expect(blocco.fine).toBe(false);
        expect(blocco.prossimo).not.toBeNull();

        // ⭐ Il giro completo, che è ciò che fa una pressione, le attraversa
        //    tutte e trecento — senza chiedere niente a nessuno.
        const giro = await giroCompleto(allineatore3);
        expect(giro.esaminate).toBe(300);
        expect(giro.fine).toBe(true);
        expect(giro.nonAllineate).toEqual([]);
      });

      it('⛔ D · il vecchio confermato NON certifica una partenza fallita', async () => {
        // ⛔ **Il caso precedente correggeva il RIEPILOGO, non la validità della
        //    base.** Dopo un Allinea rifiutato con un movimento nella finestra
        //    restano `L = −1` e il vecchio `P`: il percorso ordinario li vede
        //    entrambi e considera la coppia dentro il regime nuovo.
        //
        // ⛔ **E non è un dettaglio di stato: lo scarico di `C` userebbe quel
        //    `P`.** L'invio ordinario fa `C -= (R − P)`, e con un `P` mai
        //    confermato in questo regime quel numero non significa niente.
        await senzaBase(10);
        negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 4);

        const graphql = negozio.graphql();
        const letturaVera = graphql.getRemoteLevelAtLocation;
        const scritturaVera = graphql.setInventoryQuantities;
        let mosso = false;
        let venduto = false;
        graphql.getRemoteLevelAtLocation = (async (...args: unknown[]) => {
          const letto = await letturaVera(...(args as Parameters<typeof letturaVera>));
          if (!mosso) {
            mosso = true;
            negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 2);
          }
          return letto;
        }) as typeof letturaVera;
        graphql.setInventoryQuantities = vi.fn(async (...args: unknown[]) => {
          if (!venduto) {
            venduto = true;
            await prisma.$transaction(async (tx) => {
              await applyInventoryDelta(tx, IDS.tenantA, variantId, IDS.locA1, -1, 'locale');
            });
          }
          return scritturaVera(...(args as Parameters<typeof scritturaVera>));
        }) as typeof scritturaVera;

        await allineatore3(graphql).allinea(IDS.tenantA);

        const dopoRifiuto = await stato();
        // ⭐ Il lavoro resta conservato: non si risolve cancellando il −1.
        expect(dopoRifiuto.localPendingDelta).toBe(-1);
        expect(dopoRifiuto.channelAcquiredDelta).toBe(0);
        // ⛔ **Ma il vecchio confermato non vale più**: la partenza è fallita.
        expect(dopoRifiuto.lastPushedAvailable).toBeNull();

        // ── e ora si PROSEGUE, con un esecutore nuovo ────────────────────
        //    Un aggiornamento ordinario non deve certificare quella base.
        const canalePrima = remoto();
        const ordinario = await nuovoEsecutore().pushLevel(IDS.tenantA, variantId, IDS.locA1);

        expect(ordinario.pushed).toBe(false);
        expect(ordinario.reason).toBe('base_assente');
        expect(remoto()).toBe(canalePrima);
        // ⭐ E il lavoro è ancora lì, in attesa di un Allinea riuscito.
        expect((await stato()).localPendingDelta).toBe(-1);

        // ── un Allinea RIUSCITO chiude la partenza ───────────────────────
        const esito = await allineatore3().allinea(IDS.tenantA);

        expect(esito.allineate).toBe(1);
        const finale = await stato();
        expect(finale.lastPushedAvailable).toBe(9);
        expect(finale.localPendingDelta).toBe(0);
        expect(esito.nonAllineate).toEqual([]);
      });

      it('⭐ E · 120 senza base: un giro solo le porta TUTTE dentro', async () => {
        // ⛔ **Qui il residuo sommava insiemi che si sovrappongono**, e servivano
        //    più pressioni per arrivare in fondo.
        //
        // ⭐ Adesso una pressione basta: il tetto delle scritture chiude il
        //    blocco, non il controllo.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
        await coppieInMassa(120, IDS.locA1, SEDE_REMOTA);

        const giro = await giroCompleto(allineatore3);

        // ⭐ **Un giro, tutte e 120**, e nessuna anomalia in coda.
        expect(giro.allineate).toBe(120);
        expect(giro.nonAllineate).toEqual([]);
        expect(giro.fine).toBe(true);
        // ⭐ **In piu' blocchi**: 120 scritture non stanno in un tetto da 50, e
        //    il giro li attraversa da solo — senza chiedere un altro clic.
        expect(giro.blocchi).toBeGreaterThanOrEqual(3);
      });

      it('⭐ F · «mai guardate» scende a zero anche senza lavoro da fare', async () => {
        // ⛔ **Qui il conto delle non esaminate non convergeva mai**, perché era
        //    relativo alla passata invece che al perimetro.
        //
        // ⭐ Adesso la domanda non si pone: il giro attraversa tutto e il
        //    cursore garantisce che nessuna coppia sia saltata né rivista.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
        await coppieConBase(300, IDS.locA1, SEDE_REMOTA, 999);

        const giro = await giroCompleto(allineatore3);

        // ⭐ Tutte e trecento esaminate una volta sola, e il giro si chiude.
        expect(giro.esaminate).toBe(300);
        expect(giro.giaAllineate).toBe(300);
        expect(giro.fine).toBe(true);
        expect(giro.nonAllineate).toEqual([]);

        // ⛔ **E una pressione NUOVA riparte da capo**, senza cursore: è il
        //    comportamento voluto, non una ripetizione inutile.
        const nuovo = await allineatore3().allinea(IDS.tenantA);
        expect(nuovo.esaminate).toBe(200);
        expect(nuovo.fine).toBe(false);
      });

      it('⭐ G · al SECONDO uso il giro copre tutto, comunque siano messe le righe', async () => {
        // ⛔ **Il difetto di prima.** Al secondo uso di Allinea ogni riga porta
        //    già un `last_attempt_at`, e il conto delle «mai guardate» nasceva a
        //    ZERO: il comando si dichiarava finito con cento coppie mai lette,
        //    e proprio quelle disallineate.
        //
        // ⭐ **Adesso non si deduce più niente da una data**: il giro attraversa
        //    il perimetro per cursore, quindi lo stato pregresso delle righe non
        //    può più far finire il controllo in anticipo.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
        const ieri = new Date(Date.now() - 24 * 60 * 60 * 1000);
        // Le prime 200 in ordine di rotazione sono a posto; le ultime 100 no.
        await coppieConBase(300, IDS.locA1, SEDE_REMOTA, 200, ieri);

        const giro = await giroCompleto(allineatore3);

        // ⭐ **Si ferma perché ha controllato tutto**, non perché un numero è
        //    andato a zero da sé.
        expect(giro.esaminate).toBe(300);
        expect(giro.fine).toBe(true);
        expect(giro.nonAllineate).toEqual([]);
        // ⭐ E le cento disallineate sono state DAVVERO corrette.
        expect(giro.allineate).toBe(100);
        expect(giro.giaAllineate).toBe(200);
        expect(negozio.quantitaRemota('8' + SEDE_REMOTA + '0299', SEDE_REMOTA)).toBe(5);
        expect(negozio.quantitaRemota('8' + SEDE_REMOTA + '0200', SEDE_REMOTA)).toBe(5);
      });

      it('⭐ H · una coppia RIFIUTATA resta nell elenco finale del giro', async () => {
        // ⛔ **Il difetto di prima.** L'elenco delle coppie da riprendere si
        //    ricostruiva a ogni chiamata: una coppia già inizializzata che
        //    falliva spariva dal residuo alla passata dopo, e tornava
        //    indistinguibile da una allineata.
        //
        // ⭐ **Adesso l'elenco è del GIRO**, e il giro è una pressione sola:
        //    quella coppia ci resta, con il suo motivo, fino alla consegna.
        await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
        await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
        const ieri = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await coppieConBase(300, IDS.locA1, SEDE_REMOTA, 999, ieri);
        // ⭐ **L'ULTIMA della prima passata**: così alla seconda la rotazione
        //    guarda le cento rimaste fuori e le prime cento — non lei.
        const itemRotto = '8' + SEDE_REMOTA + '0199';
        negozio.impostaQuantitaRemota(itemRotto, SEDE_REMOTA, 1);
        // ⭐ È l'UNICA che chiede una scrittura, quindi il rifiuto è suo.
        negozio.rispondiConUserError('INVALID_LOCATION');

        const giro = await giroCompleto(allineatore3);

        // ⭐ **La coppia rifiutata è nell\u0027elenco finale, una volta sola**, con
        //    il motivo nominato e la sede che la identifica.
        expect(giro.esaminate).toBe(300);
        expect(giro.giaAllineate).toBe(299);
        expect(giro.fine).toBe(true);
        expect(giro.nonAllineate).toHaveLength(1);
        expect(giro.nonAllineate[0]?.motivo).toBe('richiesta_rifiutata');
        expect(giro.nonAllineate[0]?.sede).toBeTruthy();
        expect(giro.nonAllineate[0]?.articolo).toBeTruthy();
        // ⛔ **E il canale NON è stato toccato**: il rifiuto non si aggira.
        expect(negozio.quantitaRemota(itemRotto, SEDE_REMOTA)).toBe(1);

        // ⭐ **Una pressione nuova riparte da capo**, e senza il rifiuto
        //    iniettato la corregge: la gestione manuale è questa.
        const dopo = await giroCompleto(allineatore3);
        expect(dopo.nonAllineate).toEqual([]);
        expect(dopo.fine).toBe(true);
        expect(negozio.quantitaRemota(itemRotto, SEDE_REMOTA)).toBe(5);
        const riparata = await prisma.shopifyInventorySyncState.findFirst({
          where: { tenantId: IDS.tenantA, variant: { shopifyInventoryItemId: itemRotto } },
        });
        expect(riparata?.mismatchDetected).toBe(false);
        expect(riparata?.lastPushedAvailable).toBe(5);
      });

      /**
       * LE QUATTRO VERIFICHE sul comando a blocchi — 11/09/2026.
       *
       * ⭐ Chieste una per una dal proprietario: sono i punti in cui un giro a
       *    blocchi può perdere lavoro o mentire sulla propria conclusione.
       */
      describe('il giro a blocchi', () => {
        /** Le coppie del perimetro nell'ordine ESATTO in cui il giro le attraversa. */
        async function perimetroOrdinato() {
          return prisma.inventoryLevel.findMany({
            where: {
              tenantId: IDS.tenantA,
              location: { shopifyLocationId: { not: null } },
              variant: {
                shopifyVariantId: { not: null },
                product: { shopifySyncEnabled: true },
              },
            },
            orderBy: [{ locationId: 'asc' }, { variantId: 'asc' }],
            select: { locationId: true, variantId: true },
          });
        }

        it('⭐ K1 · il cursore punta all ULTIMA esaminata, anche col tetto raggiunto', async () => {
          // ⛔ **È il punto in cui un giro a blocchi perde lavoro.** Se il cursore
          //    puntasse alla fine del blocco SELEZIONATO invece che all'ultima
          //    coppia davvero esaminata, le coppie fra il tetto delle scritture e
          //    la fine del blocco verrebbero saltate — e nessuno se ne
          //    accorgerebbe, perché il giro finirebbe lo stesso.
          await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
          await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
          // 120 coppie che chiedono TUTTE una scrittura: il tetto scatta a 50,
          // molto prima dei 200 del blocco.
          await coppieInMassa(120, IDS.locA1, SEDE_REMOTA);
          const ordinate = await perimetroOrdinato();

          const blocco = await allineatore3().allinea(IDS.tenantA);

          // ⭐ Il blocco si è fermato sulle SCRITTURE, non sulla scansione.
          expect(blocco.esaminate).toBe(50);
          expect(blocco.allineate).toBe(50);
          expect(blocco.fine).toBe(false);
          // ⭐ **E il cursore è la cinquantesima**, non la duecentesima.
          expect(blocco.prossimo).toEqual({
            locationId: ordinate[49]!.locationId,
            variantId: ordinate[49]!.variantId,
          });

          // ⭐ Il blocco dopo riprende dalla CINQUANTUNESIMA: niente saltato.
          const secondo = await allineatore3().allinea(IDS.tenantA, blocco.prossimo ?? undefined);
          expect(secondo.esaminate).toBe(50);

          // ⭐ E il giro intero copre tutte e 120, una volta sola ciascuna.
          const giro = await giroCompleto(allineatore3);
          expect(giro.esaminate + 100).toBe(220);
          const senzaBase = await prisma.shopifyInventorySyncState.count({
            where: { tenantId: IDS.tenantA, localPendingDelta: null },
          });
          expect(senzaBase).toBe(0);
        });

        it('⛔ K2 · un errore nel mezzo NON fa dichiarare concluso il giro', async () => {
          // ⛔ **La regola è: se si interrompe, non è completato.** Un giro che
          //    accumulasse i blocchi riusciti e poi dicesse «fatto» sarebbe la
          //    bugia peggiore di tutte — l'operatore andrebbe a leggere un elenco
          //    parziale credendolo completo.
          await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
          await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
          await coppieConBase(300, IDS.locA1, SEDE_REMOTA, 999);

          const primo = await allineatore3().allinea(IDS.tenantA);
          expect(primo.esaminate).toBe(200);
          expect(primo.fine).toBe(false);

          // ── il blocco successivo MUORE a metà ──────────────────────────
          let restanti = 5;
          const arrestato = new ShopifyInventoryAlignService(
            prismaCheSiArresta(() => (restanti -= 1) === 0) as never,
            nuovoEsecutore() as never,
          );
          await expect(
            arrestato.allinea(IDS.tenantA, primo.prossimo ?? undefined),
          ).rejects.toThrow('arresto simulato');

          // ⭐ **Niente si dichiara concluso**: chi ha premuto non ha mai visto
          //    `fine`, e l'unica cosa vera è che il controllo è incompleto.
          expect(primo.fine).toBe(false);

          // ⭐ E una pressione NUOVA riparte dal principio, come concordato.
          const nuovo = await allineatore3().allinea(IDS.tenantA);
          expect(nuovo.esaminate).toBe(200);
          expect(nuovo.fine).toBe(false);
          const giro = await giroCompleto(allineatore3);
          expect(giro.esaminate).toBe(300);
          expect(giro.fine).toBe(true);
        });

        it('⛔ K3 · risposta PERSA dopo la scrittura: il tentativo persistente regge', async () => {
          // ⛔ **È il caso in cui un giro può fare danno.** La scrittura è
          //    arrivata, il canale è cambiato, e la risposta si è persa: chi non
          //    distingue «non ho scritto» da «non so» riprova, e applica due volte
          //    lo stesso effetto.
          await senzaBase();
          negozio.impostaQuantitaRemota(inventoryItemId, SEDE_REMOTA, 7);
          // ⭐ L'effetto viene APPLICATO, e a mancare è solo la conferma.
          negozio.perdiProssimaRisposta('setInventoryQuantities');

          const giro = await giroCompleto(allineatore3);

          // ⭐ Il canale HA ricevuto il valore.
          expect(remoto()).toBe(10);
          // ⛔ Ma non si dichiara allineata: non lo sappiamo.
          expect(giro.allineate).toBe(0);
          expect(giro.nonAllineate).toHaveLength(1);
          expect(giro.nonAllineate[0]?.motivo).toBe('scrittura_esito_incerto');
          // ⭐ **Il tentativo resta APERTO sulla riga**: è ciò che impedisce al
          //    giro dopo di aprirne uno nuovo e indipendente.
          const sospeso = await stato();
          expect(sospeso.pendingKey).not.toBeNull();
          expect(sospeso.lastPushedAvailable).toBeNull();

          // ── una pressione nuova: si RIPRENDE quel tentativo, non se ne apre
          //    un altro. Il canale non si muove di un pezzo.
          const scrittePrima = negozio.quantitaMandate.length;
          const dopo = await giroCompleto(allineatore3);

          expect(remoto()).toBe(10);
          expect(negozio.quantitaMandate.length).toBeGreaterThanOrEqual(scrittePrima);
          expect(dopo.nonAllineate).toEqual([]);
          const risolto = await stato();
          expect(risolto.pendingKey).toBeNull();
          expect(risolto.lastPushedAvailable).toBe(10);
        });

        it('⛔ K4 · quantità che cambiano DURANTE il giro: le protezioni reggono', async () => {
          // ⛔ **Un giro lungo attraversa un canale vivo.** Se il confronto
          //    cedesse per far «finire» il controllo, l'allineamento
          //    sovrascriverebbe una vendita appena avvenuta su Shopify.
          await prisma.inventoryLevel.deleteMany({ where: { tenantId: IDS.tenantA } });
          await prisma.shopifyInventorySyncState.deleteMany({ where: { tenantId: IDS.tenantA } });
          await coppieInMassa(3, IDS.locA1, SEDE_REMOTA);
          const bersaglio = `${SEDE_REMOTA}0001`;

          const graphql = negozio.graphql();
          const letturaVera = graphql.getRemoteLevelAtLocation;
          let mosso = false;
          graphql.getRemoteLevelAtLocation = (async (...args: unknown[]) => {
            const letto = await letturaVera(...(args as Parameters<typeof letturaVera>));
            // ⭐ Il canale si muove SOTTO il giro, su una coppia sola.
            if (!mosso && args.some((a) => a === bersaglio)) {
              mosso = true;
              negozio.impostaQuantitaRemota(bersaglio, SEDE_REMOTA, 4);
            }
            return letto;
          }) as typeof letturaVera;

          const giro = await giroCompleto(() =>
            new ShopifyInventoryAlignService(prisma as never, nuovoEsecutore(graphql) as never),
          );

          // ⭐ **Il confronto ha respinto quella scrittura**, e le altre due sono
          //    passate: il giro finisce, e l'anomalia resta dichiarata.
          expect(giro.fine).toBe(true);
          expect(giro.allineate).toBe(2);
          expect(giro.nonAllineate).toHaveLength(1);
          expect(giro.nonAllineate[0]?.motivo).toBe('divergenza_accertata');
          // ⛔ E il canale è rimasto dove si era mosso: nessuna sovrascrittura.
          expect(negozio.quantitaRemota(bersaglio, SEDE_REMOTA)).toBe(4);
        });

        /**
         * Un client che si ARRESTA subito dopo `segnaEsaminata`.
         *
         * ⭐ Riproduce il punto esatto: la marcatura è andata a buon fine e il
         *    processo muore prima del controllo.
         */
        function prismaCheSiArresta(deveArrestarsi: () => boolean) {
          const delegato = prisma.shopifyInventorySyncState;
          const sostituto = new Proxy(delegato as object, {
            get(bersaglio, chiave) {
              if (chiave === 'upsert') {
                return async (argomenti: never) => {
                  const esito = await delegato.upsert(argomenti);
                  if (deveArrestarsi()) {
                    throw new Error('arresto simulato dopo segnaEsaminata');
                  }
                  return esito;
                };
              }
              const valore = Reflect.get(bersaglio, chiave);
              return typeof valore === 'function' ? valore.bind(delegato) : valore;
            },
          });
          return new Proxy(prisma as object, {
            get(bersaglio, chiave) {
              if (chiave === 'shopifyInventorySyncState') {
                return sostituto;
              }
              const valore = Reflect.get(bersaglio, chiave);
              return typeof valore === 'function' ? valore.bind(prisma) : valore;
            },
          });
        }
      });

    });
  });
});
