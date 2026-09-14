import { Injectable, Logger } from '@nestjs/common';
import {
  OnlineOrderEventType,
  SalesOrderFinancialStatus,
  SalesOrderFulfillmentStatus,
  SalesOrderRefundKind,
  SalesOrderSource,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

import { variantLabelFromChannel } from '../common/variant-label.util';
import { PrismaService } from '../prisma/prisma.service';
import { OnlineOrderLifecycleService } from '../order-reservations/online-order-lifecycle.service';
import type { ReservationLineInput } from '../order-reservations/stock-reservation.service';
import { ShopifyInventoryPushService } from './shopify-inventory-push.service';
import { ShopifyInventoryReconciliationService } from './shopify-inventory-reconciliation.service';
import { mapShopifyLineDiscountMinor, shopifyLineTotalMinor } from './shopify-line-discount.util';
import { mapShopifyLineVat } from './shopify-line-vat.util';
import { shopifyDecimalToMinor, shopifyGid } from './shopify-money.util';
import { mapShopifyRefunds, type ShopifyRefundKind } from './shopify-refund.util';

/** La util non conosce Prisma: la traduzione dei nomi vive qui. */
const REFUND_KIND_TO_PRISMA: Record<ShopifyRefundKind, SalesOrderRefundKind> = {
  return: SalesOrderRefundKind.return_with_restock,
  refund: SalesOrderRefundKind.refund_only,
  cancellation: SalesOrderRefundKind.cancellation,
};
import { ShopifyConnectionService } from './shopify-connection.service';
import type {
  OrigineAcquisizioneOrdine,
  RigaConfermataAltrove,
  SpedizioneInput,
} from '../order-reservations/online-order-lifecycle.service';
import { extractShopifyOrderGid } from './shopify-order-id.util';
import { quantitaCorrentePerRiga, spedizioniDelPayload } from './shopify-order-righe.util';
import { gidVariante, ShopifyLinkHistoryService } from './shopify-link-history.service';
import { resolveShopifyOrderLocationId } from './shopify-order-location.util';
import {
  motivoSedeNonDeterminabile,
  senzaMotivoSede,
  type MotivoRigaSenzaSede,
} from './shopify-fulfillment-orders.util';
import {
  ShopifyFulfillmentOrdersService,
  type SedeRigaRisolta,
} from './shopify-fulfillment-orders.service';
import { ShopifyProductPullService } from './shopify-product-pull.service';

@Injectable()
export class ShopifySyncService {
  private readonly logger = new Logger(ShopifySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConnection: ShopifyConnectionService,
    private readonly shopifyProductPull: ShopifyProductPullService,
    private readonly onlineOrderLifecycle: OnlineOrderLifecycleService,
    private readonly inventoryReconciliation: ShopifyInventoryReconciliationService,
    private readonly inventoryPush: ShopifyInventoryPushService,
    private readonly storico: ShopifyLinkHistoryService,
    private readonly fulfillmentOrders: ShopifyFulfillmentOrdersService,
  ) {}

  async handleWebhook(tenantId: string, topic: string, payload: unknown): Promise<void> {
    const data = payload as Record<string, unknown>;

    switch (topic) {
      case 'customers/create':
      case 'customers/update':
        await this.applyCustomerFromShopify(tenantId, data);
        break;
      case 'orders/create':
      case 'orders/updated':
      case 'orders/cancelled':
        await this.applyOrderFromShopify(tenantId, data, 'continua');
        break;
      case 'inventory_levels/update':
        await this.applyInventoryLevelFromShopify(
          tenantId,
          String(data.inventory_item_id),
          String(data.location_id),
          Number(data.available),
          'Sync inventario Shopify',
        );
        break;
      case 'products/create':
      case 'products/update':
        await this.shopifyProductPull.importProductFromWebhook(tenantId, data);
        break;
      case 'fulfillment_orders/order_routing_complete':
      case 'fulfillment_orders/moved':
        await this.applyFulfillmentOrderWebhook(tenantId, data);
        break;
      default:
        this.logger.debug(`Webhook Shopify ignorato: ${topic}`);
        return;
    }

    await this.shopifyConnection.touchSync(tenantId);
  }

  /** Allinea un cliente Shopify in locale (webhook o import bulk). */
  async applyCustomerFromShopify(
    tenantId: string,
    customer: Record<string, unknown>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const shopifyId = this.shopifyCustomerId(customer);
    if (!shopifyId) {
      return 'skipped';
    }

    const existing = await this.prisma.customer.findUnique({
      where: { tenantId_shopifyCustomerId: { tenantId, shopifyCustomerId: shopifyId } },
      select: { id: true, partyId: true },
    });

    const address = customer.default_address as Record<string, unknown> | undefined;

    // I dati anagrafici Shopify vivono sul soggetto canonico (Party);
    // il ruolo cliente conserva solo il mapping canale (shopifyCustomerId).
    const partyData = {
      firstName: String(customer.first_name ?? 'Cliente'),
      lastName: String(customer.last_name ?? 'Shopify'),
      email: (customer.email as string | undefined) ?? null,
      phone: (customer.phone as string | undefined) ?? null,
      notes: (customer.note as string | undefined) ?? null,
      addressLine1: (address?.address1 as string | undefined) ?? null,
      addressLine2: (address?.address2 as string | undefined) ?? null,
      city: (address?.city as string | undefined) ?? null,
      province: (address?.province as string | undefined) ?? null,
      postalCode: (address?.zip as string | undefined) ?? null,
      countryCode: (address?.country_code as string | undefined) ?? null,
    };

    if (existing) {
      await this.prisma.party.update({
        where: { id: existing.partyId },
        data: partyData,
      });
      return 'updated';
    }

    await this.prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: { tenantId, ...partyData },
        select: { id: true },
      });
      await tx.customer.create({
        data: { tenantId, partyId: party.id, shopifyCustomerId: shopifyId },
      });
    });

    return 'created';
  }

  /**
   * ⭐ Assegnazione tardiva o SPOSTAMENTO di sede su Shopify (13/09/2026): il
   *    webhook nomina un fulfillment order, non un ordine. Si risale all'ordine
   *    e lo si REIMPORTA per la via di sempre: gli impegni nascono o si spostano
   *    con `syncOrderReservationsTx` — solo `committed`, nessun movimento.
   */
  private async applyFulfillmentOrderWebhook(
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const ordine = await this.fulfillmentOrders.ordineDelWebhook(tenantId, payload);
    if (!ordine) {
      const messaggio =
        'Webhook fulfillment_orders senza un ordine risolvibile: nessun aggiornamento applicato.';
      this.logger.warn(`[${tenantId}] ${messaggio}`);
      await this.shopifyConnection.recordError(
        tenantId,
        messaggio,
        'fulfillment_order_senza_ordine',
      );
      return;
    }
    await this.applyOrderFromShopify(tenantId, ordine, 'continua');
  }

  /** Allinea un ordine Shopify in locale (webhook o import bulk). */
  /**
   * @param acquisizione da dove arriva l’ordine (`docs/27` §5-bis): `continua`
   *   (webhook, recupero) scarica un’evasione anche senza impegno; `pendenti`
   *   (partenza) prende solo impegni; `massiva` («Importa ordini») conserva
   *   il comportamento storico — evaso senza impegno = `not_applied`.
   */
  async applyOrderFromShopify(
    tenantId: string,
    order: Record<string, unknown>,
    acquisizione: OrigineAcquisizioneOrdine = 'massiva',
  ): Promise<'created' | 'updated' | 'skipped'> {
    const shopifyOrderId = this.shopifyOrderId(order);
    if (!shopifyOrderId) {
      return 'skipped';
    }

    const existingBefore = await this.prisma.salesOrder.findFirst({
      where: { tenantId, shopifyOrderId },
      select: { id: true, shopifyUpdatedAt: true },
    });

    // ⭐ Le notifiche arrivano anche FUORI ORDINE e ritentate (Shopify non garantisce
    //    la consegna in sequenza): il payload di quando l'ordine era aperto e non
    //    pagato può arrivare dopo quello evaso. Misurato il 13/09/2026 (percorso 20,
    //    prova 4 sul negozio): il magazzino reggeva, la testata tornava «non evaso»
    //    e «da pagare». Un payload con `updated_at` PIÙ VECCHIO dell'ultimo applicato
    //    non scrive niente; uguale si applica (le riletture dopo
    //    `fulfillment_orders/moved` hanno lo stesso `updated_at`, e una ripetizione
    //    è idempotente). Qui l'uscita anticipata — prima del cliente — e dentro la
    //    transazione il confronto vero, sulla riga bloccata (due notifiche insieme).
    const payloadUpdatedAt = this.shopifyUpdatedAt(order);
    if (
      existingBefore?.shopifyUpdatedAt &&
      payloadUpdatedAt &&
      payloadUpdatedAt < existingBefore.shopifyUpdatedAt
    ) {
      this.logger.log(
        `Ordine ${shopifyOrderId}: notifica del ${payloadUpdatedAt.toISOString()} più vecchia dello stato applicato (${existingBefore.shopifyUpdatedAt.toISOString()}): ignorata`,
      );
      return 'skipped';
    }

    const customer = order.customer as Record<string, unknown> | undefined;
    let customerId: string | null = null;
    const shopifyCustomerId = customer ? this.shopifyCustomerId(customer) : null;
    if (shopifyCustomerId) {
      await this.applyCustomerFromShopify(tenantId, customer!);
      const dbCustomer = await this.prisma.customer.findFirst({
        where: { tenantId, shopifyCustomerId },
        select: { id: true },
      });
      customerId = dbCustomer?.id ?? null;
    }

    const currency = String(order.currency ?? 'EUR');
    const subtotalMinor = shopifyDecimalToMinor(
      String(order.subtotal_price ?? order.total_price ?? '0'),
    );
    const totalMinor = shopifyDecimalToMinor(String(order.total_price ?? '0'));
    const taxMinor = shopifyDecimalToMinor(String(order.total_tax ?? '0'));
    const shippingMinor = this.extractShippingMinor(order);
    const discountMinor = shopifyDecimalToMinor(String(order.total_discounts ?? '0'));
    const placedAt = new Date(String(order.created_at ?? new Date().toISOString()));
    const source = this.mapOrderSource(order);

    const customerName = customer
      ? `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || 'Cliente Shopify'
      : String(order.email ?? 'Cliente occasionale');

    const lines = (order.line_items as Record<string, unknown>[] | undefined) ?? [];

    /*
      ⛔ **Un payload SENZA righe non è un ordine diventato vuoto.**

         `deleteMany` con `externalLineId: { notIn: [...] }` toglie le righe che
         il payload non nomina più. Con `line_items` vuoto o assente quell'elenco
         è `[]` — e **`notIn: []` in Prisma è una condizione SEMPRE VERA**.

      ⭐ **Misurato il 07/09/2026 contro PostgreSQL vero**, non dedotto: due righe
         su due cancellate, `count = 2`. La prova è in
         `shopify-righe-ordine.integration-spec.ts`, scenario 0.

      ⚠️ **Che cosa sarebbe successo.** Un ordine con righe e impegni attivi,
         raggiunto da un payload magro — una risposta troncata, un webhook
         parziale, un errore di serializzazione a monte — perdeva TUTTE le righe.
         Gli impegni venivano poi rilasciati dal dominio, perché
         `emitCanonicalOrderEvents` ricostruisce le righe correnti rileggendole
         dal database: nessuna riga, nessun impegno da tenere. La giacenza
         tornava disponibile per merce già venduta.

      ⭐ **Non si deduce, non si inventa, non si applica**: l'aggiornamento si
         sospende, l'ordine resta com'è, e l'errore si registra sulla connessione
         perché qualcuno lo veda. Un ordine Shopify senza righe non esiste: se il
         payload non ne porta, è il payload a essere incompleto — non l'ordine.
    */
    if (lines.length === 0) {
      const messaggio =
        `Ordine ${shopifyOrderId}: payload senza righe (line_items vuoto o assente). ` +
        'Aggiornamento sospeso: righe e impegni sono stati conservati.';
      this.logger.warn(`[${tenantId}] ${messaggio}`);
      await this.shopifyConnection.recordError(tenantId, messaggio, 'order_payload_senza_righe');
      return 'skipped';
    }

    let savedOrderId: string | null = null;
    // ⭐ Le righe che NON si risolvono perché il collegamento è CHIUSO (12/09/2026):
    //    niente impegno né scarico attraverso cache o SKU; «Da verificare» col
    //    motivo; l'impegno preesistente si conserva (docs/24 §1.14.3).
    const righeChiuse: { readonly externalLineId: string; readonly motivo: string }[] = [];
    const shopId = await this.storico.negozioDelTenant(this.prisma, tenantId);

    let notificaVecchia: { applicato: Date } | null = null;
    await this.prisma.$transaction(async (tx) => {
      if (existingBefore && payloadUpdatedAt) {
        // La riga si blocca QUI: una notifica più vecchia arrivata insieme a quella
        // nuova aspetta il suo commit e poi si confronta col valore che ha scritto.
        const bloccata = await tx.$queryRaw<{ shopify_updated_at: Date | null }[]>`
          SELECT "shopify_updated_at" FROM "sales_orders" WHERE "id" = ${existingBefore.id}::uuid FOR UPDATE`;
        const applicato = bloccata[0]?.shopify_updated_at ?? null;
        if (applicato && payloadUpdatedAt < applicato) {
          notificaVecchia = { applicato };
          return;
        }
      }
      const orderData = {
        orderNumber: String(order.name ?? order.order_number ?? shopifyOrderId),
        ...(payloadUpdatedAt ? { shopifyUpdatedAt: payloadUpdatedAt } : {}),
        source,
        financialStatus: this.mapFinancialStatus(String(order.financial_status ?? 'pending')),
        fulfillmentStatus: this.mapFulfillmentStatus(
          String(order.fulfillment_status ?? 'unfulfilled'),
        ),
        customerId,
        customerName,
        currency,
        subtotalMinor,
        totalMinor,
        taxMinor,
        shippingMinor,
        discountMinor,
        placedAt,
      };

      const saved = existingBefore
        ? await tx.salesOrder.update({
            where: { id: existingBefore.id },
            data: orderData,
          })
        : await tx.salesOrder.create({
            // ⚠️ Qui la sync scriveva uno `fiscalStatus`, e per gli ordini POS
            // scriveva «escluso dal registro». Non lo fa più (16/08/2026):
            // **Shopify POS compare nel Registro Corrispettivi** come vendita
            // fisica/POS, e l'ambito lo dice già `source`, che è un fatto e non
            // uno stato da ricordarsi di aggiornare.
            data: {
              tenantId,
              shopifyOrderId,
              ...orderData,
            },
          });

      // Upsert per riga con id esterno stabile (line_item Shopify): gli id
      // riga VF restano invariati tra webhook, requisito per gli impegni.
      const lineRows = await Promise.all(
        lines.map(async (line, index) => {
          const risolta = await this.resolveVariantId(
            tenantId,
            shopId,
            line.variant_id as number | undefined,
            line.sku as string | undefined,
          );
          const variantId = risolta.variantId;
          if (risolta.motivo) {
            righeChiuse.push({
              externalLineId: line.id != null ? String(line.id) : `pos-${index}`,
              motivo: `Riga «${String(line.sku ?? line.title ?? index)}»: ${risolta.motivo} Nessun impegno né scarico; nessun riaggancio automatico.`,
            });
          }
          const unitMinor = shopifyDecimalToMinor(String(line.price ?? '0'));
          const qty = Number(line.quantity ?? 0);
          const discountMinor = mapShopifyLineDiscountMinor(line);
          const vat = mapShopifyLineVat(line);
          return {
            externalLineId: line.id != null ? String(line.id) : `pos-${index}`,
            variantId,
            sku: String(line.sku ?? '—'),
            title: String(line.title ?? line.name ?? 'Riga ordine'),
            // ⭐ L'etichetta della variante arriva GIA' COMPOSTA dal canale, ed
            // era il dato che si buttava: `variant_title` è «M / Rosso», e per
            // un prodotto senza opzioni è `Default Title` — filtrato a vuoto.
            // Si fotografa qui perché la variante può uscire dal catalogo
            // mentre l'ordine resta.
            variantLabel: variantLabelFromChannel(line.variant_title),
            quantity: qty,
            // Prezzo PIENO e totale EFFETTIVO, entrambi veri: la loro differenza
            // è lo sconto allocato dal canale, esatta al centesimo. Prima si
            // scriveva il prezzo pieno anche come totale e lo sconto si buttava,
            // così le righe non facevano il totale dell'ordine — 120,00 € di
            // righe su un ordine da 104,00 (registro difetti 3.9).
            unitPriceMinor: unitMinor,
            totalMinor: shopifyLineTotalMinor(unitMinor, qty, discountMinor),
            // L'IVA della riga come la dichiara il canale. Prima si buttava, e
            // a valle veniva ricostruita ripartendo l'imposta dell'ordine in
            // proporzione al valore: il totale tornava, ogni riga era sbagliata
            // (registro difetti 3.12 — 6,22 € su una riga la cui imposta vera
            // è 2,31). Il dato c'era, e ora si conserva.
            lineVatTotalMinor: vat.taxMinor,
            vatSnapshot: vat.snapshot ?? Prisma.DbNull,
          };
        }),
      );

      // Rimuove righe non più presenti (o legacy senza id esterno): gli
      // eventuali impegni collegati diventano orfani e verranno rilasciati
      // dal dominio, mai cancellati silenziosamente.
      await tx.salesOrderLine.deleteMany({
        where: {
          orderId: saved.id,
          OR: [
            { externalLineId: null },
            { externalLineId: { notIn: lineRows.map((row) => row.externalLineId) } },
          ],
        },
      });

      for (const row of lineRows) {
        await tx.salesOrderLine.upsert({
          where: {
            orderId_externalLineId: { orderId: saved.id, externalLineId: row.externalLineId },
          },
          create: { orderId: saved.id, ...row },
          update: {
            // ⛔ `variantLabel` NON si riscrive: la riga esiste già e la sua
            // etichetta è la fotografia di quando è stata creata. Un line item
            // Shopify non cambia variante — si cancella e se ne crea un altro
            // con un id nuovo, e quello passa dal ramo `create`.
            variantId: row.variantId,
            sku: row.sku,
            title: row.title,
            quantity: row.quantity,
            unitPriceMinor: row.unitPriceMinor,
            totalMinor: row.totalMinor,
            lineVatTotalMinor: row.lineVatTotalMinor,
            vatSnapshot: row.vatSnapshot,
          },
        });
      }

      await this.persistRefunds(tx, tenantId, saved.id, currency, placedAt, order);

      savedOrderId = saved.id;
    });
    if (notificaVecchia) {
      this.logger.log(
        `Ordine ${shopifyOrderId}: notifica del ${payloadUpdatedAt!.toISOString()} più vecchia dello stato applicato (${(notificaVecchia as { applicato: Date }).applicato.toISOString()}): ignorata`,
      );
      return 'skipped';
    }

    if (savedOrderId) {
      await this.emitCanonicalOrderEvents(tenantId, savedOrderId, shopifyOrderId, order, {
        isNew: !existingBefore,
        acquisizione,
        righeChiuse: righeChiuse.map((r) => r.externalLineId),
      });
      if (righeChiuse.length > 0) {
        await this.segnalaRigheChiuse(tenantId, savedOrderId, righeChiuse);
      }
    }

    // Nessun documento nasce dalla sincronizzazione: DDT/fattura si generano a
    // mano dalla schermata ordine, quando l'operatore lo decide. La sync muove
    // solo impegni ed evasione (emitCanonicalOrderEvents sopra).
    return existingBefore ? 'updated' : 'created';
  }

  /** L'`updated_at` del payload, se c'è ed è una data valida; altrimenti null (non si giudica). */
  private shopifyUpdatedAt(order: Record<string, unknown>): Date | null {
    if (typeof order.updated_at !== 'string' || !order.updated_at) {
      return null;
    }
    const data = new Date(order.updated_at);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  /**
   * Rettifiche economiche del canale (specifica 08 §4).
   *
   * Il rimborso dice quanto torna al cliente, non se la merce rientra: la
   * quantità la muovono gli eventi `restocked`, che nascono dal `restock_type`
   * di riga ed è una decisione indipendente da questa. Qui si scrive solo il
   * denaro, con la data in cui la rettifica è avvenuta — è quella che il
   * registro corrispettivi deve usare, non la data dell'ordine.
   *
   * Idempotente per costruzione: lo stesso ordine torna a ogni webhook coi
   * rimborsi già visti dentro, e l'unicità (tenant, id rimborso del canale)
   * impedisce di contare due volte la stessa rettifica.
   */
  private async persistRefunds(
    tx: Prisma.TransactionClient,
    tenantId: string,
    salesOrderId: string,
    currency: string,
    placedAt: Date,
    order: Record<string, unknown>,
  ): Promise<void> {
    // Le righe d'ordine per id remoto: la riga rimborsata si aggancia a quella.
    const righeOrdine = await tx.salesOrderLine.findMany({
      where: { orderId: salesOrderId, externalLineId: { not: null } },
      select: { id: true, externalLineId: true },
    });
    const rigaPerIdRemoto = new Map(righeOrdine.map((r) => [String(r.externalLineId), r.id]));
    for (const row of mapShopifyRefunds(order, placedAt)) {
      const { externalRefundId, taxLines, lines, kind, ...data } = row;
      const saved = await tx.salesOrderRefund.upsert({
        where: { tenantId_externalRefundId: { tenantId, externalRefundId } },
        create: {
          tenantId,
          salesOrderId,
          externalRefundId,
          currency,
          kind: REFUND_KIND_TO_PRISMA[kind],
          ...data,
        },
        update: { currency, kind: REFUND_KIND_TO_PRISMA[kind], ...data },
        select: { id: true },
      });

      // ⭐ Le RIGHE rimborsate, per quantità: la fonte delle annullate (`cancel`),
      //    delle rese e delle solo-denaro. Riscritte per intero come le aliquote:
      //    lo stesso rimborso torna a ogni webhook, e il canale è la verità.
      await tx.salesOrderRefundLine.deleteMany({ where: { refundId: saved.id } });
      if (lines.length > 0) {
        await tx.salesOrderRefundLine.createMany({
          data: lines.map((line) => ({
            tenantId,
            refundId: saved.id,
            salesOrderLineId: rigaPerIdRemoto.get(line.externalLineId) ?? null,
            externalLineId: line.externalLineId,
            quantity: line.quantity,
            restockType: line.restockType,
            subtotalMinor: line.subtotalMinor,
            taxMinor: line.taxMinor,
          })),
        });
      }

      // La scomposizione si riscrive per intero: è derivata, e ricalcolarla
      // costa meno che riconciliarla riga per riga.
      await tx.salesOrderRefundTaxLine.deleteMany({ where: { refundId: saved.id } });
      if (taxLines.length > 0) {
        await tx.salesOrderRefundTaxLine.createMany({
          data: taxLines.map((line) => ({
            refundId: saved.id,
            ratePercent: line.ratePercent,
            taxableMinor: line.taxableMinor,
            taxMinor: line.taxMinor,
          })),
        });
      }
    }

    // ⭐ La testata SOMMA le proprie rettifiche, come somma le righe (`totalMinor`):
    //    è ciò che rende «Rettifiche» ordinabile su un elenco paginato dal server.
    //    Il totale aggiornato lo genera il database (`current_total_minor`), non
    //    si scrive. Si somma dal persistito, non dal payload: lo stesso rimborso
    //    torna a ogni webhook e la somma deve valere anche quando il payload ne
    //    porta uno solo.
    const somma = await tx.salesOrderRefund.aggregate({
      where: { salesOrderId },
      _sum: { totalMinor: true },
    });
    await tx.salesOrder.update({
      where: { id: salesOrderId },
      data: { refundTotalMinor: somma._sum.totalMinor ?? 0 },
    });
  }

  /**
   * Traduzione connettore → eventi canonici ONLINE_ORDER_* (§8 fase 1).
   * Il dominio quantità (impegni, rilasci, evasioni) non conosce i payload
   * Shopify: riceve solo eventi interni normalizzati e idempotenti.
   */
  private async emitCanonicalOrderEvents(
    tenantId: string,
    salesOrderId: string,
    shopifyOrderId: string,
    order: Record<string, unknown>,
    context: {
      readonly isNew: boolean;
      readonly acquisizione: OrigineAcquisizioneOrdine;
      /** `externalLineId` delle righe non risolte per collegamento chiuso. */
      readonly righeChiuse?: readonly string[];
    },
  ): Promise<void> {
    const channel = this.mapOrderSource(order);
    const base = {
      tenantId,
      channel,
      salesOrderId,
      externalOrderId: shopifyOrderId,
      acquisizione: context.acquisizione,
    } as const;

    const savedLines = await this.prisma.salesOrderLine.findMany({
      where: { orderId: salesOrderId },
      select: { id: true, variantId: true, sku: true, quantity: true, externalLineId: true },
    });
    // ⭐ L'impegno segue la quantità CORRENTE della riga, non quella ordinata:
    //    dopo un annullamento parziale (`restock_type = 'cancel'`, merce mai
    //    partita) resta da spedire di meno, e `syncOrderReservationsTx` adegua
    //    l'impegno — a zero, lo rilascia. La riga d'ordine resta com'è: il
    //    valore economico è già rettificato dal rimborso (`sales_order_refunds`).
    const correnti = quantitaCorrentePerRiga(order);
    const quantitaDaImpegnare = (line: (typeof savedLines)[number]): number =>
      (line.externalLineId ? correnti.get(line.externalLineId) : undefined) ?? line.quantity;
    const reservationLines: ReservationLineInput[] = savedLines.flatMap((line) => {
      const quantity = quantitaDaImpegnare(line);
      return line.variantId && quantity > 0
        ? [
            {
              salesOrderLineId: line.id,
              variantId: line.variantId,
              sku: line.sku,
              quantity,
              externalLineRef: line.externalLineId,
            },
          ]
        : [];
    });

    const righeChiuse = savedLines
      .filter((line) => line.externalLineId && context.righeChiuse?.includes(line.externalLineId))
      .map((line) => line.id);

    const cancelledAtRaw =
      typeof order.cancelled_at === 'string' && order.cancelled_at ? order.cancelled_at : null;
    const financial = this.mapFinancialStatus(String(order.financial_status ?? 'pending'));
    const fulfillment = this.mapFulfillmentStatus(
      String(order.fulfillment_status ?? 'unfulfilled'),
    );
    const ordineAperto =
      !cancelledAtRaw &&
      financial !== SalesOrderFinancialStatus.voided &&
      fulfillment !== SalesOrderFulfillmentStatus.fulfilled;

    // ⭐ La sede degli impegni è PER RIGA e viene dai FULFILLMENT ORDER di Shopify
    //    (13/09/2026, `DA-FARE` §10e.7-bis): si legge SEMPRE per un ordine aperto
    //    con righe da impegnare — anche se il payload porta `location_id`, che
    //    non dice dove Shopify farà evadere. Una riga irrisolta (assegnazione in
    //    attesa, location non collegata, riga divisa, lettura mancante) NON
    //    ricade sulla sede dell'ordine: niente nasce e l'ordine dice l'azione.
    //    ⛔ Nessuna sede indovinata (B7). L'impegno che aveva si conserva —
    //    tranne se una lettura COMPLETA conferma che tutta la quantità residua
    //    sta in una location non collegata: allora è candidata al RILASCIO, e
    //    la decisione sulla quantità la prende il ciclo di vita (13/09/2026).
    const sediRighe: ReadonlyMap<string, SedeRigaRisolta> =
      ordineAperto && reservationLines.length > 0
        ? await this.fulfillmentOrders.sediDelleRighe(
            tenantId,
            shopifyOrderId,
            reservationLines.map((line) => ({
              salesOrderLineId: line.salesOrderLineId,
              externalLineId: line.externalLineRef ?? null,
            })),
          )
        : new Map();
    const righeConSede: ReservationLineInput[] = [];
    const righeIrrisolte: string[] = [];
    const righeDaRilasciare: RigaConfermataAltrove[] = [];
    const motivi: MotivoRigaSenzaSede[] = [];
    for (const line of reservationLines) {
      const sede = sediRighe.get(line.salesOrderLineId);
      if (sede && 'locationId' in sede) {
        righeConSede.push({ ...line, locationId: sede.locationId });
        continue;
      }
      if (sede && 'motivo' in sede) {
        motivi.push(sede.motivo);
        if (sede.motivo.tipo === 'location_non_collegata' && sede.motivo.letturaCompleta) {
          righeDaRilasciare.push({
            salesOrderLineId: line.salesOrderLineId,
            quantity: line.quantity,
            residuoAssegnatoAltrove: sede.motivo.residuoAssegnato,
          });
          continue;
        }
      }
      righeIrrisolte.push(line.salesOrderLineId);
    }
    await this.aggiornaMotivoSede(tenantId, base.salesOrderId, motivi);

    // updated_at distingue aggiornamenti reali dai retry dello stesso webhook.
    const updatedSuffix =
      typeof order.updated_at === 'string' && order.updated_at
        ? order.updated_at
        : String(Date.now());

    // ⭐ Un'assegnazione o uno spostamento nel fulfillment order NON cambiano
    //    `updated_at` dell'ordine: senza le sedi nella chiave, la rilettura dopo
    //    `fulfillment_orders/moved` sarebbe scartata come doppione dello stesso
    //    webhook (misurato sul percorso 16). Le spedizioni tengono la loro chiave.
    const improntaSedi = righeConSede
      .map((line) => `${line.salesOrderLineId}=${line.locationId}`)
      .sort()
      .join(',');
    await this.onlineOrderLifecycle.handle({
      ...base,
      type: context.isNew
        ? OnlineOrderEventType.online_order_created
        : OnlineOrderEventType.online_order_updated,
      dedupeSuffix: context.isNew ? undefined : `${updatedSuffix}|sedi:${improntaSedi}`,
      // ⛔ Nessuna sede d'ordine come ripiego: ogni riga porta la sua.
      locationId: null,
      lines: righeConSede,
      righeDaConservare: [...righeChiuse, ...righeIrrisolte],
      righeDaRilasciare,
    });

    // ⭐ Le SPEDIZIONI, una per `fulfillment` riuscito, PRIMA dello stato finale:
    //    ognuna scarica la sua sede e consuma l'impegno per quanto è uscito.
    //    Ripetibile per versione del payload: gli effetti sono idempotenti riga
    //    per riga, così una riga rimasta senza sede si riprova quando la
    //    location viene collegata.
    for (const spedizione of await this.spedizioniDelPayload(tenantId, order, savedLines)) {
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_shipped,
        dedupeSuffix: `${spedizione.externalFulfillmentId}:${updatedSuffix}`,
        occurredAt: spedizione.shippedAt,
        spedizione,
      });
    }

    if (cancelledAtRaw || financial === SalesOrderFinancialStatus.voided) {
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_cancelled,
        occurredAt: cancelledAtRaw ? new Date(cancelledAtRaw) : undefined,
      });
    } else if (fulfillment === SalesOrderFulfillmentStatus.fulfilled) {
      const fulfillmentInfo = this.extractFulfillmentInfo(order);
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_fulfilled,
        occurredAt: fulfillmentInfo.occurredAt,
        externalFulfillmentId: fulfillmentInfo.externalFulfillmentId,
        // La sede dell'USCITA: la location delle evasioni nel payload, collegata.
        locationId: await resolveShopifyOrderLocationId(this.prisma, tenantId, order),
      });
    } else if (fulfillment === SalesOrderFulfillmentStatus.partially_fulfilled) {
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_partially_fulfilled,
      });
    }

    if (financial === SalesOrderFinancialStatus.refunded) {
      await this.onlineOrderLifecycle.handle({
        ...base,
        type: OnlineOrderEventType.online_order_refunded,
      });
    }

    // Restock REALE (fase 2 §8): solo refund line con restock fisico dichiarato
    // dal canale. Il solo stato "rimborsato" NON genera mai carichi.
    await this.emitRestockEvents(base, order, savedLines);
  }

  /**
   * Eventi canonici `online_order_restocked` dai rimborsi Shopify con
   * `restock_type` fisico (`return`/`legacy_restock`). Un evento per
   * rimborso × location, idempotente via dedupe suffix (id refund + location).
   *
   * **«Rimborso» qui è il contenitore, non il significato.** Elaborando un
   * RESO, Shopify crea comunque un `refunds[]` — anche da ZERO euro, quando
   * l'ordine non era stato incassato — e ci mette dentro `restock_type: return`.
   * È così che il rientro della merce arriva a VestiFlow: non dai topic
   * `returns/*`, che non sono registrati, ma incartato in un rimborso.
   * Misurato il 14/08/2026 su un ordine in sospeso reso per intero.
   *
   * `cancel` è escluso, ed è corretto — **verificato il 14/08/2026**, non più
   * solo assunto: annullando un ordine non evaso con la ricarica attiva,
   * Shopify libera l'impegno e NON ricarica la giacenza (`available` da −2 a
   * −1, non a 0). La merce non era mai uscita, quindi non c'è nulla da far
   * rientrare. E un ordine già evaso su Shopify non si annulla affatto.
   */
  private async emitRestockEvents(
    base: {
      readonly tenantId: string;
      readonly channel: SalesOrderSource;
      readonly salesOrderId: string;
      readonly externalOrderId: string;
    },
    order: Record<string, unknown>,
    savedLines: readonly {
      id: string;
      variantId: string | null;
      sku: string;
      quantity: number;
      externalLineId: string | null;
    }[],
  ): Promise<void> {
    const refunds = Array.isArray(order.refunds)
      ? (order.refunds as Record<string, unknown>[])
      : [];
    if (refunds.length === 0) {
      return;
    }

    const lineByExternalId = new Map(
      savedLines
        .filter((line) => line.externalLineId !== null)
        .map((line) => [line.externalLineId as string, line]),
    );

    for (const refund of refunds) {
      const refundId = refund.id != null ? String(refund.id) : null;
      const refundLineItems = Array.isArray(refund.refund_line_items)
        ? (refund.refund_line_items as Record<string, unknown>[])
        : [];
      if (!refundId || refundLineItems.length === 0) {
        continue;
      }

      // Raggruppa per location Shopify: un evento restock per location.
      const byShopifyLocation = new Map<string, ReservationLineInput[]>();
      for (const item of refundLineItems) {
        const restockType = typeof item.restock_type === 'string' ? item.restock_type : '';
        if (restockType !== 'return' && restockType !== 'legacy_restock') {
          continue;
        }
        const quantity = Number(item.quantity ?? 0);
        const externalLineId = item.line_item_id != null ? String(item.line_item_id) : null;
        const shopifyLocationId = item.location_id != null ? String(item.location_id) : '';
        if (!externalLineId || quantity <= 0) {
          continue;
        }
        const orderLine = lineByExternalId.get(externalLineId);
        if (!orderLine?.variantId) {
          continue;
        }
        const group = byShopifyLocation.get(shopifyLocationId) ?? [];
        group.push({
          salesOrderLineId: orderLine.id,
          variantId: orderLine.variantId,
          sku: orderLine.sku,
          quantity,
          externalLineRef: externalLineId,
        });
        byShopifyLocation.set(shopifyLocationId, group);
      }

      const occurredAtRaw =
        typeof refund.processed_at === 'string'
          ? refund.processed_at
          : typeof refund.created_at === 'string'
            ? refund.created_at
            : null;

      for (const [shopifyLocationId, lines] of byShopifyLocation) {
        // ⭐ §30.8-bis (12/09/2026): la sede di rientro è quella che Shopify dichiara
        //    per riga (`refund_line_items[].location_id`), risolta dal collegamento
        //    ESPLICITO — coppia attiva, poi colonna-cache — come per gli ordini.
        //    Nessun ripiego: non collegata o assente → nessun carico, e si segnala.
        const locationId = shopifyLocationId
          ? await resolveShopifyOrderLocationId(this.prisma, base.tenantId, {
              location_id: shopifyLocationId,
            })
          : null;
        const esito = await this.onlineOrderLifecycle.handle({
          ...base,
          type: OnlineOrderEventType.online_order_restocked,
          dedupeSuffix: `${refundId}:${shopifyLocationId || 'default'}`,
          occurredAt: occurredAtRaw ? new Date(occurredAtRaw) : undefined,
          locationId,
          lines,
        });
        if (esito === 'not_applied') {
          this.logger.warn(
            `Reso senza sede di rientro determinabile (${base.tenantId}, ordine ${base.externalOrderId}, ` +
              `location Shopify «${shopifyLocationId || 'assente'}»): nessun carico, ordine da verificare.`,
          );
        }
      }
    }
  }

  /**
   * ⭐ Le spedizioni del payload (12/09/2026), una per `fulfillment` riuscito:
   *    la sede si risolve dal collegamento esplicito (coppia attiva, poi cache —
   *    mai il nome), una volta per location remota; le righe si agganciano alle
   *    righe d'ordine salvate per `externalLineId`. Una riga non risolta
   *    (collegamento chiuso) viaggia con `variantId: null`: chi consuma lo dice.
   */
  private async spedizioniDelPayload(
    tenantId: string,
    order: Record<string, unknown>,
    savedLines: readonly {
      readonly id: string;
      readonly variantId: string | null;
      readonly sku: string;
      readonly externalLineId: string | null;
    }[],
  ): Promise<SpedizioneInput[]> {
    const remote = spedizioniDelPayload(order);
    if (remote.length === 0) {
      return [];
    }
    const perExternalId = new Map(
      savedLines.flatMap((line) => (line.externalLineId ? [[line.externalLineId, line]] : [])),
    );
    const sediRisolte = new Map<string, string | null>();
    const risolvi = async (shopifyLocationId: string): Promise<string | null> => {
      if (!sediRisolte.has(shopifyLocationId)) {
        sediRisolte.set(
          shopifyLocationId,
          await resolveShopifyOrderLocationId(this.prisma, tenantId, {
            location_id: shopifyLocationId,
          }),
        );
      }
      return sediRisolte.get(shopifyLocationId) ?? null;
    };
    const spedizioni: SpedizioneInput[] = [];
    for (const remota of remote) {
      const righe = remota.righe.flatMap((riga) => {
        const line = perExternalId.get(riga.externalLineId);
        return line
          ? [
              {
                salesOrderLineId: line.id,
                variantId: line.variantId,
                sku: line.sku,
                quantity: riga.quantity,
              },
            ]
          : [];
      });
      if (righe.length === 0) {
        continue;
      }
      spedizioni.push({
        externalFulfillmentId: remota.externalFulfillmentId,
        shopifyLocationId: remota.shopifyLocationId,
        locationId: remota.shopifyLocationId ? await risolvi(remota.shopifyLocationId) : null,
        shippedAt: remota.createdAt ?? new Date(),
        righe,
      });
    }
    return spedizioni;
  }

  /**
   * Il segmento «Sede non determinabile» del «Da verificare»: si SCRIVE (con
   * l'azione) quando una riga aperta è irrisolta, si TOGLIE quando non ce ne
   * sono più — è il segmento che tiene ferma la quantità verso Shopify
   * (`shopify-ordini-senza-sede.util`), quindi deve sparire quando la sede
   * arriva, o la protezione non si scioglierebbe mai. Gli altri motivi restano;
   * se non ne resta nessuno, l'ordine non è più «Da verificare».
   */
  private async aggiornaMotivoSede(
    tenantId: string,
    salesOrderId: string,
    motivi: readonly MotivoRigaSenzaSede[],
  ): Promise<void> {
    const ordine = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId },
      select: { reviewReason: true, requiresReview: true },
    });
    if (!ordine) {
      return;
    }
    const residuo = senzaMotivoSede(ordine.reviewReason);
    if (motivi.length === 0) {
      if (!residuo.cambiato) {
        return;
      }
      await this.prisma.salesOrder.updateMany({
        where: { id: salesOrderId, tenantId },
        data: {
          reviewReason: residuo.reviewReason,
          requiresReview: residuo.reviewReason !== null,
        },
      });
      return;
    }
    const motivo = motivoSedeNonDeterminabile(motivi);
    const nuovo = [residuo.reviewReason, motivo].filter(Boolean).join(' · ');
    if (ordine.requiresReview && ordine.reviewReason === nuovo) {
      return;
    }
    await this.prisma.salesOrder.updateMany({
      where: { id: salesOrderId, tenantId },
      data: { requiresReview: true, reviewReason: nuovo },
    });
  }

  /** «Da verificare» per le righe col collegamento chiuso, accodato a ciò che c'è. */
  private async segnalaRigheChiuse(
    tenantId: string,
    salesOrderId: string,
    righe: readonly { readonly motivo: string }[],
  ): Promise<void> {
    const ordine = await this.prisma.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId },
      select: { reviewReason: true },
    });
    const presente = ordine?.reviewReason ?? '';
    const nuovi = righe.map((r) => r.motivo).filter((m) => !presente.includes(m));
    if (nuovi.length === 0 && presente) {
      return;
    }
    await this.prisma.salesOrder.updateMany({
      where: { id: salesOrderId, tenantId },
      data: {
        requiresReview: true,
        reviewReason: [presente, ...nuovi].filter(Boolean).join(' · '),
      },
    });
  }

  /**
   * Data e id evasione dal payload ordine: il PRIMO fulfillment, com'è dal
   * 14/08/2026.
   *
   * ⚠️ Con più spedizioni la «data di evasione» — che i documenti assegnano alla
   *    Vendita e al registro corrispettivi insieme (`docs/08`, `docs/10`) — non è
   *    definita da nessuna regola scritta: prima o ultima evasione è una
   *    DECISIONE del proprietario (`DA-FARE` §30.8), non una deduzione tecnica.
   *    ⛔ Il 12/09/2026 era stata spostata all'ultima e poi RIMESSA com'era:
   *    le date commerciali non si cambiano senza la regola.
   */
  private extractFulfillmentInfo(order: Record<string, unknown>): {
    occurredAt: Date | undefined;
    externalFulfillmentId: string | null;
  } {
    const fulfillments = order.fulfillments as Record<string, unknown>[] | undefined;
    const first = fulfillments?.[0];
    if (!first) {
      return { occurredAt: undefined, externalFulfillmentId: null };
    }
    const createdAt = typeof first.created_at === 'string' ? new Date(first.created_at) : undefined;
    const externalId =
      typeof first.admin_graphql_api_id === 'string'
        ? first.admin_graphql_api_id
        : first.id != null
          ? String(first.id)
          : null;
    return { occurredAt: createdAt, externalFulfillmentId: externalId };
  }

  /**
   * Riconcilia un valore `available` osservato su Shopify (webhook o import bulk).
   * NON sovrascrive Giacenza/Impegnata/Disponibile VestiFlow (policy post-audit §6).
   */
  async applyInventoryLevelFromShopify(
    tenantId: string,
    shopifyInventoryItemId: string,
    shopifyLocationId: string,
    available: number,
    _reason: string,
  ): Promise<'created' | 'updated' | 'unchanged' | 'skipped'> {
    const outcome = await this.inventoryReconciliation.reconcileFromShopifyWebhook(
      tenantId,
      shopifyInventoryItemId,
      shopifyLocationId,
      available,
    );

    if (outcome === 'mismatch_republish') {
      const variant = await this.prisma.productVariant.findFirst({
        where: { tenantId, shopifyInventoryItemId },
        select: { id: true },
      });
      const location = await this.prisma.location.findFirst({
        where: { tenantId, shopifyLocationId },
        select: { id: true },
      });
      if (variant && location) {
        void this.inventoryPush
          .pushLevel(tenantId, variant.id, location.id)
          .catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : 'Ripubblicazione inventario fallita';
            this.logger.warn(`Caso D ripubblicazione (${tenantId}): ${message}`);
          });
      }
      return 'updated';
    }

    switch (outcome) {
      case 'reconciled':
      case 'echo_confirmed':
        return 'unchanged';
      case 'deferred':
        return 'skipped';
      default:
        return 'skipped';
    }
  }

  /**
   * La variante locale di una riga d'ordine: per id remoto (cache), poi per SKU.
   *
   * ⭐ **Lo storico decide** (12/09/2026): trovata la candidata, se il collegamento
   *    con quel GID è CHIUSO, l'identità è eliminata o il GID è di un'altra
   *    variante, la riga NON si risolve — né dalla cache né dallo SKU, che
   *    ricondurrebbero alla stessa variante aggirando la chiusura. Il motivo
   *    torna al chiamante, che segnala l'ordine. Senza negozio migrato o senza
   *    id remoto (righe custom), la ricerca resta com'era.
   */
  private async resolveVariantId(
    tenantId: string,
    shopId: string | null,
    shopifyVariantId?: number,
    sku?: string,
  ): Promise<{ readonly variantId: string | null; readonly motivo?: string }> {
    let candidata: { id: string } | null = null;
    if (shopifyVariantId != null) {
      candidata = await this.prisma.productVariant.findFirst({
        where: { tenantId, shopifyVariantId: String(shopifyVariantId) },
        select: { id: true },
      });
    }
    if (!candidata && sku) {
      candidata = await this.prisma.productVariant.findFirst({
        where: { tenantId, sku },
        select: { id: true },
      });
    }
    if (!candidata) {
      return { variantId: null };
    }
    if (shopId && shopifyVariantId != null) {
      const uso = await this.storico.collegamentoUsabileVariante(this.prisma, {
        shopId,
        shopifyVariantGid: gidVariante(shopifyVariantId),
        variantId: candidata.id,
      });
      if (uso.tipo !== 'utilizzabile') {
        return { variantId: null, motivo: uso.motivo };
      }
    }
    return { variantId: candidata.id };
  }

  private shopifyCustomerId(customer: Record<string, unknown>): string | null {
    if (typeof customer.admin_graphql_api_id === 'string') {
      return customer.admin_graphql_api_id;
    }
    if (customer.id != null) {
      return shopifyGid('Customer', String(customer.id));
    }
    return null;
  }

  // La normalizzazione dell'id vive in un util condiviso: la usa anche il
  // confronto con l'elenco remoto che scopre gli ordini cancellati, e le due
  // DEVONO coincidere.
  private shopifyOrderId(order: Record<string, unknown>): string | null {
    return extractShopifyOrderGid(order);
  }

  private mapOrderSource(order: Record<string, unknown>): SalesOrderSource {
    const source = String(order.source_name ?? '').toLowerCase();
    return source === 'pos' ? SalesOrderSource.shopify_pos : SalesOrderSource.shopify_online;
  }

  private extractShippingMinor(order: Record<string, unknown>): number {
    const shippingSet = order.total_shipping_price_set as
      { shop_money?: { amount?: string } } | undefined;
    if (shippingSet?.shop_money?.amount != null) {
      return shopifyDecimalToMinor(String(shippingSet.shop_money.amount));
    }
    return shopifyDecimalToMinor(String(order.total_shipping ?? '0'));
  }

  private mapFinancialStatus(status: string): SalesOrderFinancialStatus {
    switch (status) {
      case 'paid':
        return SalesOrderFinancialStatus.paid;
      case 'partially_refunded':
        return SalesOrderFinancialStatus.partially_refunded;
      case 'refunded':
        return SalesOrderFinancialStatus.refunded;
      case 'voided':
        return SalesOrderFinancialStatus.voided;
      case 'authorized':
        return SalesOrderFinancialStatus.authorized;
      case 'pending':
      default:
        return SalesOrderFinancialStatus.pending;
    }
  }

  private mapFulfillmentStatus(status: string): SalesOrderFulfillmentStatus {
    switch (status) {
      case 'partial':
      case 'partially_fulfilled':
        return SalesOrderFulfillmentStatus.partially_fulfilled;
      case 'fulfilled':
        return SalesOrderFulfillmentStatus.fulfilled;
      case 'unfulfilled':
      default:
        return SalesOrderFulfillmentStatus.unfulfilled;
    }
  }
}
