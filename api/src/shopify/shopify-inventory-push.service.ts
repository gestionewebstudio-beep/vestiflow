import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import {
  PlatformAuditActor,
  PlatformAuditOperation,
  ShopifyConnectionStatus,
} from '@prisma/client';

import { PlatformAuditService } from '../common/audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import { gidVariante, ShopifyLinkHistoryService } from './shopify-link-history.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { computeShopifyPublishableAvailable } from './shopify-publishable-available.util';
import { SHOPIFY_WRITE_INVENTORY_SCOPE, shopifyHasScope } from './shopify-scopes.util';

export type ShopifyInventoryPushSkipReason =
  | 'not_connected'
  | 'missing_write_inventory_scope'
  | 'sync_disabled'
  | 'variant_not_linked'
  | 'location_not_linked'
  | 'level_not_found'
  | 'unchanged'
  /** 26.8 · lo storico vieta di usare quel collegamento: nessuna quantità parte. */
  | 'collegamento_escluso'
  /**
   * Caso C · la riconciliazione RINVIA questa coppia, e il recupero non la
   * scavalca. Solo il percorso interno di recupero può restituirlo.
   */
  | 'rinvio_attivo';

export interface ShopifyInventoryPushResult {
  readonly pushed: boolean;
  readonly reason?: ShopifyInventoryPushSkipReason | 'shopify_error';
  readonly publishableAvailable?: number;
}

/**
 * Push inventario VestiFlow → Shopify (post-commit, best-effort).
 *
 * Pubblica `max(0, available)` sul campo REST `available` (NON `on_hand`) e
 * registra l'ultimo inviato per l'anti-loop.
 *
 * ⛔ **Qui c'era `max(0, onHand - committed - safetyStock)`**, cioè una formula
 *    che il codice non usa più da 26.9: il Disponibile è la colonna, e la scorta
 *    di sicurezza è stata rimossa. Corretto il 09/09/2026 — un commento che
 *    descrive un calcolo diverso da quello eseguito è peggio di nessun commento,
 *    perché chiude la domanda invece di lasciarla aperta.
 */
@Injectable()
export class ShopifyInventoryPushService {
  private readonly logger = new Logger(ShopifyInventoryPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly reconciliation: ShopifyInventoryReconciliationService,
    private readonly storico: ShopifyLinkHistoryService,
    private readonly registro: PlatformAuditService,
  ) {}

  /**
   * Il push ORDINARIO: una variazione locale che si porta al canale.
   *
   * ⛔ **Conserva la scorciatoia dell'«invariata»**, e deve conservarla: qui la
   *    domanda è «è cambiato qualcosa da mandare?», e la risposta è l'ultimo
   *    inviato. Lo chiamano documenti, movimenti, riconciliazione e la porta
   *    unica dei canali: nessuno di loro può chiedere una ripubblicazione.
   */
  async pushLevel(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<ShopifyInventoryPushResult> {
    return this.esegui(tenantId, variantId, locationId, false);
  }

  /**
   * Il percorso INTERNO di recupero di un disallineamento (`mismatchDetected`).
   *
   * ⭐ **Supera un confronto solo**, quello con l'ultimo inviato — che nel caso
   *    canonico del disallineamento è proprio il valore messo in dubbio: Shopify
   *    mostra un numero diverso, VestiFlow non ha cambiato il proprio, e il push
   *    ordinario si ferma prima di partire. Tutto il resto resta in piedi.
   *
   * ⛔ **Non è un invio forzato, e non c'è nessun modo di chiederne uno.** Non
   *    esiste parametro, campo di richiesta o rotta che accenda questo percorso:
   *    lo raggiunge soltanto il ritentativo delle quantità, e prima di inviare
   *    rivaluta — non eredita — le condizioni che lo autorizzano.
   *
   * ⚠️ **Una selezione precedente non è un'autorizzazione permanente**: fra il
   *    momento in cui la coda è stata letta e questo invio possono essere
   *    passate decine di righe, e nel frattempo il disallineamento può essere
   *    stato risolto o può essere sopravvenuto un rinvio.
   */
  async ripubblicaDisallineamento(
    tenantId: string,
    variantId: string,
    locationId: string,
  ): Promise<ShopifyInventoryPushResult> {
    return this.esegui(tenantId, variantId, locationId, true);
  }

  private async esegui(
    tenantId: string,
    variantId: string,
    locationId: string,
    recupero: boolean,
  ): Promise<ShopifyInventoryPushResult> {
    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { status: true, scopes: true },
    });

    if (!connection || connection.status !== ShopifyConnectionStatus.connected) {
      return { pushed: false, reason: 'not_connected' };
    }

    if (!shopifyHasScope(connection.scopes, SHOPIFY_WRITE_INVENTORY_SCOPE)) {
      this.logger.debug(
        `Push inventario saltato (${tenantId}): scope ${SHOPIFY_WRITE_INVENTORY_SCOPE} assente`,
      );
      return { pushed: false, reason: 'missing_write_inventory_scope' };
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, tenantId },
      select: {
        id: true,
        sku: true,
        shopifyInventoryItemId: true,
        shopifyVariantId: true,
        product: { select: { shopifySyncEnabled: true } },
      },
    });
    if (!variant) {
      return { pushed: false, reason: 'variant_not_linked' };
    }
    // ⛔ «Sincronizza con Shopify» spento ferma TUTTI i flussi, inventario
    //    compreso (docs/24 §1.8). Qui il flag non veniva letto: il catalogo si
    //    congelava e lo stock continuava a partire — l'interruttore prometteva
    //    una cosa e ne faceva un'altra.
    if (!variant.product.shopifySyncEnabled) {
      return { pushed: false, reason: 'sync_disabled' };
    }

    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      select: { shopifyLocationId: true, name: true },
    });
    if (!location?.shopifyLocationId) {
      this.logger.debug(
        `Push inventario saltato (${tenantId}): location ${locationId} senza shopifyLocationId`,
      );
      return { pushed: false, reason: 'location_not_linked' };
    }

    const level = await this.prisma.inventoryLevel.findUnique({
      where: { variantId_locationId: { variantId, locationId } },
      // ⭐ **`available` è il numero, non un ingrediente.** Giacenza e impegnata
      //    si leggono solo per il log: dicono all'operatore da dove viene il
      //    disponibile, ma non lo ricalcolano.
      select: { available: true, onHand: true, committed: true },
    });
    if (!level) {
      return { pushed: false, reason: 'level_not_found' };
    }

    // ⛔ **Qui si RICALCOLAVA `onHand - committed`**, cioè un secondo Disponibile
    //    accanto a quello che il gestionale mantiene e che l'operatore legge a
    //    schermo. Sostituito il 09/09/2026 con la lettura della colonna, dopo
    //    aver verificato che l'invariante è mantenuto da tutti i percorsi di
    //    scrittura. Verso il canale resta il solo clamp a zero.
    const publishable = computeShopifyPublishableAvailable(level.available);

    // ── 26.8 · lo STORICO, prima di usare qualunque identificativo remoto ───
    //
    // ⛔ **Sta PRIMA del controllo «invariata», e non è un dettaglio.** La
    //    risposta a «posso usare questo collegamento?» non deve dipendere dal
    //    fatto che il numero sia per caso uguale all'ultimo inviato: altrimenti
    //    lo stesso collegamento vietato risponde `unchanged` o
    //    `collegamento_escluso` secondo la storia dei push precedenti. È la
    //    stessa ragione per cui in 26.7 la sicurezza non dipende dall'essere
    //    passati dal ripristino.
    //
    // ⚠️ **Costo dichiarato**: due letture in più (il negozio e l'identità) su
    //    ogni livello, compresi i moltissimi che finiscono in `unchanged`. È il
    //    moltiplicatore per riga che la pipeline C4 vuole togliere; toglierlo
    //    qui, a scapito della verifica, sarebbe il baratto sbagliato.
    const escluso = await this.collegamentoDellaVarianteEscluso(tenantId, variant, locationId);
    if (escluso) {
      // ⛔ **Nessun invio, e NESSUNO ZERO al posto del rifiuto**: mandare zero
      //    sarebbe una scrittura remota attraverso il collegamento vietato, e
      //    per giunta toglierebbe dalla vendita un prodotto che nessuno ha
      //    chiesto di ritirare.
      return { pushed: false, reason: 'collegamento_escluso', publishableAvailable: publishable };
    }

    const syncState = await this.prisma.shopifyInventorySyncState.findUnique({
      where: {
        tenantId_variantId_locationId: { tenantId, variantId, locationId },
      },
      select: {
        lastPushedAvailable: true,
        lastObservedShopifyAvailable: true,
        mismatchDetected: true,
      },
    });

    if (!recupero) {
      if (syncState?.lastPushedAvailable === publishable) {
        return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
      }
    } else {
      const trattenuto = await this.recuperoDaFermare(
        tenantId,
        variantId,
        locationId,
        syncState,
        publishable,
        variant.sku ?? variant.id,
      );
      if (trattenuto) {
        return trattenuto;
      }
    }

    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      const inventoryItemId = await this.resolveInventoryItemId(variant, shopDomain, accessToken);
      if (!inventoryItemId) {
        this.logger.debug(
          // Lo SKU è il nome con cui si riconosce una variante, ma può mancare:
          // Shopify non lo garantisce, e in import arrivano varianti senza. La
          // riga diceva «variante null» e non permetteva di risalire a quale,
          // cioè era una segnalazione che non si poteva seguire. L'id c'è
          // sempre, e vale come ripiego.
          `Push inventario saltato (${tenantId}): variante ${variant.sku || variant.id} non collegata a Shopify`,
        );
        return { pushed: false, reason: 'variant_not_linked' };
      }

      await this.shopifyAdmin.setInventoryAvailable(
        shopDomain,
        accessToken,
        inventoryItemId,
        location.shopifyLocationId,
        publishable,
      );

      await this.reconciliation.recordSuccessfulPush(
        tenantId,
        variantId,
        locationId,
        publishable,
      );
      await this.shopifyConnection.touchSync(tenantId);
      this.logger.log(
        `Inventario Shopify aggiornato (${tenantId}): SKU ${variant.sku} @ ${location.name} → ${publishable} ` +
          `(Giacenza ${level.onHand}, Impegnata ${level.committed})`,
      );
      return { pushed: true, publishableAvailable: publishable };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore push inventario Shopify';
      this.logger.warn(`Push inventario Shopify fallito (${tenantId}): ${message}`);
      return { pushed: false, reason: 'shopify_error' };
    }
  }

  async pushLevels(
    tenantId: string,
    variantId: string,
    locationIds: readonly string[],
  ): Promise<void> {
    const uniqueLocationIds = [...new Set(locationIds)];
    for (const locationId of uniqueLocationIds) {
      await this.pushLevel(tenantId, variantId, locationId);
    }
  }

  /**
   * Le rivalutazioni del percorso di recupero.
   *
   * Restituisce l'esito che **ferma** l'invio, oppure `null` se si può
   * procedere. ⭐ Sta DOPO tutte le guardie ordinarie — connessione, scope,
   * interruttore di sincronizzazione, sede, livello, storico 26.8 — che il
   * recupero non tocca e che quindi hanno già detto la loro.
   */
  private async recuperoDaFermare(
    tenantId: string,
    variantId: string,
    locationId: string,
    stato: {
      readonly lastPushedAvailable: number | null;
      readonly lastObservedShopifyAvailable: number | null;
      readonly mismatchDetected: boolean;
    } | null,
    publishable: number,
    etichetta: string,
  ): Promise<ShopifyInventoryPushResult | null> {
    // 1 · Il disallineamento non c'è più. Il marcatore può essersi spento fra la
    //     lettura della coda e questa riga — un'eco, o un altro push riuscito.
    if (!stato?.mismatchDetected) {
      return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
    }

    // 2 · Il marcatore è acceso, ma l'ultima osservazione dice che Shopify porta
    //     già il numero che si manderebbe: ripubblicarlo non correggerebbe
    //     niente. ⚠️ Il marcatore NON si spegne qui: spegnerlo è mestiere della
    //     riconciliazione (Caso A), che è l'unica a guardare davvero il canale.
    if (stato.lastObservedShopifyAvailable === publishable) {
      return { pushed: false, reason: 'unchanged', publishableAvailable: publishable };
    }

    // 3 · Un RINVIO sopravvenuto. ⛔ Il ramo differito della riconciliazione non
    //     spegne un marcatore già acceso: senza questa domanda, un
    //     disallineamento vecchio autorizzerebbe un invio che il rinvio appena
    //     deliberato vieta — e lo farebbe entro la stessa chiamata.
    const rinviata = await this.reconciliation.rinvioAttivo(
      tenantId,
      variantId,
      locationId,
      stato.lastObservedShopifyAvailable,
      publishable,
    );
    if (rinviata) {
      this.logger.debug(
        `Ripubblicazione rinviata (${tenantId}): ${etichetta} @ ${locationId} — ` +
          `osservato ${stato.lastObservedShopifyAvailable}, pubblicabile ${publishable}, impegni Shopify attivi`,
      );
      return { pushed: false, reason: 'rinvio_attivo', publishableAvailable: publishable };
    }

    // ⚠️ **Il verso che ALZA la quantità su Shopify è ambiguo, e va detto.**
    //    Lo stesso stato su disco è compatibile con storie diverse: Shopify
    //    abbassato a mano (VestiFlow ha ragione, e ripubblicare è il rimedio),
    //    una vendita di canale mai scaricata (Shopify ha ragione, e
    //    ripubblicare rimette in vendita merce già uscita), o movimenti che si
    //    compensano. ⛔ **Disponibile invariato non dimostra assenza di
    //    movimenti**: un saldo non racconta la storia che lo ha prodotto.
    //
    // ⛔ **Qui c'era «il criterio che le separa non è memorizzato da nessuna
    //    parte», e confondeva due domande diverse.** Corretto il 09/09/2026:
    //
    //    1. «QUESTA VENDITA HA GIÀ PRODOTTO UNO SCARICO?» — ha risposta, ed è
    //       persistita: `OnlineSale.inventoryStatus`, lo `StockMovement` con
    //       `sourceDocumentType = online_sale`, e il vincolo unico per riga che
    //       impedisce il doppio scarico. È una PROVA, e c'è.
    //
    //    2. «QUELLA VENDITA DEVE INCIDERE SULLE GIACENZE DI QUESTA GESTIONE?» —
    //       non ha risposta, e non perché manchi un campo: è una DECISIONE
    //       approvata e mai eseguita. Senza il confine sugli ordini e il
    //       documento di apertura delle giacenze (`docs/02` §4.6-4.7, dichiarati
    //       aperti da `docs/24` §12.0 e §12.9) non si sa se una vendita sia già
    //       compresa nel saldo iniziale.
    //
    // ⚠️ È la seconda a mancare, ed è la sola che deciderebbe questo invio.
    //    Ricognizione completa in `docs/ORDINI-CANALE-ESTERNO.md`.
    //
    // ⛔ **Non si tace e non si blocca**: bloccare rinuncerebbe alla metà buona
    //    del rimedio, tacere propagherebbe l'errore al canale in silenzio.
    if (
      stato.lastObservedShopifyAvailable !== null &&
      stato.lastObservedShopifyAvailable < publishable
    ) {
      this.logger.warn(
        `Ripubblicazione che ALZA la quantità su Shopify (${tenantId}): ${etichetta} @ ${locationId} — ` +
          `osservato ${stato.lastObservedShopifyAvailable}, si pubblica ${publishable}. ` +
          'Se su quella coppia esiste una vendita non registrata in VestiFlow, questo invio la annulla anche sul canale.',
      );
    }
    return null;
  }

  /**
   * 26.8 · il push delle QUANTITÀ può usare il collegamento di questa variante?
   *
   * ⛔ **Il difetto che chiude**: `pushLevel` risolveva l'articolo di inventario
   *    dalla colonna-cache — o andava a leggerlo su Shopify partendo da
   *    `shopifyVariantId` — senza chiedere niente allo storico. Una variante col
   *    periodo chiuso e la cache conservata riceveva comunque la quantità
   *    (misurato il 09/09/2026, prova `E14`).
   *
   * ⭐ **La domanda si fa sul GID, non sull'anagrafica**: uno storico vecchio
   *    chiuso non blocca un collegamento attuale valido su un altro GID.
   *
   * ⚠️ **Connessione non migrata** (nessun negozio identificato): nessuno
   *    storico da interrogare, comportamento invariato. Assenza di storico non
   *    è esclusione.
   *
   * ⛔ **Variante con l'articolo di inventario ma SENZA il GID di variante**: si
   *    rifiuta. È l'unico caso in cui il collegamento non è verificabile, e
   *    usare un identificativo remoto che lo storico non può confermare è
   *    esattamente ciò che 26.7 vieta. ⚠️ **Nessun percorso applicativo produce
   *    quello stato** — i due identificativi si scrivono e si azzerano sempre
   *    insieme — quindi la scelta è conservativa e va guardata se comparisse.
   *
   * Restituisce il motivo del rifiuto, oppure `null` se si può procedere.
   */
  private async collegamentoDellaVarianteEscluso(
    tenantId: string,
    variant: {
      readonly id: string;
      readonly sku: string | null;
      readonly shopifyVariantId: string | null;
      readonly shopifyInventoryItemId: string | null;
    },
    locationId: string,
  ): Promise<string | null> {
    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);
    if (!shopId) {
      return null;
    }

    if (variant.shopifyVariantId) {
      const uso = await this.storico.collegamentoUsabileVariante(this.prisma, {
        shopId,
        shopifyVariantGid: gidVariante(variant.shopifyVariantId),
        variantId: variant.id,
      });
      if (uso.tipo === 'utilizzabile') {
        return null;
      }
      await this.rifiutoARegistro(tenantId, shopId, {
        variantId: variant.id,
        etichetta: variant.sku ?? variant.id,
        remoteGid: gidVariante(variant.shopifyVariantId),
        detail: `${uso.tipo}: ${uso.motivo} (quantità, sede ${locationId})`,
        motivo: uso.motivo,
      });
      return uso.motivo;
    }

    if (variant.shopifyInventoryItemId) {
      const motivo =
        `l'articolo di inventario ${variant.shopifyInventoryItemId} non ha un GID di variante ` +
        'sull\'anagrafica: lo storico non può confermare il collegamento, e la quantità non parte.';
      await this.rifiutoARegistro(tenantId, shopId, {
        variantId: variant.id,
        etichetta: variant.sku ?? variant.id,
        remoteGid: null,
        detail: `collegamento_non_verificabile: ${motivo} (sede ${locationId})`,
        motivo,
      });
      return motivo;
    }

    // Nessun identificativo remoto: non c'è niente da verificare, e il percorso
    // ordinario risponde già `variant_not_linked` più avanti.
    return null;
  }

  /**
   * §10.3 · la riga di registro di un rifiuto del push INVENTARIO.
   *
   * ⛔ **Un guasto del registro NON annulla e NON nasconde.** Qui non c'è
   *    nessuna transazione da far cadere: l'operazione locale che ha mosso la
   *    giacenza è già stata committata molto prima, e questo push è
   *    post-commit. Far risalire l'eccezione annullerebbe un'operazione locale
   *    riuscita per un guasto di tracciamento — il contrario di ciò che serve.
   *    Il rifiuto resta valido (la quantità non parte comunque) e il guasto si
   *    dichiara nel log come errore, non come avviso.
   */
  private async rifiutoARegistro(
    tenantId: string,
    shopId: string,
    dati: {
      readonly variantId: string;
      readonly etichetta: string;
      readonly remoteGid: string | null;
      readonly detail: string;
      readonly motivo: string;
    },
  ): Promise<void> {
    this.logger.warn(`Push inventario rifiutato (${tenantId}): ${dati.motivo}`);
    try {
      const negozio = await this.prisma.shopifyShop.findUnique({
        where: { id: shopId },
        select: { shopGid: true },
      });
      await this.registro.registraRifiuto(
        {
          tenantId,
          attore: { tipo: PlatformAuditActor.push },
          operation: PlatformAuditOperation.riaggancio_rifiutato,
          shopGid: negozio?.shopGid ?? null,
          entityId: dati.variantId,
          entityLabel: dati.etichetta.slice(0, 200),
          remoteGid: dati.remoteGid,
        },
        dati.detail,
        randomUUID(),
      );
    } catch (errore: unknown) {
      const messaggio = errore instanceof Error ? errore.message : String(errore);
      this.logger.error(
        `Registro dei rifiuti non scritto per il push inventario (${tenantId}/${dati.variantId}): ` +
          `${messaggio}. Il rifiuto resta valido: nessuna quantità è partita.`,
      );
    }
  }

  private async resolveInventoryItemId(
    variant: {
      readonly id: string;
      readonly shopifyInventoryItemId: string | null;
      readonly shopifyVariantId: string | null;
    },
    shopDomain: string,
    accessToken: string,
  ): Promise<string | null> {
    if (variant.shopifyInventoryItemId) {
      return variant.shopifyInventoryItemId;
    }
    if (!variant.shopifyVariantId) {
      return null;
    }

    const shopifyVariant = await this.shopifyAdmin.getVariant(
      shopDomain,
      accessToken,
      variant.shopifyVariantId,
    );
    const inventoryItemId = String(shopifyVariant.inventory_item_id);

    await this.prisma.productVariant.update({
      where: { id: variant.id },
      data: { shopifyInventoryItemId: inventoryItemId },
    });

    return inventoryItemId;
  }
}
