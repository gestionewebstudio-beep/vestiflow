import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
// `ShopifySyncStatus` serviva ad archiveShopifyLocation, rimossa con la pulizia
// per sede: la purga non tocca piu` le sedi, quindi non ne cambia lo stato.
import { Prisma, SupplierOrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { isShopifyManagedImportLocation } from './shopify-location-import.util';
import type { PurgeShopifyDataDto } from './dto/purge-shopify-data.dto';

const OPEN_SUPPLIER_ORDER_STATUSES: readonly SupplierOrderStatus[] = [
  SupplierOrderStatus.confirmed,
];

export interface ShopifyShopChangeBlocker {
  readonly code: 'supplier_orders_open';
  readonly message: string;
  readonly references: readonly {
    readonly type: 'supplier_order';
    readonly id: string;
    readonly reference: string;
  }[];
}

export interface ShopifyShopChangePreview {
  readonly currentShopDomain: string | null;
  readonly counts: {
    readonly shopifyProducts: number;
    readonly shopifyVariants: number;
    readonly shopifyCustomers: number;
    readonly shopifySalesOrders: number;
    readonly inventoryLevels: number;
    readonly stockMovements: number;
    readonly shopifyLinkedLocations: number;
    readonly removableShopifyLocations: number;
  };
  readonly blockers: readonly ShopifyShopChangeBlocker[];
}

export interface ShopifyShopChangePurgeResult {
  readonly purged: {
    readonly products: number;
    readonly customers: number;
    readonly salesOrders: number;
    readonly stockMovements: number;
    readonly inventoryLevels: number;
    readonly inventoryCountLines: number;
    readonly locations: number;
  };
}

@Injectable()
export class ShopifyShopChangeService {
  private readonly logger = new Logger(ShopifyShopChangeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async preview(tenantId: string): Promise<ShopifyShopChangePreview> {
    const currentShopDomain = await this.resolveCurrentShopDomain(tenantId);
    const shopifyVariantIds = await this.listShopifyLinkedVariantIds(tenantId);
    const counts = await this.countShopifyData(tenantId, shopifyVariantIds);
    const blockers = await this.findBlockers(tenantId, shopifyVariantIds);

    return {
      currentShopDomain,
      counts,
      blockers,
    };
  }

  /**
   * ⛔ **SOSPESA per intero, per ogni combinazione** — `docs/24` §1.14.
   *
   * Nessuna funzione Shopify elimina clienti o ordini VestiFlow: puo' chiudere
   * o sospendere il collegamento. L'eliminazione locale e' una funzione
   * VestiFlow separata e controllata.
   *
   * ⚠️ **Vale anche per l'ordine che non ha ancora generato un documento**
   *    (§1.14.2). E' il caso che sembra innocuo — «non e' ancora diventato
   *    niente» — ed e' quello in cui la cancellazione sembra piu' giustificabile.
   *
   * ⭐ **Il rifiuto e' la PRIMA istruzione**: prima della conferma del dominio,
   *    prima di leggere il database, prima di aprire la transazione. Un rifiuto
   *    che arrivasse dopo una lettura sarebbe gia' un percorso che «entra» nella
   *    purga, e dovrebbe garantire di uscirne senza aver scritto: rifiutare in
   *    testa toglie la domanda.
   *
   * ⚠️ **Che cosa c'era qui, e perche' non torna in questa forma.**
   *
   *    `purgeCatalog` cancellava prodotti collegati, giacenze, movimenti e
   *    righe di conteggio. Il 03/09/2026 un tenant ha perso TUTTE le giacenze e
   *    TUTTI i movimenti: 48 righe documento con la spunta magazzino sono
   *    rimaste senza il loro effetto.
   *
   *    `purgeOrders` faceva `salesOrder.deleteMany`, e
   *    `StockReservation.order` e' `onDelete: Cascade`: gli impegni sparivano
   *    SCAVALCANDO il servizio di dominio, quindi `committed` restava gonfiato
   *    e `available` piu' basso del vero, per sempre, senza segnale.
   *
   *    `purgeCustomers` faceva `customer.deleteMany`, e `documents.customer_id`,
   *    `sales_orders.customer_id` e `online_sales.customer_id` sono `SET NULL`:
   *    i documenti perdevano l'intestatario.
   *
   * ⭐ **Il comportamento definitivo** — chiudere il collegamento conservandone
   *    la storia — richiede `shopify_location_links` e gli equivalenti per
   *    clienti e ordini. Fino ad allora questa capacita' non esiste, e non
   *    esiste sull'API: nasconderla nell'interfaccia proteggerebbe solo chi
   *    passa dall'interfaccia.
   *
   * ⚠️ **Le due `deleteMany` sono state RIMOSSE, non rese irraggiungibili.** Un
   *    rifiuto in testa le renderebbe irraggiungibili oggi; toglierle le rende
   *    irraggiungibili anche dopo la prossima modifica distratta.
   */
  async purge(tenantId: string, dto: PurgeShopifyDataDto): Promise<ShopifyShopChangePurgeResult> {
    void tenantId;
    void dto;
    throw new UnprocessableEntityException(
      'La rimozione dei dati Shopify è sospesa in ogni sua forma: cancellava prodotti, ' +
        'giacenze, movimenti, clienti e ordini locali. Verrà sostituita dallo scollegamento ' +
        'non distruttivo, che chiude il collegamento conservando i dati e la loro storia. ' +
        'La disconnessione da Shopify resta disponibile e non tocca nulla in VestiFlow.',
    );
  }

  private async resolveCurrentShopDomain(tenantId: string): Promise<string | null> {
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    if (credential?.shopDomain) {
      return credential.shopDomain;
    }

    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopDomain: true },
    });
    return connection?.shopDomain ?? null;
  }

  private async requireCurrentShopDomain(tenantId: string): Promise<string> {
    const domain = await this.resolveCurrentShopDomain(tenantId);
    if (!domain) {
      throw new NotFoundException('Nessun negozio Shopify collegato per confermare la rimozione.');
    }
    return domain;
  }

  private async listShopifyLinkedVariantIds(tenantId: string): Promise<string[]> {
    return this.listShopifyLinkedVariantIdsInTx(this.prisma, tenantId);
  }

  private async listShopifyLinkedVariantIdsInTx(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
  ): Promise<string[]> {
    const variants = await db.productVariant.findMany({
      where: { tenantId, product: { shopifyProductId: { not: null } } },
      select: { id: true },
    });
    return variants.map((variant) => variant.id);
  }

  private async countShopifyData(
    tenantId: string,
    shopifyVariantIds: readonly string[],
  ): Promise<ShopifyShopChangePreview['counts']> {
    const [
      shopifyProducts,
      shopifyVariants,
      shopifyCustomers,
      shopifySalesOrders,
      inventoryLevels,
      stockMovements,
      locationStats,
    ] = await Promise.all([
      this.prisma.product.count({
        where: { tenantId, shopifyProductId: { not: null } },
      }),
      this.prisma.productVariant.count({
        where: { tenantId, product: { shopifyProductId: { not: null } } },
      }),
      this.prisma.customer.count({
        where: { tenantId, shopifyCustomerId: { not: null } },
      }),
      this.prisma.salesOrder.count({
        where: { tenantId, shopifyOrderId: { not: null } },
      }),
      shopifyVariantIds.length > 0
        ? this.prisma.inventoryLevel.count({
            where: { tenantId, variantId: { in: [...shopifyVariantIds] } },
          })
        : Promise.resolve(0),
      shopifyVariantIds.length > 0
        ? this.prisma.stockMovement.count({
            where: { tenantId, variantId: { in: [...shopifyVariantIds] } },
          })
        : Promise.resolve(0),
      this.countRemovableShopifyLocations(tenantId),
    ]);

    return {
      shopifyProducts,
      shopifyVariants,
      shopifyCustomers,
      shopifySalesOrders,
      inventoryLevels,
      stockMovements,
      shopifyLinkedLocations: locationStats.linked,
      removableShopifyLocations: locationStats.removable,
    };
  }

  private async countRemovableShopifyLocations(
    tenantId: string,
  ): Promise<{ linked: number; removable: number }> {
    const [locations, primaryStore] = await Promise.all([
      this.prisma.location.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          code: true,
          addressLine1: true,
          shopifyLocationId: true,
          shopifyLastSyncAt: true,
        },
      }),
      this.prisma.store.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: { name: true },
      }),
    ]);

    const primaryStoreName = primaryStore?.name ?? null;
    let linked = 0;
    let removable = 0;

    for (const location of locations) {
      if (!isShopifyManagedImportLocation(location, primaryStoreName)) {
        continue;
      }
      if (location.shopifyLocationId) {
        linked += 1;
      }
      if (await this.canDeleteLocation(this.prisma, tenantId, location.id)) {
        removable += 1;
      }
    }

    return { linked, removable };
  }

  /*
    ⛔ **Qui vivevano `cleanupShopifyLocations`, `prepareShopifyLocationForRemoval`,
       `archiveShopifyLocation` e `removeInventoryCountSessionsAtLocation`.**
       Sono state rimosse il 07/09/2026, e non vanno riscritte in questa forma.

    Che cosa facevano: per ogni sede mai sincronizzata con Shopify —
    `isShopifyManagedImportLocation` basta un `shopifyLocationId` o un
    `shopifyLastSyncAt` — cancellavano le sessioni di conteggio, TUTTE le
    `inventory_levels` della sede e TUTTI gli `stock_movements` entranti e
    uscenti, senza filtrare per variante: quindi anche di articoli nati solo in
    VestiFlow e mai visti dal canale.

    ⛔ **E lo facevano PRIMA di verificare se la sede fosse eliminabile.** Il
       controllo `canDeleteLocation` veniva dopo: se la sede non era
       eliminabile veniva archiviata — con i dati gia` persi. Nessun errore,
       nessun avviso, nessuna traccia. E la riconnessione successiva la
       ri-agganciava per nome, cancellando anche l`impronta dell`archiviazione.

    ⚠️ **Non e` un rischio teorico: e` successo.** Il 03/09/2026 un tenant ha
       perso tutte le giacenze e tutti i movimenti; 48 righe documento con la
       spunta magazzino sono rimaste senza il loro effetto, e i documenti sono
       rimasti li` a dire che la merce era entrata. La via era `disconnect()`,
       corretta l`08/08 e arrivata in produzione solo il 06/09; ma la stessa
       pulizia era raggiungibile anche da `purge()`, e da li` girava persino
       quando l`operatore aveva spuntato SOLO clienti o SOLO ordini.

    ⭐ **La regola che sostituisce tutto questo**: Shopify non cancella la
       storia inventariale di VestiFlow. La rimozione remota e` uno STATO del
       collegamento, non una cancellazione dell`entita` locale — si progetta
       nel lavoro sullo storico dei collegamenti (docs/24 §8.5).

    ⚠️ `npm run check:shopify-inventario` fa fallire il lint se una
       cancellazione di catalogo o inventario rientra in questi file.

    ⭐ La sede si cancella ancora, ma solo dove e` sempre stato corretto farlo:
       `shopify-location-sync.service.ts` verifica PRIMA con `canDeleteLocation`
       e cancella la sola `location`, mai i dati che contiene.
  */


  private async canDeleteLocation(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    locationId: string,
  ): Promise<boolean> {
    const [levels, movements, supplierOrders, countSessions] = await Promise.all([
      db.inventoryLevel.count({ where: { tenantId, locationId } }),
      db.stockMovement.count({
        where: {
          tenantId,
          OR: [{ locationId }, { targetLocationId: locationId }],
        },
      }),
      db.supplierOrder.count({ where: { tenantId, destinationLocationId: locationId } }),
      db.inventoryCountSession.count({
        where: {
          tenantId,
          locationId,
        },
      }),
    ]);

    return levels === 0 && movements === 0 && supplierOrders === 0 && countSessions === 0;
  }

  private async findBlockers(
    tenantId: string,
    shopifyVariantIds: readonly string[],
  ): Promise<ShopifyShopChangeBlocker[]> {
    if (shopifyVariantIds.length === 0) {
      return [];
    }

    const openOrders = await this.prisma.supplierOrder.findMany({
      where: {
        tenantId,
        status: { in: [...OPEN_SUPPLIER_ORDER_STATUSES] },
        lines: {
          some: {
            variantId: { in: [...shopifyVariantIds] },
          },
        },
      },
      select: { id: true, reference: true },
      orderBy: { reference: 'asc' },
    });

    if (openOrders.length === 0) {
      return [];
    }

    return [
      {
        code: 'supplier_orders_open',
        message: `${openOrders.length} ordini fornitore aperti referenziano varianti del catalogo Shopify.`,
        references: openOrders.map((order) => ({
          type: 'supplier_order',
          id: order.id,
          reference: order.reference,
        })),
      },
    ];
  }
}
