import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAdminClient } from './shopify-admin.client';
import {
  fulfillmentOrderGidsDalWebhook,
  sediPerRigaDaFulfillmentOrders,
  type MotivoRigaSenzaSede,
} from './shopify-fulfillment-orders.util';
import { ShopifyGraphqlClient } from './shopify-graphql.client';
import { ShopifyOAuthService } from './shopify-oauth.service';
import { resolveShopifyOrderLocationId } from './shopify-order-location.util';

/**
 * Dove sta UNA riga d'ordine, risolta a una sede VestiFlow — o perché no.
 *
 * - `locationId`: la sede VestiFlow collegata alla location che Shopify ha
 *   assegnato alla riga → l'impegno va (o si sposta) lì;
 * - `motivo`: la riga resta esplicitamente IRRISOLTA e non ricade su nessuna
 *   sede dell'ordine (deciso dal proprietario il 13/09/2026); uno nuovo non
 *   nasce e l'ordine dice l'azione. L'impegno che avesse si CONSERVA — tranne
 *   quando una lettura COMPLETA conferma che tutta la quantità residua della
 *   riga sta in una location non collegata (`location_non_collegata` con
 *   `letturaCompleta` e `residuoAssegnato`): allora si RILASCIA, perché il
 *   pezzo non partirà da dove era impegnato (deciso il 13/09/2026, misurato su
 *   #1010). Chi decide è il ciclo di vita, che conosce le spedizioni applicate;
 * - `evasa`: la riga compare solo in fulfillment order chiusi: non c'è più
 *   niente da assegnare, e non è un motivo di «Da verificare».
 */
export type SedeRigaRisolta =
  | { readonly locationId: string }
  | { readonly motivo: MotivoRigaSenzaSede }
  | { readonly evasa: true };

/**
 * La SEDE degli ordini online, letta dai FULFILLMENT ORDER di Shopify — in sola
 * lettura, per riga (`DA-FARE` §10e.7-bis, deciso il 13/09/2026).
 *
 * ⭐ **Si legge SEMPRE, anche se l'ordine porta `location_id`**: quel campo è la
 *    sede in cui l'ordine è stato REGISTRATO (POS), non dove Shopify lo farà
 *    evadere; un'assegnazione diversa nei fulfillment order vince. Precisazione
 *    del proprietario, 13/09/2026.
 *
 * ⛔ **Nessun comando verso Shopify**: niente spostamenti, niente evasioni. Chi
 *    decide la sede è il negozio; VestiFlow la acquisisce e gli impegni la seguono.
 */
@Injectable()
export class ShopifyFulfillmentOrdersService {
  private readonly logger = new Logger(ShopifyFulfillmentOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyOAuth: ShopifyOAuthService,
    private readonly shopifyGraphql: ShopifyGraphqlClient,
    private readonly shopifyAdmin: ShopifyAdminClient,
  ) {}

  /**
   * Per ogni riga (id locale, id REST della riga Shopify), la sede risolta.
   *
   * ⚠️ Una lettura mancante o fallita non ferma l'import: OGNI riga esce con il
   *    motivo (`permesso_mancante` / `lettura_fallita`), così la protezione
   *    delle quantità resta e l'ordine dice cosa fare.
   */
  async sediDelleRighe(
    tenantId: string,
    shopifyOrderId: string,
    righe: readonly { readonly salesOrderLineId: string; readonly externalLineId: string | null }[],
  ): Promise<ReadonlyMap<string, SedeRigaRisolta>> {
    const esito = new Map<string, SedeRigaRisolta>();
    if (righe.length === 0) {
      return esito;
    }

    let lettura: Awaited<ReturnType<ShopifyGraphqlClient['getFulfillmentOrders']>>;
    try {
      const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
      lettura = await this.shopifyGraphql.getFulfillmentOrders(
        shopDomain,
        accessToken,
        shopifyOrderId,
      );
    } catch (error: unknown) {
      const dettaglio = error instanceof Error ? error.message : String(error);
      lettura = { ok: false, motivo: 'lettura_fallita', dettaglio };
    }

    if (!lettura.ok) {
      this.logger.warn(
        `[${tenantId}] fulfillment order dell'ordine ${shopifyOrderId} non letti (${lettura.motivo}): ${lettura.dettaglio.slice(0, 200)}`,
      );
      const motivo: MotivoRigaSenzaSede = {
        tipo: lettura.motivo,
        dettaglio: lettura.dettaglio,
      };
      for (const riga of righe) {
        esito.set(riga.salesOrderLineId, { motivo });
      }
      return esito;
    }

    const perRiga = sediPerRigaDaFulfillmentOrders(lettura.fulfillmentOrders, righe);
    // La coppia attiva dello storico, come per ogni altra location del canale.
    const sediRisolte = new Map<string, string | null>();
    const risolvi = async (shopifyLocationGid: string): Promise<string | null> => {
      if (!sediRisolte.has(shopifyLocationGid)) {
        sediRisolte.set(
          shopifyLocationGid,
          await resolveShopifyOrderLocationId(this.prisma, tenantId, {
            location_id: shopifyLocationGid,
          }),
        );
      }
      return sediRisolte.get(shopifyLocationGid) ?? null;
    };

    for (const riga of righe) {
      const sede = perRiga.get(riga.salesOrderLineId) ?? { esito: 'in_attesa' as const };
      switch (sede.esito) {
        case 'assegnata': {
          const locationId = await risolvi(sede.shopifyLocationGid);
          esito.set(
            riga.salesOrderLineId,
            locationId
              ? { locationId }
              : {
                  motivo: {
                    tipo: 'location_non_collegata',
                    shopifyLocationGid: sede.shopifyLocationGid,
                    residuoAssegnato: sede.residuo,
                    letturaCompleta: lettura.completa,
                  },
                },
          );
          break;
        }
        case 'divisa':
          esito.set(riga.salesOrderLineId, {
            motivo: { tipo: 'divisa', shopifyLocationGids: sede.shopifyLocationGids },
          });
          break;
        case 'evasa':
          esito.set(riga.salesOrderLineId, { evasa: true });
          break;
        case 'in_attesa':
          esito.set(riga.salesOrderLineId, { motivo: { tipo: 'in_attesa' } });
          break;
      }
    }
    return esito;
  }

  /**
   * L'ORDINE che un webhook `fulfillment_orders/*` riguarda, riletto da Shopify
   * (REST, la stessa forma degli altri import). `null` se il payload non porta
   * un fulfillment order risolvibile: chi chiama lo registra.
   *
   * ⭐ Non si applica il payload del webhook: si REIMPORTA l'ordine intero per la
   *    via di sempre, così assegnazione tardiva e spostamento passano dallo stesso
   *    codice — e dalla stessa idempotenza — dell'aggiornamento d'ordine.
   */
  async ordineDelWebhook(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const { fulfillmentOrderGids, orderId } = fulfillmentOrderGidsDalWebhook(payload);
    if (fulfillmentOrderGids.length === 0 && !orderId) {
      return null;
    }
    const { shopDomain, accessToken } = await this.shopifyOAuth.getAccessToken(tenantId);
    let idOrdine = orderId;
    for (const gid of fulfillmentOrderGids) {
      if (idOrdine) {
        break;
      }
      idOrdine = await this.shopifyGraphql.getOrderIdOfFulfillmentOrder(
        shopDomain,
        accessToken,
        gid,
      );
    }
    if (!idOrdine) {
      return null;
    }
    return this.shopifyAdmin.getOrder(shopDomain, accessToken, idOrdine);
  }
}
