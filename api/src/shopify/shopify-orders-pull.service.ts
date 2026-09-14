import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import { ShopifyConfigService } from './shopify-config.service';
import { ShopifyConnectionService } from './shopify-connection.service';
import { ShopifyOAuthService } from './shopify-oauth.service';
import {
  buildShopifyScopeDiagnostics,
  mergeShopifyScopes,
  shopifyOrdersReadScopeError,
} from './shopify-scopes.util';
import { ShopifySyncService } from './shopify-sync.service';
import { extractShopifyOrderGid } from './shopify-order-id.util';
import { resolveShopifyOrderLocationId } from './shopify-order-location.util';
import { ShopifyMissingOrdersService } from './shopify-missing-orders.service';

/** Un ordine ancora aperto sul negozio, come lo vede la PRIMA CONNESSIONE. */
export interface OrdinePendenteDto {
  readonly shopifyOrderId: string;
  readonly nome: string;
  readonly stato: 'aperto' | 'parziale';
  readonly righe: number;
  /** `null` = nessuna sede VestiFlow determinabile: niente impegno, da collegare. */
  readonly locationId: string | null;
  /** Già presente in VestiFlow (acquisito da una partenza precedente o da un import). */
  readonly giaInVestiFlow: boolean;
}

export interface OrdiniPendentiEsito {
  readonly totale: number;
  readonly acquisiti: number;
  readonly giaPresenti: number;
  readonly senzaSede: number;
  readonly parziali: number;
  readonly falliti: readonly { readonly shopifyOrderId: string; readonly message: string }[];
}

export interface RecuperoOrdiniEsito {
  readonly nuovi: number;
  readonly aggiornati: number;
  readonly riletti: number;
  readonly falliti: readonly { readonly shopifyOrderId: string; readonly message: string }[];
}

export interface ShopifyOrdersPullResult {
  readonly imported: number;
  readonly updated: number;
  readonly skipped: number;
  readonly remoteOrderCount: number;
  readonly failed: readonly { readonly shopifyOrderId: string; readonly message: string }[];
  /** Ordini che su Shopify non risultano più: segnalati, mai rimossi da soli. */
  readonly missingOnChannel: number;
  /** Fra quelli, gli ordini non evasi di cui sono stati liberati gli impegni. */
  readonly reservationsReleased: number;
  /** Perché il controllo sugli ordini spariti non ha concluso, se è successo. */
  readonly missingCheckInconclusive?: string;
}

@Injectable()
export class ShopifyOrdersPullService {
  private readonly logger = new Logger(ShopifyOrdersPullService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyAdmin: ShopifyAdminClient,
    private readonly shopifySync: ShopifySyncService,
    private readonly missingOrders: ShopifyMissingOrdersService,
  ) {}

  async pullOrders(tenantId: string): Promise<ShopifyOrdersPullResult> {
    const connection = await this.shopifyConnection.getForTenant(tenantId);
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { scopes: true },
    });
    const effectiveScopes = mergeShopifyScopes(connection.scopes, credential?.scopes);
    const scopeError = shopifyOrdersReadScopeError(effectiveScopes);
    if (scopeError) {
      buildShopifyScopeDiagnostics(this.shopifyConfig.requestedScopes, effectiveScopes);
      throw new UnprocessableEntityException(scopeError);
    }

    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let remoteOrders;
    try {
      remoteOrders = await this.shopifyAdmin.listAllOrders(shopDomain, accessToken);
    } catch (error: unknown) {
      await this.shopifyConnection.recordApiFailure(tenantId, error);
      throw error;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const failed: { shopifyOrderId: string; message: string }[] = [];

    // Elenco completo dei remoti, per la riconciliazione in coda. Si raccoglie
    // dal risultato di `listAllOrders`, che o è completo o ha già sollevato
    // un'eccezione: un elenco parziale scambierebbe ordini vivi per cancellati.
    const remoteOrderGids = new Set<string>();

    for (const remoteOrder of remoteOrders) {
      const gid = extractShopifyOrderGid(remoteOrder);
      if (gid) {
        remoteOrderGids.add(gid);
      }

      const shopifyOrderId = String(remoteOrder['id'] ?? 'unknown');
      try {
        const outcome = await this.shopifySync.applyOrderFromShopify(tenantId, remoteOrder);
        switch (outcome) {
          case 'created':
            imported += 1;
            break;
          case 'updated':
            updated += 1;
            break;
          case 'skipped':
            skipped += 1;
            break;
        }
      } catch (error) {
        failed.push({
          shopifyOrderId,
          message: error instanceof Error ? error.message : 'Errore sconosciuto',
        });
      }
    }

    // Riconciliazione in coda: l'elenco remoto è già in mano, e finora lo si
    // percorreva in un verso solo — si aggiornavano i remoti trovati, senza mai
    // guardare i locali che non compaiono più. È lì che stavano gli ordini
    // cancellati su Shopify, di cui non ci accorgevamo in nessun modo.
    //
    // Non blocca l'importazione: se il confronto fallisce, gli ordini importati
    // restano importati e l'operatore vede comunque l'esito dello scarico.
    let missingOnChannel = 0;
    let reservationsReleased = 0;
    let missingCheckInconclusive: string | undefined;
    try {
      const reconciled = await this.missingOrders.reconcile(tenantId, { remoteOrderGids });
      missingOnChannel = reconciled.missing;
      reservationsReleased = reconciled.released;
      missingCheckInconclusive = reconciled.inconclusive;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto';
      this.logger.warn(`Riconciliazione ordini spariti non riuscita (${tenantId}): ${message}`);
      missingCheckInconclusive =
        'Il controllo sugli ordini spariti non è stato eseguito per un errore interno.';
    }

    await this.shopifyConnection.touchSync(tenantId);

    this.logger.log(
      `Import ordini Shopify (${tenantId}): +${imported} ~${updated} skip=${skipped} remote=${remoteOrders.length} failed=${failed.length} spariti=${missingOnChannel}`,
    );

    return {
      imported,
      updated,
      skipped,
      remoteOrderCount: remoteOrders.length,
      failed,
      missingOnChannel,
      reservationsReleased,
      missingCheckInconclusive,
    };
  }

  // ── PRIMA CONNESSIONE: gli ordini PENDENTI, non lo storico (`docs/27` §5-bis) ──

  /**
   * Gli ordini ancora aperti (non evasi, o evasi in parte) sul negozio, letti
   * senza scrivere niente: è la LETTURA DI CONTROLLO della fase 3. Per ciascuno
   * dice se ha una sede VestiFlow determinabile e se è già in VestiFlow.
   */
  async elencaOrdiniPendenti(tenantId: string): Promise<readonly OrdinePendenteDto[]> {
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const remoti = await this.shopifyAdmin.listOpenUnfulfilledOrders(shopDomain, accessToken);
    const esito: OrdinePendenteDto[] = [];
    for (const ordine of remoti) {
      const shopifyOrderId = String(ordine['id'] ?? '');
      if (!shopifyOrderId) {
        continue;
      }
      const gid = extractShopifyOrderGid(ordine);
      const presente = gid
        ? await this.prisma.salesOrder.findFirst({
            where: { tenantId, shopifyOrderId: gid },
            select: { id: true },
          })
        : null;
      const righe = (ordine['line_items'] as unknown[] | undefined)?.length ?? 0;
      esito.push({
        shopifyOrderId,
        nome: String(ordine['name'] ?? `#${shopifyOrderId}`),
        stato: ordine['fulfillment_status'] === 'partial' ? 'parziale' : 'aperto',
        righe,
        locationId: await resolveShopifyOrderLocationId(this.prisma, tenantId, ordine),
        giaInVestiFlow: presente !== null,
      });
    }
    return esito;
  }

  /**
   * ⭐ L’ACQUISIZIONE della partenza: SOLO gli ordini ancora aperti, come impegni
   *    (Impegnata +, giacenza invariata). Niente storico: un ordine già evaso è
   *    già dentro la giacenza — di Shopify (S→V) o fisica (V→S). Gli evasi in
   *    parte non prendono impegni e restano segnalati (`requiresReview`), da
   *    risolvere a mano; quelli senza sede restano senza impegno e segnalati.
   */
  async acquisisciOrdiniPendenti(tenantId: string): Promise<OrdiniPendentiEsito> {
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    const remoti = await this.shopifyAdmin.listOpenUnfulfilledOrders(shopDomain, accessToken);
    let acquisiti = 0;
    let giaPresenti = 0;
    let senzaSede = 0;
    let parziali = 0;
    const falliti: { shopifyOrderId: string; message: string }[] = [];
    for (const ordine of remoti) {
      const shopifyOrderId = String(ordine['id'] ?? 'unknown');
      if (ordine['fulfillment_status'] === 'partial') {
        parziali += 1;
      }
      if (!(await resolveShopifyOrderLocationId(this.prisma, tenantId, ordine))) {
        senzaSede += 1;
      }
      try {
        const esito = await this.shopifySync.applyOrderFromShopify(tenantId, ordine, 'pendenti');
        if (esito === 'created') {
          acquisiti += 1;
        } else if (esito === 'updated') {
          giaPresenti += 1;
        }
      } catch (error: unknown) {
        falliti.push({
          shopifyOrderId,
          message: error instanceof Error ? error.message : 'Errore sconosciuto',
        });
      }
    }
    this.logger.log(
      `Ordini pendenti alla partenza (${tenantId}): ${acquisiti} acquisiti, ${giaPresenti} già presenti, ${senzaSede} senza sede, ${parziali} parziali, ${falliti.length} falliti su ${remoti.length}`,
    );
    return { totale: remoti.length, acquisiti, giaPresenti, senzaSede, parziali, falliti };
  }

  // ── SINCRONIZZAZIONE CONTINUA: il recupero dopo un’interruzione ─────────────

  /**
   * ⭐ Che cosa è successo mentre i webhook non arrivavano: gli ordini NATI dopo
   *    l’ultimo id fissato all’attivazione (gli id crescono con la creazione:
   *    nessun orologio) e gli ordini che VestiFlow CONOSCE e che quella scansione
   *    non raggiunge — nati prima del confine, acquisiti alla partenza perché
   *    aperti — riletti uno per uno, aperti o chiusi. Tutto passa come
   *    `continua`: un’evasione si scarica anche se VestiFlow non ne aveva
   *    l’impegno — l’ordine creato ed evaso durante l’interruzione non si ignora
   *    (proprietario, 12/09/2026).
   *
   * ⛔ Qui la rilettura prendeva i soli APERTI (`cancelledAt` e `fulfilledAt`
   *    nulli): il rimborso di un ordine pre-attivazione già evaso non stava in
   *    nessuno dei due insiemi e si perdeva — e «Importa ordini» a percorso
   *    attivato è questo stesso recupero, quindi senza rimedio a mano. Corretto
   *    il 13/09/2026 (percorso 19): il perimetro resta quello dei CONOSCIUTI,
   *    niente storico e nessun orologio; il costo è una lettura per ordine
   *    conosciuto fuori dalla scansione.
   *
   * ⛔ Non è «Importa ordini»: non tocca lo storico e non produce vendite
   *    `not_applied`.
   */
  async recuperaOrdini(tenantId: string, ordersSinceId: string): Promise<RecuperoOrdiniEsito> {
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let nuovi = 0;
    let aggiornati = 0;
    let riletti = 0;
    const falliti: { shopifyOrderId: string; message: string }[] = [];
    const visti = new Set<string>();

    const applica = async (ordine: Record<string, unknown>): Promise<void> => {
      const shopifyOrderId = String(ordine['id'] ?? 'unknown');
      if (visti.has(shopifyOrderId)) {
        return;
      }
      visti.add(shopifyOrderId);
      try {
        const esito = await this.shopifySync.applyOrderFromShopify(tenantId, ordine, 'continua');
        if (esito === 'created') {
          nuovi += 1;
        } else if (esito === 'updated') {
          aggiornati += 1;
        }
      } catch (error: unknown) {
        falliti.push({
          shopifyOrderId,
          message: error instanceof Error ? error.message : 'Errore sconosciuto',
        });
      }
    };

    for (const ordine of await this.shopifyAdmin.listOrdersSinceId(
      shopDomain,
      accessToken,
      ordersSinceId,
    )) {
      await applica(ordine);
    }

    // Gli ordini che VestiFlow conosce e che la scansione non ha restituito:
    // evasione, annullo o RIMBORSO possono essere avvenuti nel silenzio, anche su
    // un ordine già evaso. Si rileggono per id, senza guardare lo stato.
    const conosciuti = await this.prisma.salesOrder.findMany({
      where: { tenantId, shopifyOrderId: { not: null } },
      select: { shopifyOrderId: true },
    });
    for (const conosciuto of conosciuti) {
      const numero =
        /\/(\d+)$/.exec(conosciuto.shopifyOrderId ?? '')?.[1] ?? conosciuto.shopifyOrderId;
      if (!numero || visti.has(numero)) {
        continue;
      }
      const ordine = await this.shopifyAdmin.getOrder(shopDomain, accessToken, numero);
      if (!ordine) {
        continue;
      }
      riletti += 1;
      await applica(ordine);
    }

    await this.shopifyConnection.touchSync(tenantId);
    this.logger.log(
      `Recupero ordini (${tenantId}) da id ${ordersSinceId}: ${nuovi} nuovi, ${aggiornati} aggiornati, ${riletti} riletti, ${falliti.length} falliti`,
    );
    return { nuovi, aggiornati, riletti, falliti };
  }
}
