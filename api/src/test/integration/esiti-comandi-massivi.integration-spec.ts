import { ReservationStatus, SalesOrderSource } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import { ShopifyInventoryRepublishService } from '../../shopify/shopify-inventory-republish.service';
import { ShopifyConnectionService } from '../../shopify/shopify-connection.service';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * **Gli esiti dei comandi MASSIVI dicono la verità.**
 *
 * ⭐ È lo stesso principio già chiuso per il pulsante del singolo prodotto
 *    (26.2), applicato ai due comandi di lotto: il ritentativo delle quantità e
 *    l'import del catalogo. ⛔ Il difetto non è che sbaglino il lavoro: è che
 *    **dichiarano male** com'è andato, e chi legge conclude il contrario.
 *
 * ⚠️ **Perimetro**: qui non si costruisce nessuna coda, non si sospende nessuna
 *    importazione e non si ridisegna nessun pulsante.
 *
 * ⛔ **Qui c'era «il criterio d'invio del push non si tocca», e dal 09/09/2026
 *    non è più vero.** Il criterio è stato toccato in un punto solo e per una
 *    porta sola: il percorso interno di **recupero** supera il confronto con
 *    l'ultimo inviato, che nel disallineamento canonico è proprio il valore
 *    messo in dubbio. Il push **ordinario** lo conserva, e `V15` lo fissa.
 *    Lasciare quella riga avrebbe detto il contrario di ciò che il file prova.
 */
describe('Esiti veritieri dei comandi massivi', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;
  let shopId: string;
  /**
   * ⛔ **Il servizio connessione VERO, non un finto.** `V5` e `V6` misurano
   *    proprio il timbro di fine sincronizzazione: con un finto, `V5` sarebbe
   *    verde senza dimostrare niente — il timbro non verrebbe scritto perché
   *    non c'è nessuno a scriverlo, non perché il codice ha deciso di non farlo.
   */
  let connessioneVera: ShopifyConnectionService;

  const DOMINIO = 'esiti.myshopify.com';
  const SEDE_REMOTA = '88001';

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
    connessioneVera = new ShopifyConnectionService(prisma as never, {
      // La configurazione serve solo alle rotte OAuth, che qui non si toccano.
      shopifyApiKey: '',
      shopifyApiSecret: '',
    } as never);
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    const guasti: string[] = [];
    const tenta = async (passo: string, azione: () => Promise<unknown>) => {
      try {
        await azione();
      } catch (errore) {
        guasti.push(`${passo}: ${errore instanceof Error ? errore.message : String(errore)}`);
      }
    };
    // ⚠️ `shopify_inventory_sync_states` non ha chiavi esterne nel database,
    //    quindi il `TRUNCATE … CASCADE` della fixture non la raggiunge: le
    //    righe sopravvivrebbero al file successivo. Causa misurata e registrata
    //    in `docs/DA-FARE` §21-ter; questa riga è un contenimento dichiarato.
    await tenta('cancellazione degli stati sync', () =>
      prisma.shopifyInventorySyncState.deleteMany({}),
    );
    await tenta('svuota', () => svuota(prisma));
    await tenta('disconnessione', () => prisma.$disconnect());
    if (guasti.length > 0) {
      throw new Error(`Pulizia di esiti-comandi-massivi fallita — ${guasti.join(' | ')}`);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.shopifyInventorySyncState.deleteMany({});
    await prisma.platformAuditLog.deleteMany({});
    semi = 0;
    ordini = 0;
    ordineCoda = 0;
    negozio = new NegozioSimulato(DOMINIO, 995000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/995001' },
    });
    shopId = riga.id;
    await prisma.shopifyConnection.create({
      data: {
        tenantId: IDS.tenantA,
        status: 'connected',
        shopDomain: DOMINIO,
        shopId,
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
  });

  // ── attrezzi ─────────────────────────────────────────────────────────────

  let semi = 0;
  function seminaDue(nome: string) {
    semi += 1;
    const base = `80030000000${String(semi).padStart(2, '0')}`;
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

  /**
   * ⚠️ **Il client GRAPHQL si passa dall'esterno**, perché `negozio.graphql()`
   *    restituisce un oggetto NUOVO a ogni chiamata: per intercettare la
   *    scrittura verso il canale bisogna costruirlo una volta sola e avvolgerlo.
   *    ⛔ Ed è il GraphQL, non l'admin REST: dal 09/09/2026 la quantità passa
   *    di là, e un'intercettazione sul vecchio client non scatterebbe.
   */
  function creaPushInventario(graphql: unknown = negozio.graphql()) {
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

  function creaRipubblicazione(graphql?: unknown) {
    return new ShopifyInventoryRepublishService(prisma as never, creaPushInventario(graphql));
  }

  /** La riconciliazione VERA: serve a produrre gli stati invece di costruirli. */
  function creaRiconciliazione() {
    return new ShopifyInventoryReconciliationService(prisma as never);
  }

  async function importaEProduci(remotoId: number) {
    await creaImport().importProductFromWebhook(IDS.tenantA, negozio.webhook(remotoId) as never);
    return prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(remotoId) },
      include: { variants: { orderBy: { sku: 'asc' } } },
    });
  }

  async function giacenza(variantId: string, onHand: number, committed = 0): Promise<void> {
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

  /**
   * Accende il marcatore di disallineamento, come fa il Caso D del webhook.
   *
   * ⭐ **Fissa anche la posizione in coda.** Il ritentativo legge le righe per
   *    `updatedAt` crescente, e Prisma quel campo lo scrive dal client con la
   *    risoluzione al **millisecondo**: due righe create di seguito possono
   *    portare lo stesso istante, e l'ordine della coda diventa arbitrario. Le
   *    prove che iniettano un guasto «sulla prima chiamata» dipendono da
   *    quell'ordine, quindi lo si stabilisce invece di sperarci.
   */
  let ordineCoda = 0;
  /**
   * Una riga in coda di ripubblicazione.
   *
   * ⭐ **`osservato` e `remoto` sono due cose diverse, e dal 09/09/2026 si
   *    possono dichiarare separatamente.** `osservato` è ciò che VestiFlow ha
   *    REGISTRATO di aver visto; `remoto` è ciò che il canale porta ADESSO. Di
   *    norma coincidono — un'osservazione appena presa — e il valore predefinito
   *    lo dice; ma un'osservazione può essere vecchia, e il canale essere
   *    tornato dove l'avevamo lasciato.
   *
   * ⛔ **Nessuno dei due è la base del confronto**, che è e resta l'ultimo
   *    valore CONFERMATO. Poterli separare serve proprio a provarlo: una prova
   *    che li tiene sempre uguali non distingue «confronto contro l'osservato»
   *    da «confronto contro il confermato».
   */
  async function segnaDisallineata(
    variantId: string,
    ultimoInviato: number | null,
    osservato: number,
    remoto: number = osservato,
  ): Promise<void> {
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        lastPushedAvailable: ultimoInviato,
        lastPushedAt: ultimoInviato === null ? null : new Date(Date.now() - 3_600_000),
        lastObservedShopifyAvailable: osservato,
        lastObservedAt: new Date(),
        mismatchDetected: true,
        mismatchNote: 'costruito dalla prova',
      },
    });
    // ⭐ **Il negozio simulato deve PORTARE un valore, e va detto quale.** Dal
    //    09/09/2026 la scrittura viaggia con il confronto concorrenziale, quindi
    //    una riga che dichiara uno stato remoto senza che il negozio ce l'abbia
    //    costruirebbe un mondo incoerente, e la scrittura verrebbe rifiutata per
    //    una ragione che la prova non intende misurare.
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      select: { shopifyInventoryItemId: true },
    });
    if (variante.shopifyInventoryItemId) {
      negozio.impostaQuantitaRemota(variante.shopifyInventoryItemId, SEDE_REMOTA, remoto);
    }
    ordineCoda += 1;
    await prisma.$executeRawUnsafe(
      'UPDATE shopify_inventory_sync_states SET updated_at = $2::timestamptz WHERE variant_id = $1::uuid',
      variantId,
      new Date(Date.UTC(2026, 0, 1, 0, 0, ordineCoda)).toISOString(),
    );
  }

  async function inCoda(): Promise<number> {
    return prisma.shopifyInventorySyncState.count({
      where: { tenantId: IDS.tenantA, mismatchDetected: true },
    });
  }

  function statoSync(variantId: string) {
    return prisma.shopifyInventorySyncState.findUniqueOrThrow({
      where: {
        tenantId_variantId_locationId: {
          tenantId: IDS.tenantA,
          variantId,
          locationId: IDS.locA1,
        },
      },
    });
  }

  /**
   * Un impegno Shopify ATTIVO su quella coppia: è la condizione del **rinvio**
   * (Caso C della riconciliazione).
   *
   * ⚠️ **Non abbassa il Disponibile locale, ed è voluto.** Il Caso C esiste per
   *    l'ordine il cui `inventory_levels/update` arriva PRIMA del suo
   *    `orders/create`: Shopify ha già scalato, VestiFlow non ancora. Abbassare
   *    qui anche il livello locale riprodurrebbe lo stato in cui i due sono già
   *    allineati, cioè proprio il caso che il rinvio non riguarda.
   */
  let ordini = 0;
  async function impegnoShopifyAttivo(variantId: string, sku: string, quantita = 1): Promise<void> {
    ordini += 1;
    const ordine = await prisma.salesOrder.create({
      data: {
        tenantId: IDS.tenantA,
        orderNumber: `SH-${1000 + ordini}`,
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
        sku,
        quantity: quantita,
        remainingQuantity: quantita,
        status: ReservationStatus.active,
      },
    });
  }

  /** Chiude il collegamento di storico di una variante: 26.8 la deve rifiutare. */
  async function scollega(variantId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_links l
          SET status = 'unlinked', close_reason = 'operator',
              closed_at = GREATEST(now(), linked_at), updated_at = now()
         FROM shopify_variant_identities i
        WHERE l.identity_id = i.id AND i.variant_id = $1::uuid AND l.status = 'active'`,
      variantId,
    );
  }

  // ── 1 · il RITENTATIVO delle quantità ────────────────────────────────────

  it('V1 · «Shopify modificato a mano»: il recupero PARTE, e il canale lo rifiuta', async () => {
    // ⛔ **Il caso canonico del disallineamento, e ciò che il ritentativo NON
    //    è.** VestiFlow ha pubblicato 5 e non ha più cambiato la propria
    //    giacenza; qualcuno ha messo 3 a mano su Shopify.
    //
    // ⭐ **Il percorso di recupero supera il confronto con l'ultimo inviato**
    //    — quello che fermava il push ordinario prima ancora di partire — e la
    //    chiamata parte davvero. Ma parte portando la base CONFERMATA (5), e
    //    il canale è a 3: risponde di no.
    //
    // ⛔ **Qui questa prova diceva «ora si RIPUBBLICA», e la scrittura passava
    //    perché non c'era confronto.** Sovrascriveva 3 con 5 senza sapere
    //    perché il canale fosse a 3 — se per una modifica a mano o per due
    //    ordini non ancora acquisiti. Nel secondo caso rimetteva in vendita
    //    merce venduta. È la scrittura cieca che il proprietario ha escluso il
    //    09/09/2026: «Ritentativo: ripete un'operazione già definita.
    //    Riallineamento: deve stabilire quale quantità sia corretta prima di
    //    scriverla».
    //
    // ⏸ **Questo caso è un RIALLINEAMENTO, e il suo comando non esiste
    //    ancora**: la procedura sicura è un blocco a sé (`docs/DA-FARE.md`
    //    §29.6). Fino ad allora l'esito onesto è quello qui sotto — protetto e
    //    non risolto — e questa prova è la ragione per cui quel comando resta
    //    richiesto.
    const remoto = seminaDue('V1');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 5);
    await segnaDisallineata(variante.id, 5, 3);
    negozio.azzeraChiamate();

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    // ⭐ La chiamata è PARTITA: il recupero ha fatto il suo mestiere, e a dire
    //    di no è stato il canale. Distinguere «non è partito niente» da «è
    //    partito ed è stato rifiutato» è metà di questa prova.
    expect(negozio.chiamate.get('setInventoryQuantities')).toBe(1);
    // ⛔ E non ha scritto: il negozio porta ancora 3.
    expect(negozio.quantitaMandate).toEqual([]);
    expect(negozio.quantitaRemota(variante.shopifyInventoryItemId, SEDE_REMOTA)).toBe(3);

    // ⭐ **`refused`, non `failed`**: ritentare non lo risolve.
    expect(esito.refused).toBe(1);
    expect(esito.republished).toBe(0);
    expect(esito.failed).toBe(0);
    expect(esito.unchanged).toBe(0);

    // ⭐ Il problema resta VISIBILE e il confermato non avanza.
    const stato = await statoSync(variante.id);
    expect(stato.lastPushedAvailable).toBe(5);
    expect(stato.mismatchDetected).toBe(true);
    expect(stato.mismatchNote).toMatch(/Divergenza accertata/);
    expect(esito.remaining).toBe(1);
    expect(await inCoda()).toBe(1);
  });

  it('V1-bis · disallineamento RECUPERABILE: il canale è dove l avevamo lasciato, e l invio passa', async () => {
    // ⭐ **La controprova di V1, e ciò che il ritentativo È.** Stessa coda,
    //    stesso comando: cambia una cosa sola, e cioè che il canale porta
    //    ancora l'ultimo valore CONFERMATO. L'osservazione che ha acceso il
    //    marcatore era vecchia (3), il canale è tornato a 5, e in locale il
    //    Disponibile è nel frattempo diventato 6.
    //
    // ⛔ **Senza questa prova, V1 da sola non distinguerebbe «protetto» da
    //    «non parte mai più niente»**: una regressione che spegnesse del tutto
    //    la ripubblicazione la lascerebbe verde.
    const remoto = seminaDue('V1-bis');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 6);
    await segnaDisallineata(variante.id, 5, 3, 5);
    negozio.azzeraChiamate();

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(negozio.quantitaMandate).toEqual([
      {
        inventoryItemId: variante.shopifyInventoryItemId,
        locationId: SEDE_REMOTA,
        available: 6,
      },
    ]);
    // ⭐ E il negozio simulato adesso PORTA quel numero. Non è la stessa cosa
    //    che «la chiamata è partita»: il registro delle chiamate dice che
    //    qualcuno ha bussato, questo dice che cosa c'è dall'altra parte.
    expect(negozio.quantitaRemota(variante.shopifyInventoryItemId, SEDE_REMOTA)).toBe(6);
    expect(esito.republished).toBe(1);
    expect(esito.unchanged).toBe(0);
    expect(esito.refused).toBe(0);
    // ⭐ E l'arretrato dichiarato corrisponde a ciò che resta davvero: niente.
    expect(esito.remaining).toBe(0);
    expect(await inCoda()).toBe(0);
  });

  it('V2 · un collegamento ESCLUSO non riceve quantità, nemmeno zero, e non è una riuscita', async () => {
    const remoto = seminaDue('V2');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 7, 2);
    await scollega(variante.id);
    await segnaDisallineata(variante.id, 99, 3);
    negozio.azzeraChiamate();

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(negozio.chiamate.get('setInventoryQuantities') ?? 0).toBe(0);
    expect(negozio.quantitaMandate).toEqual([]);
    // ⭐ Il rifiuto è una classe a sé: non è una riuscita e non è un errore.
    expect(esito.refused).toBe(1);
    expect(esito.republished).toBe(0);
    expect(esito.failed).toBe(0);
    expect(esito.remaining).toBe(1);
  });

  it('V3 · la ripubblicazione che PARTE è l unica contata come riuscita', async () => {
    const remoto = seminaDue('V3');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 6);
    // ⚠️ L'ultimo inviato è DIVERSO dal disponibile: il push ha qualcosa da fare.
    await segnaDisallineata(variante.id, 2, 2);
    negozio.azzeraChiamate();

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(negozio.quantitaMandate).toEqual([
      {
        inventoryItemId: variante.shopifyInventoryItemId,
        locationId: SEDE_REMOTA,
        available: 6,
      },
    ]);
    expect(esito.republished).toBe(1);
    // ⭐ E il marcatore si spegne da sé, perché il push è andato a buon fine.
    expect(esito.remaining).toBe(0);
    expect(await inCoda()).toBe(0);
  });

  it('V4 · lotto MISTO: riuscita, nessun invio, rifiuto ed errore sono distinti', async () => {
    const remoto = seminaDue('V4');
    const prodotto = await importaEProduci(remoto.id);
    const altro = seminaDue('V4-bis');
    const prodottoB = await importaEProduci(altro.id);

    // ⚠️ **I nomi seguono l'ORDINE DELLA CODA**, che è `updatedAt` crescente,
    //    cioè quello di creazione. Qui c'era `parte` per la prima e `errore` per
    //    l'ultima, mentre il guasto iniettato abbatte la PRIMA chiamata al
    //    canale: i due ruoli erano scambiati, e la prova restava verde perché
    //    contava solo quante righe finivano in ciascuna classe, mai QUALE.
    const cade = prodotto.variants[0]!;
    const senzaInvio = prodotto.variants[1]!;
    const esclusa = prodottoB.variants[0]!;
    const parte = prodottoB.variants[1]!;

    await giacenza(cade.id, 6);
    await giacenza(senzaInvio.id, 5);
    await giacenza(esclusa.id, 4);
    await giacenza(parte.id, 3);

    await segnaDisallineata(cade.id, 2, 2);
    // ⚠️ **Marcatore acceso ma Shopify già d'accordo** (osservato 5 = pubblicabile
    //    5): il disallineamento non c'è più, e il recupero non deve ripubblicare.
    //    Prima del rimedio questa riga era «ultimo inviato uguale, osservato
    //    diverso» — cioè proprio il caso `V1`, che ora PARTE: lasciata com'era,
    //    misurerebbe il contrario di quello che dice.
    await segnaDisallineata(senzaInvio.id, 5, 5);
    await segnaDisallineata(esclusa.id, 99, 1);
    // ⚠️ **Il canale porta ancora il confermato (99), l'osservazione è vecchia
    //    (1).** Senza il quarto argomento questa riga sarebbe una divergenza
    //    accertata e finirebbe in `refused` — che è l'esito giusto per quel
    //    mondo, ma non è ciò che questa prova misura: qui il ruolo di questa
    //    riga è «parte e riesce». Il caso della divergenza in un lotto è V16.
    await segnaDisallineata(parte.id, 99, 1, 99);

    await scollega(esclusa.id);
    // Un guasto del canale sulla PRIMA chiamata, cioè sulla prima riga della coda.
    negozio.azzeraChiamate();
    negozio.guastaProssima('setInventoryQuantities', 1);

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    // ⭐ Le quattro classi sommano il tentato, e nessuna si traveste da un'altra.
    expect(esito.attempted).toBe(4);
    expect(esito.republished + esito.unchanged + esito.refused + esito.failed).toBe(4);
    expect(esito.unchanged).toBe(1);
    expect(esito.refused).toBe(1);
    expect(esito.failed).toBe(1);
    expect(esito.republished).toBe(1);
    // ⭐ **E l'attribuzione riga per riga, non solo il conteggio.** Il negozio
    //    simulato registra la quantità DOPO aver contato la chiamata, quindi
    //    quella caduta non compare: l'unica registrata è la riga che è partita
    //    davvero. Senza questa asserzione, un difetto che assegnasse l'esito di
    //    una riga a un'altra passerebbe inosservato.
    expect(negozio.quantitaMandate).toEqual([
      { inventoryItemId: parte.shopifyInventoryItemId, locationId: SEDE_REMOTA, available: 3 },
    ]);
    expect(negozio.chiamate.get('setInventoryQuantities')).toBe(2);
    // ⭐ E l'arretrato è quello vero: tre righe restano accese.
    expect(esito.remaining).toBe(3);
    expect(await inCoda()).toBe(3);
  });

  // ── 1-bis · il percorso interno di RECUPERO del disallineamento ──────────
  //
  // ⚠️ **Quattro di queste prove sono VERDI anche prima del rimedio**, e per una
  //    ragione che sta per sparire: il confronto con l'«ultimo inviato» fermava
  //    tutto prima. Il loro valore è quindi tutto nella **falsificazione**: se si
  //    toglie la rivalutazione corrispondente diventano rosse, mentre prima del
  //    rimedio nessuna riga di codice le teneva su. Sono `V8`, `V9`, `V11`, `V12`.

  it('V8 · un RINVIO sopravvenuto non viene aggirato da un vecchio disallineamento', async () => {
    // ⭐ **La sequenza è quella indicata dal proprietario**: disallineamento
    //    pendente → evento successivo che richiede il rinvio → ritentativo. E si
    //    costruisce con la riconciliazione VERA, non scrivendo gli stati a mano:
    //    con gli stati costruiti si misurerebbe la propria idea del Caso C.
    const remoto = seminaDue('V8');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    const itemId = variante.shopifyInventoryItemId!;
    await giacenza(variante.id, 5);
    // Un invio riuscito un'ora fa: fuori dalla finestra dell'eco.
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId: variante.id,
        locationId: IDS.locA1,
        lastPushedAvailable: 5,
        lastPushedAt: new Date(Date.now() - 3_600_000),
      },
    });
    const riconciliazione = creaRiconciliazione();

    // 1 · Shopify mostra 3, nessun impegno attivo: disallineamento pendente.
    expect(
      await riconciliazione.reconcileFromShopifyWebhook(IDS.tenantA, itemId, SEDE_REMOTA, 3),
    ).toBe('mismatch_republish');

    // 2 · arriva un ordine Shopify con impegno attivo, e il webhook successivo
    //     porta un valore più basso: la riconciliazione RINVIA.
    await impegnoShopifyAttivo(variante.id, variante.sku ?? 'V8');
    expect(
      await riconciliazione.reconcileFromShopifyWebhook(IDS.tenantA, itemId, SEDE_REMOTA, 2),
    ).toBe('deferred');
    // ⛔ Il ramo differito NON spegne il marcatore acceso al passo 1: la riga
    //    resta in coda, ed è da lì che il ritentativo la prende.
    expect(await inCoda()).toBe(1);
    negozio.azzeraChiamate();

    // ⭐ **Il MOTIVO, non solo il conteggio.** La classe «nessun invio» accorpa
    //    otto motivi diversi: senza questa asserzione la prova resterebbe verde
    //    anche se a fermare tutto fosse una variante scollegata invece del
    //    rinvio, cioè misurerebbe la cosa giusta per la ragione sbagliata.
    const singolo = await creaPushInventario().ripubblicaDisallineamento(
      IDS.tenantA,
      variante.id,
      IDS.locA1,
    );
    expect(singolo).toEqual({ pushed: false, reason: 'rinvio_attivo', publishableAvailable: 5 });
    negozio.azzeraChiamate();

    // 3 · il ritentativo rivaluta il rinvio, invece di ereditare la selezione.
    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(negozio.quantitaMandate).toEqual([]);
    // ⚠️ **`null`, non 3**: qui lo stato lo costruisce la RICONCILIAZIONE vera,
    //    che scrive la riga di VestiFlow e non tocca il negozio simulato. Il
    //    negozio non è mai stato scritto, ed è proprio ciò che questa prova
    //    deve dimostrare: il rinvio non ha fatto partire niente.
    expect(negozio.quantitaRemota(variante.shopifyInventoryItemId, SEDE_REMOTA)).toBeNull();
    expect(esito.republished).toBe(0);
    expect(esito.unchanged).toBe(1);
    // ⭐ E la riga resta in coda: il rinvio non è una risoluzione.
    expect(esito.remaining).toBe(1);
    // ⛔ Nessuna registrazione di «ultimo invio riuscito».
    expect((await statoSync(variante.id)).lastPushedAvailable).toBe(5);
  });

  it('V9 · un disallineamento GIÀ RISOLTO non provoca una ripubblicazione inutile', async () => {
    // Il marcatore è acceso, ma l'ultima osservazione dice che Shopify porta
    // già il valore che si manderebbe: non c'è più niente da correggere.
    const remoto = seminaDue('V9');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 5);
    await segnaDisallineata(variante.id, 5, 5);
    negozio.azzeraChiamate();

    // Il motivo, non solo il conteggio: si è fermato perché non c'era più
    // niente da correggere, non per un requisito mancante.
    expect(
      await creaPushInventario().ripubblicaDisallineamento(IDS.tenantA, variante.id, IDS.locA1),
    ).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 5 });

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(negozio.quantitaMandate).toEqual([]);
    expect(esito.republished).toBe(0);
    expect(esito.unchanged).toBe(1);
    // ⚠️ **Il marcatore resta acceso, ed è dichiarato**: spegnerlo è mestiere
    //    della riconciliazione (Caso A), non del ritentativo. Qui si evita
    //    l'invio inutile, non si chiude la coda.
    expect(esito.remaining).toBe(1);
  });

  it('V10 · l arretrato si RICONTA: un pendente risolto DURANTE la passata cambia il numero', async () => {
    const remoto = seminaDue('V10');
    const prodotto = await importaEProduci(remoto.id);
    const prima = prodotto.variants[0]!;
    const seconda = prodotto.variants[1]!;
    await giacenza(prima.id, 6);
    await giacenza(seconda.id, 5);
    // ⭐ L'ordine della coda lo fissa `segnaDisallineata`: la prima scritta è la
    //    prima a partire, e questa prova ci si appoggia.
    await segnaDisallineata(prima.id, 2, 2);
    await segnaDisallineata(seconda.id, 5, 3);

    // ⛔ **L'intercettazione segue il TRASPORTO, e dal 09/09/2026 il trasporto è
    //    GraphQL.** Avvolta intorno al vecchio client REST non scattava più:
    //    la prova restava verde o rossa per una ragione che non c'entrava con
    //    quello che misura.
    const vero = negozio.graphql() as unknown as Record<
      string,
      (...argomenti: unknown[]) => Promise<unknown>
    >;
    const graphqlIntercettato = {
      ...vero,
      setInventoryQuantities: async (...argomenti: unknown[]) => {
        const input = argomenti[2] as {
          readonly quantities: readonly { readonly inventoryItemId: string }[];
        };
        // ⭐ Mentre la passata è in corso, un'eco di Shopify risolve l'ALTRA
        //    riga. È la concorrenza che la suite non riproduceva, ed è l'unica
        //    condizione in cui riconta e sottrazione danno numeri diversi.
        const riguardaLaPrima = input.quantities.some((riga) =>
          riga.inventoryItemId.endsWith(String(prima.shopifyInventoryItemId)),
        );
        if (riguardaLaPrima) {
          await prisma.shopifyInventorySyncState.updateMany({
            where: { tenantId: IDS.tenantA, variantId: seconda.id },
            data: { mismatchDetected: false, mismatchNote: null },
          });
        }
        return vero['setInventoryQuantities']!(...argomenti);
      },
    };

    const esito = await creaRipubblicazione(graphqlIntercettato).retryPending(IDS.tenantA);

    expect(esito.pending).toBe(2);
    expect(esito.attempted).toBe(2);
    // Solo la prima parte: la seconda, risolta nel frattempo, non ha più niente
    // da correggere.
    expect(negozio.quantitaMandate).toEqual([
      {
        inventoryItemId: prima.shopifyInventoryItemId,
        locationId: SEDE_REMOTA,
        available: 6,
      },
    ]);
    expect(esito.republished).toBe(1);
    expect(esito.unchanged).toBe(1);
    // ⭐ **Riconta e sottrazione divergono, e qui si vede.** Ricontato: zero.
    expect(esito.remaining).toBe(0);
    expect(esito.pending - esito.republished).toBe(1);
    expect(await inCoda()).toBe(0);
  });

  it('V11 · collegamento ESCLUSO: il recupero non lo scavalca, e non manda nemmeno zero', async () => {
    // ⚠️ La differenza da `V2`: qui l'ultimo inviato COINCIDE col pubblicabile,
    //    cioè è esattamente il caso che il recupero sblocca. La guardia 26.8 sta
    //    prima, e deve continuare a fermarlo.
    const remoto = seminaDue('V11');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 5);
    await scollega(variante.id);
    await segnaDisallineata(variante.id, 5, 3);
    negozio.azzeraChiamate();

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(negozio.quantitaMandate).toEqual([]);
    // ⛔ **«Nemmeno zero» nella forma più stretta**: il negozio non porta NESSUN
    //    valore su quella coppia. «Mai toccata» e «messa a zero» sono due cose
    //    diverse, e confonderle nasconderebbe proprio il difetto che 26.8 vieta.
    expect(negozio.quantitaRemota(variante.shopifyInventoryItemId, SEDE_REMOTA)).toBe(3);
    expect(esito.refused).toBe(1);
    expect(esito.republished).toBe(0);
    expect(esito.remaining).toBe(1);
  });

  it('V12 · «Sincronizza con Shopify» SPENTO: il recupero non lo scavalca', async () => {
    const remoto = seminaDue('V12');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 5);
    await prisma.product.update({
      where: { id: prodotto.id },
      data: { shopifySyncEnabled: false },
    });
    await segnaDisallineata(variante.id, 5, 3);
    negozio.azzeraChiamate();

    // Il motivo è l'interruttore, non un requisito qualunque.
    expect(
      await creaPushInventario().ripubblicaDisallineamento(IDS.tenantA, variante.id, IDS.locA1),
    ).toEqual({ pushed: false, reason: 'sync_disabled' });

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(negozio.quantitaMandate).toEqual([]);
    expect(negozio.quantitaRemota(variante.shopifyInventoryItemId, SEDE_REMOTA)).toBe(3);
    expect(esito.republished).toBe(0);
    expect(esito.unchanged).toBe(1);
    expect(esito.remaining).toBe(1);
  });

  it('V13 · GUASTO remoto sulla riga recuperata: nessuna falsa riuscita, problema ancora visibile', async () => {
    const remoto = seminaDue('V13');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 5);
    await segnaDisallineata(variante.id, 5, 3);
    negozio.azzeraChiamate();
    negozio.guastaProssima('setInventoryQuantities', 1);

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    // ⭐ La chiamata è PARTITA — il recupero ha fatto il suo mestiere — ed è il
    //    canale ad averla rifiutata.
    expect(negozio.chiamate.get('setInventoryQuantities') ?? 0).toBe(1);
    // ⛔ E il negozio NON porta il valore: il guasto scatta prima della scrittura.
    expect(negozio.quantitaRemota(variante.shopifyInventoryItemId, SEDE_REMOTA)).toBe(3);
    expect(esito.failed).toBe(1);
    expect(esito.republished).toBe(0);
    // ⛔ Nessun «ultimo invio riuscito» scritto, e il problema resta in coda.
    const stato = await statoSync(variante.id);
    expect(stato.lastPushedAvailable).toBe(5);
    expect(stato.mismatchDetected).toBe(true);
    expect(esito.remaining).toBe(1);
  });

  it('V14 · una SECONDA passata senza nuove divergenze non ripete l invio', async () => {
    const remoto = seminaDue('V14');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 6);
    // ⚠️ **Una riga RECUPERABILE**: il canale è dove l'avevamo lasciato (5), e
    //    l'osservazione che ha acceso il marcatore è vecchia. Questa prova
    //    misura che una ripubblicazione RIUSCITA non si ripete, quindi le serve
    //    una riga che riesca — con una divergenza accertata misurerebbe altro.
    await segnaDisallineata(variante.id, 5, 3, 5);
    negozio.azzeraChiamate();
    const ripubblicazione = creaRipubblicazione();

    const primo = await ripubblicazione.retryPending(IDS.tenantA);
    const secondo = await ripubblicazione.retryPending(IDS.tenantA);

    expect(primo.republished).toBe(1);
    // ⭐ Il push riuscito spegne il marcatore da sé: alla passata dopo la coda è
    //    vuota, e non c'è niente da tentare.
    expect(secondo.pending).toBe(0);
    expect(secondo.attempted).toBe(0);
    expect(secondo.republished).toBe(0);
    expect(negozio.chiamate.get('setInventoryQuantities') ?? 0).toBe(1);
  });

  it('V15 · ⛔ la porta ORDINARIA, sullo stesso stato, NON supera il confronto', async () => {
    // ⭐ **È il vincolo del mandato**: superare il confronto con l'ultimo inviato
    //    soltanto nel percorso interno di recupero. Senza questa prova, spostare
    //    il sorpasso dentro il push ordinario — e quindi dentro documenti,
    //    movimenti, riconciliazione e porta unica dei canali — non farebbe
    //    arrossare niente.
    const remoto = seminaDue('V15');
    const prodotto = await importaEProduci(remoto.id);
    const variante = prodotto.variants[0]!;
    await giacenza(variante.id, 5);
    // ⚠️ **Il canale porta il confermato (5), l'osservazione è vecchia (3).**
    //    Serve una riga su cui il recupero RIESCA: l'asimmetria da misurare è
    //    fra le due porte, e con una riga che il canale rifiuta le due porte
    //    non manderebbero nulla né l'una né l'altra — la prova resterebbe verde
    //    dicendo il contrario di quello che afferma.
    await segnaDisallineata(variante.id, 5, 3, 5);
    negozio.azzeraChiamate();

    const ordinario = await creaPushInventario().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(ordinario).toEqual({ pushed: false, reason: 'unchanged', publishableAvailable: 5 });
    // ⛔ La porta ordinaria non ha nemmeno bussato.
    expect(negozio.totaleChiamate()).toBe(0);
    expect(negozio.quantitaMandate).toEqual([]);

    // ⭐ E il controllo inverso, sullo stesso identico stato: la porta di
    //    recupero manda. Senza, questa prova passerebbe anche se non partisse
    //    più niente da nessuna delle due.
    const recupero = await creaPushInventario().ripubblicaDisallineamento(
      IDS.tenantA,
      variante.id,
      IDS.locA1,
    );
    expect(recupero).toEqual({ pushed: true, publishableAvailable: 5 });
    expect(negozio.quantitaMandate).toEqual([
      {
        inventoryItemId: variante.shopifyInventoryItemId,
        locationId: SEDE_REMOTA,
        available: 5,
      },
    ]);
  });

  it('V16 · in un LOTTO, la divergenza accertata è distinta dal collegamento escluso e dal guasto', async () => {
    // ⭐ **`refused` ha due origini, e il comando le somma senza confonderle
    //    con i guasti.** Lo storico che vieta il collegamento e il canale che
    //    rifiuta la scrittura hanno cause diverse e lo stesso rimedio:
    //    ritentare non li risolve. Il guasto di trasporto invece sì, e resta
    //    in `failed`.
    //
    // ⛔ **Il segno che le distingue sta nella riga**, non nel conteggio: la
    //    divergenza lascia una NOTA che dice cosa il canale ha risposto; il
    //    collegamento escluso non arriva nemmeno a bussare.
    const remoto = seminaDue('V16');
    const prodotto = await importaEProduci(remoto.id);
    const divergente = prodotto.variants[0]!;
    const esclusa = prodotto.variants[1]!;

    await giacenza(divergente.id, 12);
    await giacenza(esclusa.id, 4);
    // Confermato 10, ma il canale porta 8: la scrittura partirà e sarà rifiutata.
    await segnaDisallineata(divergente.id, 10, 7, 8);
    await segnaDisallineata(esclusa.id, 99, 1);
    await scollega(esclusa.id);
    negozio.azzeraChiamate();

    const esito = await creaRipubblicazione().retryPending(IDS.tenantA);

    expect(esito.attempted).toBe(2);
    expect(esito.refused).toBe(2);
    expect(esito.failed).toBe(0);
    expect(esito.republished).toBe(0);
    // ⭐ Una sola chiamata al canale: la riga esclusa si ferma prima.
    expect(negozio.chiamate.get('setInventoryQuantities')).toBe(1);
    expect(negozio.quantitaMandate).toEqual([]);
    expect(negozio.quantitaRemota(divergente.shopifyInventoryItemId, SEDE_REMOTA)).toBe(8);

    // ⭐ E le due righe si distinguono guardandole.
    const rigaDivergente = await statoSync(divergente.id);
    expect(rigaDivergente.mismatchNote).toMatch(/Divergenza accertata/);
    expect(rigaDivergente.lastPushedAvailable).toBe(10);
    const rigaEsclusa = await statoSync(esclusa.id);
    expect(rigaEsclusa.mismatchNote).toBe('costruito dalla prova');
    expect(rigaEsclusa.lastPushedAvailable).toBe(99);

    // ⭐ Entrambe restano da risolvere, e il comando lo dichiara.
    expect(esito.remaining).toBe(2);
  });

  // ── 2 · l'IMPORT del catalogo ────────────────────────────────────────────

  it('V5 · tutti FALLITI: la connessione non riceve il timbro di sincronizzazione riuscita', async () => {
    // ⛔ Il timbro azzera anche gli errori della connessione: darlo dopo un
    //    lotto in cui non è entrato niente racconta una sincronizzazione che
    //    non c'è stata.
    seminaDue('V5');
    await prisma.shopifyConnection.update({
      where: { tenantId: IDS.tenantA },
      data: {
        lastSyncAt: null,
        lastErrorMessage: 'errore precedente da conservare',
        lastErrorCode: 'PRECEDENTE',
        lastErrorAt: new Date(),
      },
    });
    // Ogni prodotto fallisce: l'arricchimento cade prima della creazione locale.
    const importFallato = new ShopifyProductPullService(
      prisma as never,
      negozio.oauth() as never,
      { requestedScopes: ['read_products', 'write_products'] } as never,
      negozio.admin() as never,
      connessioneVera as never,
      { enrichProduct: vi.fn().mockRejectedValue(new Error('canale non raggiungibile')) } as never,
      storico,
      registro,
    );

    const esito = await importFallato.pullCatalog(IDS.tenantA);

    expect(esito.imported).toBe(0);
    expect(esito.updated).toBe(0);
    expect(esito.failed).toHaveLength(1);
    // ⛔ Nessun timbro, e l'errore precedente NON è stato cancellato.
    const connessione = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    expect(connessione.lastSyncAt).toBeNull();
    expect(connessione.lastErrorMessage).toBe('errore precedente da conservare');
  });

  it('V6 · lotto PARZIALE: il timbro c è, perché qualcosa è davvero entrato', async () => {
    // ⚠️ Un fallimento per prodotto non dice che la connessione sia rotta: se
    //    anche un solo articolo è entrato, la sincronizzazione è avvenuta.
    seminaDue('V6-a');
    seminaDue('V6-b');
    let chiamate = 0;
    const importParziale = new ShopifyProductPullService(
      prisma as never,
      negozio.oauth() as never,
      { requestedScopes: ['read_products', 'write_products'] } as never,
      negozio.admin() as never,
      connessioneVera as never,
      {
        enrichProduct: vi.fn(async (...argomenti: unknown[]) => {
          chiamate += 1;
          if (chiamate === 1) {
            throw new Error('il primo cade');
          }
          return negozio.enrichment().enrichProduct(...(argomenti as [never, never, never]));
        }),
      } as never,
      storico,
      registro,
    );

    const esito = await importParziale.pullCatalog(IDS.tenantA);

    expect(esito.failed).toHaveLength(1);
    expect(esito.imported).toBe(1);
    const connessione = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { tenantId: IDS.tenantA },
    });
    expect(connessione.lastSyncAt).not.toBeNull();
  });

  it('V7 · lotto di soli SALTATI: il conteggio lo dice, e il timbro resta', async () => {
    // Un prodotto già eliminato definitivamente: l'import lo rifiuta per regola.
    const remoto = seminaDue('V7');
    const prodotto = await importaEProduci(remoto.id);
    await prisma.$transaction(async (tx) => {
      await storico.sganciaProdotto(tx, { tenantId: IDS.tenantA, productId: prodotto.id });
      await tx.inventoryLevel.deleteMany({ where: { variant: { productId: prodotto.id } } });
      await tx.productVariant.deleteMany({ where: { productId: prodotto.id } });
      await tx.product.delete({ where: { id: prodotto.id } });
    });

    const esito = await creaImport().pullCatalog(IDS.tenantA);

    // ⭐ Nessun errore, nessun nuovo: è un lotto di soli saltati, e il numero c'è.
    expect(esito.failed).toEqual([]);
    expect(esito.imported).toBe(0);
    expect(esito.updated).toBe(0);
    expect(esito.skipped).toBe(1);
  });
});
