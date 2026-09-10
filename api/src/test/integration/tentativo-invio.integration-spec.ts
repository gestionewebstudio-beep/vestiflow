import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlatformAuditService } from '../../common/audit/platform-audit.service';
import { ShopifyInventoryPushService } from '../../shopify/shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from '../../shopify/shopify-inventory-reconciliation.service';
import {
  CODICE_CONCORRENZA,
  CODICE_CONFRONTO_MANCANTE,
  CODICE_PARAMETRI_INCOERENTI,
  MESSAGGIO_CONFRONTO_FALLITO,
} from '../../shopify/shopify-inventory-user-error.util';
import { ShopifyLinkHistoryService } from '../../shopify/shopify-link-history.service';
import { ShopifyProductPullService } from '../../shopify/shopify-product-pull.service';
import { ambienteIntegrazione } from './env';
import { creaDataset, IDS, svuota } from './fixture';
import { creaClientIntegrazione } from './prisma';
import { NegozioSimulato } from './shopify-simulato.util';

/**
 * **Il TENTATIVO di invio: persistente, ripetibile, e distinto dalla conferma.**
 *
 * ⛔ **Prenotazione e conferma sono due colonne diverse perché sono due fatti
 *    diversi.** L'ultimo confermato non avanza finché il canale non ha risposto:
 *    usarlo come lucchetto segnerebbe come trasmesso ciò che non è mai partito.
 *
 * ⭐ **Ogni prova riparte da un servizio NUOVO** dove serve dimostrare la
 *    ripartenza: niente sopravvive in memoria, e ciò che permette il recupero è
 *    solo quello che sta sulla riga.
 *
 * ⚠️ **Perimetro**: qui non si separa l'origine degli effetti e non si converte
 *    niente a delta. `P2`, `P3`, `P4` e il limite di `P6` restano aperti.
 */
describe('Tentativo di invio inventario — conservazione e recupero', () => {
  let prisma: PrismaClient;
  let negozio: NegozioSimulato;
  let storico: ShopifyLinkHistoryService;
  let registro: PlatformAuditService;
  let shopId: string;

  const DOMINIO = 'tentativo.myshopify.com';
  const SEDE_REMOTA = '66001';

  beforeAll(() => {
    ambienteIntegrazione();
    prisma = creaClientIntegrazione();
    storico = new ShopifyLinkHistoryService();
    registro = new PlatformAuditService(prisma as never, prisma as never);
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
    await tenta('stati sync', () => prisma.shopifyInventorySyncState.deleteMany({}));
    await tenta('svuota', () => svuota(prisma));
    await tenta('disconnessione', () => prisma.$disconnect());
    if (guasti.length > 0) {
      throw new Error(`Pulizia di tentativo-invio fallita — ${guasti.join(' | ')}`);
    }
  });

  beforeEach(async () => {
    await svuota(prisma);
    await creaDataset(prisma);
    await prisma.shopifyInventorySyncState.deleteMany({});
    await prisma.platformAuditLog.deleteMany({});
    semi = 0;
    negozio = new NegozioSimulato(DOMINIO, 996000);
    const riga = await prisma.shopifyShop.create({
      data: { tenantId: IDS.tenantA, shopGid: 'gid://shopify/Shop/996001' },
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
   * ⭐ **Un ESECUTORE nuovo**, con le sue dipendenze: è il modo di dimostrare
   *    che il recupero non si appoggia a niente rimasto in memoria.
   */
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

  async function importaVariante(nome: string) {
    semi += 1;
    const base = `66030000000${String(semi).padStart(2, '0')}`;
    const remoto = negozio.semina({
      title: nome,
      vendor: 'F',
      product_type: 'T',
      tags: 'collaudo',
      opzioni: [{ name: 'Taglia', values: ['M'] }],
      varianti: [{ sku: `${nome}-M`, barcode: `${base}1`, price: '10.00', valori: ['M'] }],
    });
    await creaImport().importProductFromWebhook(IDS.tenantA, negozio.webhook(remoto.id) as never);
    const prodotto = await prisma.product.findFirstOrThrow({
      where: { tenantId: IDS.tenantA, shopifyProductId: String(remoto.id) },
      include: { variants: true },
    });
    return prodotto.variants[0]!;
  }

  async function giacenza(variantId: string, disponibile: number): Promise<void> {
    await prisma.inventoryLevel.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        onHand: disponibile,
        committed: 0,
        available: disponibile,
      },
    });
  }

  async function cambiaDisponibile(variantId: string, disponibile: number): Promise<void> {
    await prisma.inventoryLevel.update({
      where: { variantId_locationId: { variantId, locationId: IDS.locA1 } },
      data: { onHand: disponibile, available: disponibile },
    });
  }

  async function confermato(variantId: string, valore: number): Promise<void> {
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId,
        locationId: IDS.locA1,
        lastPushedAvailable: valore,
        lastPushedAt: new Date(Date.now() - 3_600_000),
      },
    });
  }

  function stato(variantId: string) {
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

  // ── B · le tre correzioni del 09/09/2026 ─────────────────────────────────

  it('B1 · ⛔ l ultimo OSSERVATO non è una base: nessuna scrittura 8 → 9', async () => {
    // ⭐ **La prova della correzione più importante.** Il negozio è a 8 per due
    //    ordini; VestiFlow ne ha acquisito uno e crede 9. Una notifica di
    //    inventario con 8 arriva DOPO l'ultima conferma. Se l'osservato facesse
    //    da base, il confronto troverebbe quello che si aspetta e la scrittura
    //    passerebbe, rimettendo in vendita un pezzo venduto.
    const variante = await importaVariante('B1');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 9);
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId: variante.id,
        locationId: IDS.locA1,
        lastPushedAvailable: 10,
        lastPushedAt: new Date(Date.now() - 3_600_000),
        // L'osservazione è PIÙ RECENTE della conferma, ed è la trappola.
        lastObservedShopifyAvailable: 8,
        lastObservedAt: new Date(),
      },
    });
    negozio.azzeraChiamate();

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⛔ La scrittura è stata tentata col confronto contro la CONVINZIONE (10),
    //    e il canale l'ha rifiutata perché è a 8.
    expect(esito.pushed).toBe(false);
    // ⭐ E soprattutto: il negozio è ancora a 8. Il pezzo venduto non è tornato.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    expect((await stato(variante.id)).lastPushedAvailable).toBe(10);
  });

  it('B2 · il tentativo aperto NON viene saltato come «invariata»', async () => {
    // Confermato 10, inviato 9 con risposta persa, poi una modifica locale che
    // riporta il Disponibile a 10: il valore da mandare coincide con l'ultimo
    // confermato, e la scorciatoia risponderebbe «invariata» lasciando il
    // tentativo aperto per sempre — mentre il canale è a 9.
    const variante = await importaVariante('B2');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 9);
    await confermato(variante.id, 10);
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);

    // La modifica locale riporta il Disponibile a 10.
    await cambiaDisponibile(variante.id, 10);

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⛔ NON è «invariata»: il tentativo è stato risolto per primo.
    expect(esito.reason).not.toBe('unchanged');
    const riga = await stato(variante.id);
    expect(riga.pendingKey).toBeNull();
    // ⭐ Il confermato è allineato a ciò che il canale porta davvero.
    expect(riga.lastPushedAvailable).toBe(10);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(10);
  });

  it('B3 · una conferma TARDIVA di A non cancella il tentativo B né arretra il confermato', async () => {
    // ⭐ L'incrocio è deterministico: si costruisce lo stato in cui A ha finito
    //    tardi e B è già aperto, e si chiede al servizio di confermare A.
    const variante = await importaVariante('B3');
    await giacenza(variante.id, 12);
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId: variante.id,
        locationId: IDS.locA1,
        lastPushedAvailable: 11,
        lastPushedAt: new Date(),
        // Il tentativo APERTO è B: quello di A è già stato chiuso.
        pendingKey: 'B-aperto',
        pendingAvailable: 12,
        pendingBase: 11,
        pendingShopDomain: DOMINIO,
        pendingItemId: variante.shopifyInventoryItemId,
        pendingLocationRef: SEDE_REMOTA,
        pendingAt: new Date(),
      },
    });

    // La conferma tardiva di A, con la SUA chiave e il SUO valore.
    const confermaA = await (
      nuovoEsecutore() as unknown as {
        confermaTentativo: (
          t: string,
          v: string,
          l: string,
          valore: number,
          chiave: string,
        ) => Promise<boolean>;
      }
    ).confermaTentativo(IDS.tenantA, variante.id, IDS.locA1, 9, 'A-gia-chiuso');

    expect(confermaA).toBe(false);
    const riga = await stato(variante.id);
    // ⛔ B è ancora aperto…
    expect(riga.pendingKey).toBe('B-aperto');
    expect(riga.pendingAvailable).toBe(12);
    // …e il confermato NON è arretrato al valore di A.
    expect(riga.lastPushedAvailable).toBe(11);
  });

  // ── B4 · la destinazione memorizzata ─────────────────────────────────────

  it('B4 · destinazione CAMBIATA: il tentativo non si ripete e non si perde', async () => {
    const variante = await importaVariante('B4');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 9);
    await confermato(variante.id, 10);
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    const chiave = (await stato(variante.id)).pendingKey;
    expect(chiave).not.toBeNull();

    // Nel frattempo la variante viene riagganciata a un ALTRO articolo remoto.
    await prisma.productVariant.update({
      where: { id: variante.id },
      data: { shopifyInventoryItemId: '996999' },
    });
    negozio.impostaQuantitaRemota('996999', SEDE_REMOTA, 50);
    const chiamatePrima = negozio.chiamate.get('setInventoryQuantities') ?? 0;

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⛔ Nessuna scrittura: né sulla destinazione vecchia né sulla nuova.
    expect(esito.reason).toBe('tentativo_incerto');
    expect(negozio.chiamate.get('setInventoryQuantities') ?? 0).toBe(chiamatePrima);
    expect(negozio.quantitaRemota('996999', SEDE_REMOTA)).toBe(50);
    // ⭐ E il tentativo NON si perde: resta con i suoi parametri originali.
    const riga = await stato(variante.id);
    expect(riga.pendingKey).toBe(chiave);
    expect(riga.pendingItemId).toBe(item);
    expect(riga.lastPushedAvailable).toBe(10);
  });

  it('B5 · collegamento CHIUSO nel frattempo: il recupero non lo scavalca', async () => {
    const variante = await importaVariante('B5');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 9);
    await confermato(variante.id, 10);
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect((await stato(variante.id)).pendingKey).not.toBeNull();

    // Il collegamento di storico viene chiuso.
    await prisma.$executeRawUnsafe(
      `UPDATE shopify_variant_links l
          SET status = 'unlinked', close_reason = 'operator',
              closed_at = GREATEST(now(), linked_at), updated_at = now()
         FROM shopify_variant_identities i
        WHERE l.identity_id = i.id AND i.variant_id = $1::uuid AND l.status = 'active'`,
      variante.id,
    );
    const chiamatePrima = negozio.chiamate.get('setInventoryQuantities') ?? 0;

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⛔ La guardia 26.8 ferma tutto PRIMA che il tentativo venga ripetuto.
    expect(esito.reason).toBe('collegamento_escluso');
    expect(negozio.chiamate.get('setInventoryQuantities') ?? 0).toBe(chiamatePrima);
    // ⭐ E il tentativo resta lì: non è stato né ripetuto né perso.
    expect((await stato(variante.id)).pendingKey).not.toBeNull();
  });

  // ── B6 · il primo invio ──────────────────────────────────────────────────

  it('B6 · senza una base CONFERMATA non si invia, e l esito lo dice', async () => {
    const variante = await importaVariante('B6');
    const item = variante.shopifyInventoryItemId!;
    await giacenza(variante.id, 7);
    negozio.azzeraChiamate();

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({ pushed: false, reason: 'base_assente', publishableAvailable: 7 });
    // ⛔ Nessuna scrittura, e nessun ripiego: non zero, non l'ultimo osservato,
    //    non un invio senza confronto.
    expect(negozio.totaleChiamate()).toBe(0);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBeNull();
    // ⚠️ E niente è cambiato in locale: il Disponibile è quello di prima.
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    expect(livello.available).toBe(7);
  });

  // ── C · il CONTRATTO del canale e la POLITICA di VestiFlow ───────────────
  //
  // ⭐ **Sono due cose diverse, e si provano separatamente.** Shopify ammette
  //    `null` esplicito per disattivare il confronto: è il suo contratto, e il
  //    simulatore lo deve rappresentare fedelmente. Che questo percorso non
  //    debba MAI usarlo è una regola di VestiFlow, e la deve far rispettare il
  //    **servizio**.
  //
  // ⛔ **Confonderle è l'errore che era stato fatto**: un simulatore che
  //    rifiuta `null` fa passare per verde una politica che nessuno ha scritto.
  //    Il giorno in cui il canale cambia, o in cui qualcuno chiama la mutation
  //    da un'altra porta, il divieto non c'è — e nessuna prova lo dice.

  it('C1 · CONTRATTO: Shopify ammette null esplicito, e disattiva il confronto', async () => {
    const variante = await importaVariante('C1');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);

    const esito = await negozio.graphql().setInventoryQuantities(DOMINIO, 'token', {
      idempotencyKey: 'contratto-null',
      quantities: [
        {
          inventoryItemId: item,
          locationId: SEDE_REMOTA,
          quantity: 3,
          // ⭐ `null` ESPLICITO: scrivi senza confrontare.
          changeFromQuantity: null,
        },
      ],
    });

    // ⛔ Nessun `userError`, benché 3 ≠ 8: il confronto è stato DISATTIVATO,
    //    non fallito. È ciò che l'API concede, e va rappresentato com'è.
    expect(esito).toEqual([]);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(3);
  });

  it('C2 · CONTRATTO: il campo OMESSO è un errore, non un invio senza confronto', async () => {
    const variante = await importaVariante('C2');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);

    await expect(
      negozio.graphql().setInventoryQuantities(DOMINIO, 'token', {
        idempotencyKey: 'contratto-omesso',
        // ⚠️ Il tipo del client VERO dichiara `changeFromQuantity`
        //    OBBLIGATORIO (`number | null`), quindi ometterlo là non compila
        //    nemmeno. Nel doppio resta facoltativo apposta: è l'unico modo di
        //    provare che l'omissione è un rifiuto del canale e non una
        //    scrittura silenziosa.
        quantities: [{ inventoryItemId: item, locationId: SEDE_REMOTA, quantity: 3 }],
      }),
    ).rejects.toThrow(/changeFromQuantity/);

    // ⛔ E il negozio non è cambiato: il campo omesso non ha scritto niente.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
  });

  it('C3 · POLITICA: questo percorso manda sempre un NUMERO — mai null, mai omesso', async () => {
    // ⚠️ **Lo stesso oggetto GraphQL per i due giri**: `negozio.graphql()` ne
    //    costruisce uno nuovo a ogni chiamata, e con due oggetti le chiamate
    //    registrate sarebbero su spie diverse.
    const gql = negozio.graphql();
    const variante = await importaVariante('C3');
    const item = variante.shopifyInventoryItemId!;
    await giacenza(variante.id, 7);
    negozio.azzeraChiamate();

    // 1 · Senza base confermata non si invia. ⛔ E non «si invia senza
    //     confronto»: proprio non si chiama.
    const senzaBase = await nuovoEsecutore(gql).pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(senzaBase.reason).toBe('base_assente');
    expect(gql.setInventoryQuantities.mock.calls).toHaveLength(0);

    // 2 · Con una base confermata l'invio parte, e porta quella base.
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 5);
    await confermato(variante.id, 5);

    const conBase = await nuovoEsecutore(gql).pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(conBase.pushed).toBe(true);
    expect(gql.setInventoryQuantities.mock.calls).toHaveLength(1);
    const righe = gql.setInventoryQuantities.mock.calls[0]![2].quantities;
    expect(righe).toHaveLength(1);
    for (const riga of righe) {
      // ⛔ Il campo c'è (non omesso) ED è un numero (non `null`): è l'ultimo
      //    valore CONFERMATO, non una disattivazione del confronto.
      expect(Object.prototype.hasOwnProperty.call(riga, 'changeFromQuantity')).toBe(true);
      expect(riga.changeFromQuantity).toBe(5);
    }
  });

  // ── D · gli ESITI SEPARATI ───────────────────────────────────────────────
  //
  // ⛔ **Una divergenza accertata non è un guasto temporaneo.** Il canale ha
  //    risposto: ha confrontato la base e ha detto no. Insistere con la stessa
  //    operazione produce lo stesso no — quindi il tentativo si chiude, il
  //    confermato non avanza, e il lavoro non risolto resta visibile.

  it('D1 · RIFIUTO del canale: il confermato non avanza e il problema resta visibile', async () => {
    const variante = await importaVariante('D1');
    const item = variante.shopifyInventoryItemId!;
    // Il canale è a 8; VestiFlow ha confermato 10 e vorrebbe mandare 12.
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({
      pushed: false,
      reason: 'divergenza_accertata',
      publishableAvailable: 12,
    });
    // ⛔ Il negozio non è cambiato: il rifiuto è un NON APPLICATO, non un dubbio.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);

    const riga = await stato(variante.id);
    // ⛔ Il confermato non avanza a 12 — e non ripiega su 8, che è ciò che il
    //    canale MOSTRA: un'osservazione non è una base.
    expect(riga.lastPushedAvailable).toBe(10);
    // ⭐ Il tentativo è CHIUSO: l'esito è definito.
    expect(riga.pendingKey).toBeNull();
    expect(riga.pendingAvailable).toBeNull();
    expect(riga.pendingBase).toBeNull();
    // ⭐ E il lavoro non risolto resta VISIBILE, con la sua causa.
    expect(riga.mismatchDetected).toBe(true);
    expect(riga.mismatchNote).toMatch(/Divergenza accertata/);
    expect(riga.mismatchNote).toMatch(/riconciliazione/);
  });

  it('D2 · un RIFIUTO chiude il tentativo, un GUASTO lo lascia aperto', async () => {
    // ⭐ **Stesso punto di partenza, due esiti diversi**: la differenza non sta
    //    nel valore, sta in che cosa si SA dell'esito.
    const rifiutata = await importaVariante('D2r');
    const itemR = rifiutata.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(itemR, SEDE_REMOTA, 8);
    await giacenza(rifiutata.id, 12);
    await confermato(rifiutata.id, 10);

    const guasta = await importaVariante('D2g');
    const itemG = guasta.shopifyInventoryItemId!;
    // Qui il confronto passerebbe: a impedirlo è il trasporto, non il canale.
    negozio.impostaQuantitaRemota(itemG, SEDE_REMOTA, 10);
    await giacenza(guasta.id, 12);
    await confermato(guasta.id, 10);

    const esitoR = await nuovoEsecutore().pushLevel(IDS.tenantA, rifiutata.id, IDS.locA1);
    negozio.guastaProssima('setInventoryQuantities', 1);
    const esitoG = await nuovoEsecutore().pushLevel(IDS.tenantA, guasta.id, IDS.locA1);

    expect(esitoR.reason).toBe('divergenza_accertata');
    expect(esitoG.reason).toBe('shopify_error');

    // ⭐ **La differenza è tutta qui.** Il rifiuto ha un esito noto: il
    //    tentativo si chiude. Il guasto no: resta aperto, e sarà ripetuto con
    //    la stessa chiave — che è la sola cosa che impedisce di applicarlo due
    //    volte se invece era passato.
    expect((await stato(rifiutata.id)).pendingKey).toBeNull();
    expect((await stato(guasta.id)).pendingKey).not.toBeNull();
    // ⛔ E in nessuno dei due il confermato è avanzato.
    expect((await stato(rifiutata.id)).lastPushedAvailable).toBe(10);
    expect((await stato(guasta.id)).lastPushedAvailable).toBe(10);
  });

  it('D3 · insistere non risolve: il secondo giro raccoglie lo stesso rifiuto, e non avanza nulla', async () => {
    // ⏸ **La prova del LIMITE dichiarato.** Finché la riconciliazione non
    //    esiste, una ripubblicazione successiva ripresenta la stessa operazione
    //    e il canale la rifiuta di nuovo. Va provato che ciò che NON accade è
    //    l'unica cosa pericolosa: il confermato non avanza e il negozio non
    //    cambia. Il rimedio è stabilire quale quantità sia corretta, e non è
    //    questo percorso.
    const variante = await importaVariante('D3');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);

    const primo = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    const secondo = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(primo.reason).toBe('divergenza_accertata');
    expect(secondo.reason).toBe('divergenza_accertata');
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    const riga = await stato(variante.id);
    expect(riga.lastPushedAvailable).toBe(10);
    expect(riga.pendingKey).toBeNull();
  });

  // ── E · NON tutti gli userErrors sono rifiuti definitivi ─────────────────
  //
  // ⛔ **Il difetto che questo blocco chiude**: `errori.length > 0` leggeva
  //    ogni `userError` come una divergenza accertata. Ma il canale usa lo
  //    stesso canale di risposta per cose che non c'entrano niente fra loro —
  //    e una di quelle significa «l'operazione è ANCORA IN CORSO».

  it('E1 · CONCORRENZA: la chiave in corso non si cancella, e non si apre un invio nuovo', async () => {
    // ⭐ **La prova di accettazione principale.** A è partito e non ha
    //    risposto; B ripete la stessa chiave e Shopify dice «quella chiave è in
    //    corso»; il tentativo deve restare esattamente dov'è. Poi A conclude:
    //    un solo effetto, e la conferma è quella giusta.
    const variante = await importaVariante('E1');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();

    // 1 · A parte, l'effetto è applicato, la risposta si perde: esito ignoto.
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    const a = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(a.reason).toBe('shopify_error');
    const chiave = (await stato(variante.id)).pendingKey;
    expect(chiave).not.toBeNull();

    // 2 · B ripete la stessa chiave e Shopify risponde «è in corso».
    negozio.rispondiConUserError(CODICE_CONCORRENZA, 'operazione ancora in corso');
    const b = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⛔ **Nessuna delle tre cose vietate.** Non si cancella il tentativo, non
    //    si cambia la chiave, non si apre un invio indipendente.
    expect(b).toEqual({
      pushed: false,
      reason: 'tentativo_in_corso',
      publishableAvailable: 12,
    });
    const dopoB = await stato(variante.id);
    expect(dopoB.pendingKey).toBe(chiave);
    expect(dopoB.pendingAvailable).toBe(12);
    expect(dopoB.pendingBase).toBe(10);
    expect(dopoB.lastPushedAvailable).toBe(10);
    // ⭐ **Una chiave sola in tutto**: nessuna operazione nuova e indipendente.
    expect(new Set(negozio.chiaviViste).size).toBe(1);

    // 3 · A conclude: la ripetizione trova la chiave già applicata.
    const c = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(c.pushed).toBe(false);
    expect(c.reason).toBe('unchanged');
    const finale = await stato(variante.id);
    expect(finale.lastPushedAvailable).toBe(12);
    expect(finale.pendingKey).toBeNull();
    // ⭐ **Un solo effetto sul canale**, dall'invio di A: le due ripetizioni non
    //    hanno riscritto niente.
    expect(negozio.quantitaMandate).toHaveLength(1);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(12);
  });

  it('E2 · VALIDAZIONE: non si presenta come una divergenza delle quantità', async () => {
    // ⛔ **Due problemi opposti, e confonderli manda a cercare dalla parte
    //    sbagliata.** «La quantità là non è quella che credevi» chiede di
    //    riconciliare; «questa sede non esiste» chiede di riguardare il
    //    collegamento. Sotto un'unica etichetta, il secondo si legge come il
    //    primo e nessuno va a controllare la mappatura.
    const variante = await importaVariante('E2');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    // ⚠️ **Il codice DOCUMENTATO è `INVALID_LOCATION`.** Qui c'era
    //    `INVALID_LOCATION_ID`, che avevo inventato: coi frammenti passava lo
    //    stesso — conteneva «INVALID» — e la prova restava verde su un nome che
    //    Shopify non manda. Con la mappa esplicita un nome sbagliato cade in
    //    `sconosciuto`, e la prova lo dice invece di coprirlo.
    negozio.rispondiConUserError('INVALID_LOCATION', 'The specified location could not be found.');

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.pushed).toBe(false);
    expect(esito.reason).toBe('richiesta_rifiutata');
    expect(esito.reason).not.toBe('divergenza_accertata');

    const riga = await stato(variante.id);
    // ⭐ Il tentativo si chiude — la scrittura non è avvenuta e ripeterla
    //    identica non cambierebbe niente — ma il confermato non avanza.
    expect(riga.pendingKey).toBeNull();
    expect(riga.lastPushedAvailable).toBe(10);
    expect(riga.mismatchDetected).toBe(true);
    // ⛔ E la nota NON dice che le quantità divergono: dice che la richiesta è
    //    stata rifiutata, e riporta il codice.
    expect(riga.mismatchNote).toMatch(/Richiesta rifiutata/);
    expect(riga.mismatchNote).not.toMatch(/Divergenza accertata/);
    expect(riga.mismatchNote).toMatch(/INVALID_LOCATION/);
  });

  it('E3 · CONFRONTO: il rifiuto vero non tocca il remoto né il confermato', async () => {
    // ⭐ La controprova di `E2`: qui la divergenza c'è davvero, e si dichiara
    //    per quello che è — con il messaggio reale del canale.
    const variante = await importaVariante('E3');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 8);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.reason).toBe('divergenza_accertata');
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    const riga = await stato(variante.id);
    expect(riga.lastPushedAvailable).toBe(10);
    expect(riga.mismatchDetected).toBe(true);
    expect(riga.mismatchNote).toMatch(/Divergenza accertata/);
  });

  it('E4 · SCONOSCIUTO: un codice mai visto non diventa una divergenza inventata', async () => {
    // ⛔ **La classe sicura.** L'enum dei codici non è stato introspezionato:
    //    se il resto cadesse in «rifiuto definitivo», ogni codice non previsto
    //    produrrebbe una divergenza con la sua nota e il tentativo chiuso —
    //    cioè un fatto inventato. Non sapere che cosa è successo è un esito, e
    //    si dichiara conservando il tentativo.
    const variante = await importaVariante('E4');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    negozio.rispondiConUserError('QUALCOSA_DI_NUOVO', 'boh');

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.reason).toBe('shopify_error');
    const riga = await stato(variante.id);
    expect(riga.pendingKey).not.toBeNull();
    expect(riga.lastPushedAvailable).toBe(10);
    expect(riga.mismatchNote).toBeNull();
  });

  it('E4-bis · un codice sconosciuto che CONTIENE «STALE» non chiude il tentativo', async () => {
    // ⛔ **Il difetto del riconoscimento per frammenti, misurato dove si vede.**
    //    Finché la classe si deduceva dal nome, un codice mai visto che
    //    contenesse `STALE` veniva promosso a divergenza di quantità: nota,
    //    marcatore e tentativo chiuso, per un fatto inventato.
    const variante = await importaVariante('E4bis');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    negozio.rispondiConUserError('FUTURE_QUANTITY_STALE_THING', MESSAGGIO_CONFRONTO_FALLITO);

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.reason).toBe('shopify_error');
    const riga = await stato(variante.id);
    expect(riga.pendingKey).not.toBeNull();
    expect(riga.lastPushedAvailable).toBe(10);
    // ⛔ Nessuna nota: non si scrive un fatto che non si conosce.
    expect(riga.mismatchNote).toBeNull();
  });

  it('E7 · CONFRONTO MANCANTE: non si presenta come differenza di giacenza', async () => {
    // ⛔ `COMPARE_QUANTITY_REQUIRED` contiene «COMPARE», e coi frammenti
    //    diventava una divergenza di quantità. Manca un PARAMETRO: mandare a
    //    riconciliare le giacenze significherebbe far cercare una differenza
    //    che nessuno ha ancora misurato.
    const variante = await importaVariante('E7');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    negozio.rispondiConUserError(
      CODICE_CONFRONTO_MANCANTE,
      'The compareQuantity argument must be given to each quantity',
    );

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.reason).toBe('richiesta_rifiutata');
    expect(esito.reason).not.toBe('divergenza_accertata');
    const riga = await stato(variante.id);
    expect(riga.mismatchNote).toMatch(/Richiesta rifiutata/);
    expect(riga.mismatchNote).not.toMatch(/Divergenza accertata/);
    expect(riga.lastPushedAvailable).toBe(10);
  });

  it('E8 · PARAMETRI INCOERENTI sulla stessa chiave: il tentativo originale NON si cancella', async () => {
    // ⛔ `IDEMPOTENCY_KEY_PARAMETER_MISMATCH` dice che i parametri non
    //    corrispondono alla chiave — **non** che l'operazione di allora non sia
    //    stata applicata. Coi frammenti conteneva «MISMATCH», cadeva in
    //    validazione e buttava via proprio l'operazione che la chiave protegge.
    const variante = await importaVariante('E8');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();

    // Un tentativo aperto e non concluso.
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    const primo = await stato(variante.id);
    expect(primo.pendingKey).not.toBeNull();

    // La ripetizione riceve «stessa chiave, parametri diversi».
    negozio.rispondiConUserError(
      CODICE_PARAMETRI_INCOERENTI,
      'The same idempotency key cannot be used with different operation parameters.',
    );
    const chiamatePrima = negozio.chiamate.get('setInventoryQuantities') ?? 0;

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito.reason).toBe('tentativo_incerto');
    const dopo = await stato(variante.id);
    // ⭐ **Chiave e parametri INTATTI**: l'operazione originale non si dimentica.
    expect(dopo.pendingKey).toBe(primo.pendingKey);
    expect(dopo.pendingAvailable).toBe(primo.pendingAvailable);
    expect(dopo.pendingBase).toBe(primo.pendingBase);
    expect(dopo.lastPushedAvailable).toBe(10);
    expect(dopo.mismatchNote).toBeNull();
    // ⛔ **E nessuna operazione nuova generata di iniziativa**: una sola chiave
    //    in tutto, e nessuna chiamata in più dopo quella rifiutata.
    expect(new Set(negozio.chiaviViste).size).toBe(1);
    expect(negozio.chiamate.get('setInventoryQuantities')).toBe(chiamatePrima + 1);
  });

  it('E5 · PAYLOAD MANCANTE: nessuna falsa riuscita, tentativo conservato', async () => {
    // ⛔ Il client restituiva un elenco vuoto per una mutation assente, e
    //    l'elenco vuoto è la firma della riuscita: il confermato avanzava e il
    //    tentativo si chiudeva per una risposta che non c'era.
    const variante = await importaVariante('E5');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 12);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    negozio.rispostaSenzaCorpo();

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({ pushed: false, reason: 'shopify_error' });
    const riga = await stato(variante.id);
    // ⛔ Il confermato NON è avanzato a 12…
    expect(riga.lastPushedAvailable).toBe(10);
    // ⭐ …e il tentativo è ancora lì, con la sua chiave.
    expect(riga.pendingKey).not.toBeNull();
    expect(riga.pendingAvailable).toBe(12);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(10);
  });

  it('E6 · BASE ORIGINALE MANCANTE: nessun invio e nessun parametro ricostruito', async () => {
    // ⛔ **Il ripiego `pendingBase ?? pendingAvailable` inventava una base.** Un
    //    ritentativo ripete un'operazione GIÀ DEFINITA: se la base originale
    //    non c'è, l'operazione non è definita, e ricostruirla significa mandare
    //    parametri diversi da quelli della chiave — cioè, per il canale, una
    //    richiesta che non corrisponde alla chiave che la accompagna.
    //
    // ⭐ Ed è anche una scrittura pericolosa: con `base = valore` il confronto
    //    chiede «sei già a 12?» e, se il canale ci fosse per caso, scriverebbe
    //    12 sopra uno stato che nessuno ha verificato.
    const variante = await importaVariante('E6');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 12);
    await giacenza(variante.id, 12);
    await prisma.shopifyInventorySyncState.create({
      data: {
        tenantId: IDS.tenantA,
        variantId: variante.id,
        locationId: IDS.locA1,
        lastPushedAvailable: 10,
        lastPushedAt: new Date(Date.now() - 3_600_000),
        // Un tentativo aperto SENZA la propria base: incompleto.
        pendingKey: 'chiave-senza-base',
        pendingAvailable: 12,
        pendingBase: null,
        pendingShopDomain: DOMINIO,
        pendingItemId: item,
        pendingLocationRef: SEDE_REMOTA,
        pendingAt: new Date(),
      },
    });
    negozio.azzeraChiamate();

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({
      pushed: false,
      reason: 'tentativo_incerto',
      publishableAvailable: 12,
    });
    // ⛔ Nessuna chiamata: non si manda un'operazione ricostruita.
    expect(negozio.totaleChiamate()).toBe(0);
    const riga = await stato(variante.id);
    // ⭐ E i parametri restano quelli di allora, base compresa: non si «ripara»
    //    la riga scrivendoci dentro un valore plausibile.
    expect(riga.pendingKey).toBe('chiave-senza-base');
    expect(riga.pendingAvailable).toBe(12);
    expect(riga.pendingBase).toBeNull();
    expect(riga.lastPushedAvailable).toBe(10);
  });

  // ── T1 ───────────────────────────────────────────────────────────────────

  it('T1 · arresto DOPO la registrazione e PRIMA dell invio: il confermato non avanza', async () => {
    const variante = await importaVariante('T1');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 9);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    // Il guasto scatta PRIMA dell'effetto: la chiamata non arriva al negozio.
    negozio.guastaProssima('setInventoryQuantities', 1);

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({ pushed: false, reason: 'shopify_error' });
    const riga = await stato(variante.id);
    // ⛔ **L'ultimo confermato NON è avanzato**: niente è stato trasmesso.
    expect(riga.lastPushedAvailable).toBe(10);
    // ⭐ Ma il tentativo è registrato, con tutto ciò che serve a ripeterlo.
    expect(riga.pendingKey).not.toBeNull();
    expect(riga.pendingAvailable).toBe(9);
    expect(riga.pendingBase).toBe(10);
    expect(riga.pendingShopDomain).toBe(DOMINIO);
    expect(riga.pendingItemId).toBe(item);
    expect(riga.pendingLocationRef).toBe(SEDE_REMOTA);
    expect(riga.pendingAt).not.toBeNull();
    // E il negozio non è stato toccato.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(10);
  });

  // ── T2 ───────────────────────────────────────────────────────────────────

  it('T2 · risposta PERSA dopo l applicazione remota: il negozio cambia, il confermato no', async () => {
    const variante = await importaVariante('T2');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 9);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({ pushed: false, reason: 'shopify_error' });
    // ⛔ Il negozio è GIÀ cambiato…
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    const riga = await stato(variante.id);
    // …ma VestiFlow non lo sa: il confermato resta indietro e il tentativo è aperto.
    expect(riga.lastPushedAvailable).toBe(10);
    expect(riga.pendingAvailable).toBe(9);
  });

  // ── T3 ───────────────────────────────────────────────────────────────────

  it('T3 · la sequenza intera: 10 → −1 persa → +3 → ripartenza → 12, senza duplicare né perdere', async () => {
    // ⭐ **La sequenza chiesta dal proprietario, sul percorso applicativo.**
    const variante = await importaVariante('T3');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 10);
    await confermato(variante.id, 10);

    // 1 · modifica locale −1, inviata, risposta persa.
    await cambiaDisponibile(variante.id, 9);
    negozio.azzeraChiamate();
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(9);
    const chiavePrimoTentativo = (await stato(variante.id)).pendingKey;
    expect(chiavePrimoTentativo).not.toBeNull();

    // 2 · nuova modifica locale +3, mentre il tentativo è ancora incerto.
    await cambiaDisponibile(variante.id, 12);

    // 3 · RIPARTENZA: un esecutore nuovo, che non ha memoria del precedente.
    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    expect(esito).toEqual({ pushed: true, publishableAvailable: 12 });
    // ⭐ **12**: il −1 non è stato duplicato e il +3 non è andato perso.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(12);
    const riga = await stato(variante.id);
    expect(riga.lastPushedAvailable).toBe(12);
    // ⭐ E il tentativo è chiuso.
    expect(riga.pendingKey).toBeNull();
    expect(riga.pendingAvailable).toBeNull();
    // ⚠️ Tre chiamate in tutto: quella persa, la sua ripetizione (deduplicata
    //    dalla chiave, quindi senza secondo effetto) e quella nuova.
    expect(negozio.chiamate.get('setInventoryQuantities')).toBe(3);
  });

  // ── T4 ───────────────────────────────────────────────────────────────────

  it('T4 · due esecutori CONCORRENTI: uno scrive, l altro riconosce il tentativo in corso', async () => {
    const variante = await importaVariante('T4');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 8);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();

    // ⭐ **La sovrapposizione va COSTRUITA, non sperata.** Due chiamate lanciate
    //    insieme si serializzano da sole in pochi millisecondi, e il secondo
    //    esecutore troverebbe il tentativo già chiuso: non misurerebbe niente.
    //    Qui il primo invio resta fermo dentro il canale finché il secondo non
    //    ha provato a prendersi la riga.
    const vero = negozio.graphql() as unknown as Record<
      string,
      (...argomenti: unknown[]) => Promise<unknown>
    >;
    // ⚠️ Inizializzata, non `null`: TypeScript non vede l'assegnazione dentro
    //    l'esecutore della promessa e restringerebbe il tipo a `never`.
    let sblocca: () => void = () => undefined;
    const barriera = new Promise<void>((risolvi) => {
      sblocca = risolvi;
    });
    const graphqlLento = {
      ...vero,
      setInventoryQuantities: async (...argomenti: unknown[]) => {
        await barriera;
        return vero['setInventoryQuantities']!(...argomenti);
      },
    };

    const primoGiro = nuovoEsecutore(graphqlLento).pushLevel(
      IDS.tenantA,
      variante.id,
      IDS.locA1,
    );
    // Si aspetta che il primo abbia preso la riga, poi parte il secondo.
    for (let attesa = 0; attesa < 100; attesa += 1) {
      const riga = await stato(variante.id);
      if (riga.pendingKey) {
        break;
      }
      await new Promise((risolvi) => setTimeout(risolvi, 10));
    }
    const secondoGiro = nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    const secondo = await secondoGiro;
    sblocca();
    const primo = await primoGiro;

    const esiti = [primo, secondo];

    // ⛔ **Il requisito NON è «una sola chiamata».** Due richieste identiche con
    //    la stessa chiave sono una ripetizione legittima, e contarle sarebbe
    //    misurare il trasporto invece del comportamento. Le tre garanzie sono:
    //
    //    1 · nessun DOPPIO EFFETTO sul canale;
    //    2 · nessuna OPERAZIONE INDIPENDENTE duplicata — una chiave sola;
    //    3 · nessuna PERDITA dello stato locale.

    // 1 · un solo effetto: il negozio porta il valore mandato, non il doppio
    //     né un'applicazione ripetuta.
    expect(negozio.quantitaRemota(item, SEDE_REMOTA)).toBe(8);
    // ⭐ E le quantità REGISTRATE come applicate sono una sola: la ripetizione
    //    con la stessa chiave non produce un secondo effetto.
    expect(negozio.quantitaMandate).toEqual([
      { inventoryItemId: item, locationId: SEDE_REMOTA, available: 8 },
    ]);

    // 2 · nessuna operazione INDIPENDENTE duplicata: per quante richieste siano
    //     partite, la chiave di idempotenza è **una sola**. È questa la misura,
    //     non il numero di chiamate — il secondo esecutore ha trovato il
    //     tentativo aperto e lo ha RIPETUTO, che è la cosa giusta da fare.
    expect(new Set(negozio.chiaviViste).size).toBe(1);
    // ⚠️ Nessuno dei due ha aperto un'operazione nuova, quindi nessuno riceve
    //    `tentativo_in_corso`: quell'esito riguarda la corsa alla PRENOTAZIONE,
    //    non la ripetizione di un tentativo già aperto.
    expect(esiti.filter((e) => e.reason === 'base_assente')).toHaveLength(0);

    // 3 · lo stato locale è coerente e non si è perso niente: il tentativo è
    //     chiuso, il confermato è avanzato una volta sola, il Disponibile è
    //     quello di prima.
    const riga = await stato(variante.id);
    expect(riga.pendingKey).toBeNull();
    expect(riga.lastPushedAvailable).toBe(8);
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    expect(livello.available).toBe(8);
  });

  // ── T5 ───────────────────────────────────────────────────────────────────

  it('T5 · oltre la FINESTRA di idempotenza non si reinvia: resta riconoscibile e chiede riconciliazione', async () => {
    const variante = await importaVariante('T5');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 9);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    negozio.perdiProssimaRisposta('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // Il tentativo invecchia oltre le 24 ore.
    await prisma.shopifyInventorySyncState.updateMany({
      where: { tenantId: IDS.tenantA, variantId: variante.id, locationId: IDS.locA1 },
      data: { pendingAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    // E nel frattempo arriva una modifica locale successiva.
    await cambiaDisponibile(variante.id, 12);
    const chiamatePrima = negozio.chiamate.get('setInventoryQuantities') ?? 0;

    const esito = await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    // ⛔ Nessun reinvio automatico: fuori finestra la ripetizione non è più
    //    deduplicata, e riapplicarla potrebbe contare l'effetto due volte.
    expect(esito).toEqual({ pushed: false, reason: 'tentativo_incerto', publishableAvailable: 12 });
    expect(negozio.chiamate.get('setInventoryQuantities') ?? 0).toBe(chiamatePrima);
    const riga = await stato(variante.id);
    // ⭐ Il tentativo resta RICONOSCIBILE, coi suoi parametri.
    expect(riga.pendingKey).not.toBeNull();
    expect(riga.pendingAvailable).toBe(9);
    // ⭐ E la modifica successiva NON è persa: il Disponibile è 12 e il
    //    confermato è ancora 10, quindi resta tutto da trasmettere.
    expect(riga.lastPushedAvailable).toBe(10);
    const livello = await prisma.inventoryLevel.findUniqueOrThrow({
      where: { variantId_locationId: { variantId: variante.id, locationId: IDS.locA1 } },
    });
    expect(livello.available).toBe(12);
  });

  // ── T6 ───────────────────────────────────────────────────────────────────

  it('T6 · una nuova operazione NON cancella quella incerta', async () => {
    const variante = await importaVariante('T6');
    const item = variante.shopifyInventoryItemId!;
    negozio.impostaQuantitaRemota(item, SEDE_REMOTA, 10);
    await giacenza(variante.id, 9);
    await confermato(variante.id, 10);
    negozio.azzeraChiamate();
    // Il tentativo si apre e la chiamata cade prima dell'effetto: resta aperto.
    negozio.guastaProssima('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);
    const primaChiave = (await stato(variante.id)).pendingKey;

    // Una modifica locale successiva, e un secondo giro che fallisce anch'esso.
    await cambiaDisponibile(variante.id, 12);
    negozio.guastaProssima('setInventoryQuantities', 1);
    await nuovoEsecutore().pushLevel(IDS.tenantA, variante.id, IDS.locA1);

    const riga = await stato(variante.id);
    // ⛔ **La chiave è ancora quella del PRIMO tentativo**: il secondo giro ha
    //    provato a ripetere l'operazione incerta, non a sostituirla con una
    //    nuova. Cancellarla avrebbe perso l'unica traccia di ciò che poteva
    //    essere già stato applicato dall'altra parte.
    expect(riga.pendingKey).toBe(primaChiave);
    expect(riga.pendingAvailable).toBe(9);
    expect(riga.lastPushedAvailable).toBe(10);
  });
});
