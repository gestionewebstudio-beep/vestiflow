import {
  BadRequestException,
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

/** Purge può coinvolere molte righe (catalogo + movimenti + ordini). */
const PURGE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 120_000,
} as const;

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

  async purge(tenantId: string, dto: PurgeShopifyDataDto): Promise<ShopifyShopChangePurgeResult> {
    /*
      ⛔ **La rimozione del CATALOGO e' sospesa, e il rifiuto viene PRIMA di ogni
         altra cosa** — prima della conferma del dominio, prima di leggere il
         database, prima di aprire la transazione. Un rifiuto che arrivasse dopo
         una lettura sarebbe gia' un percorso che «entra» nella purga.

      ⛔ **Perche' e' sospesa.** `purgeCatalog` cancellava fisicamente prodotti
         collegati, giacenze, movimenti e righe di conteggio. Le decisioni di
         prodotto dicono l'opposto: Shopify non puo' cancellare la storia
         inventariale di VestiFlow, un prodotto gia' collegato non si elimina, e
         la rimozione remota e' uno STATO del collegamento — non una
         cancellazione dell'entita' locale.

      ⚠️ **Non e' una precauzione teorica.** Il 03/09/2026 un tenant ha perso
         TUTTE le giacenze e TUTTI i movimenti: 48 righe documento con la spunta
         magazzino sono rimaste senza il loro effetto. Il percorso era
         `disconnect()`, corretto l'08/08 e arrivato in produzione solo il 06/09;
         ma la stessa pulizia era — ed e' — raggiungibile da qui.

      ⭐ Il comportamento definitivo (archiviazione e scollegamento non
         distruttivo) si progetta nel lavoro sullo storico dei collegamenti. Fino
         ad allora questa capacita' non esiste, e non esiste sull'API: nasconderla
         nell'interfaccia proteggerebbe solo chi passa dall'interfaccia.
    */
    if (dto.purgeCatalog) {
      throw new UnprocessableEntityException(
        'La rimozione del catalogo Shopify e` sospesa: cancellava prodotti, giacenze e ' +
          'movimenti locali. Verra` sostituita dall`archiviazione e dallo scollegamento non ' +
          'distruttivo. Puoi rimuovere clienti e ordini Shopify.',
      );
    }

    const currentShopDomain = await this.requireCurrentShopDomain(tenantId);
    if (dto.confirmShopDomain !== currentShopDomain) {
      throw new BadRequestException(
        'Il dominio inserito non corrisponde al negozio Shopify attualmente collegato.',
      );
    }

    if (!dto.purgeCustomers && !dto.purgeOrders) {
      throw new BadRequestException('Seleziona almeno una categoria di dati da rimuovere.');
    }

    /*
      ⛔ **`salesOrder.deleteMany` corrompe la giacenza per CASCATA, e non si vede.**
         `StockReservation.order` è `onDelete: Cascade` (schema.prisma), quindi
         cancellare un ordine Shopify porta via i suoi impegni di magazzino.

      ⚠️ Il problema non è la riga persa: è che sparisce SCAVALCANDO il servizio
         di dominio. Lo schema lo dichiara sopra `StockReservation`: «ogni
         variazione passa dal servizio di dominio quantità (mai update sparsi):
         committed e available su InventoryLevel cambiano solo insieme
         all'impegno». Una cascata non lo invoca: `committed` resta gonfiato e
         `available` più basso del vero, per sempre, senza che niente lo segnali.

      ⭐ **Si rifiuta, non si rilascia in automatico.** Rilasciare gli impegni qui
         dentro sarebbe progettare un comportamento nuovo dentro una patch di
         sicurezza. Chi vuole rimuovere quegli ordini chiude prima i loro impegni,
         dal percorso che li governa.

      ⚠️ Non è teorico: sul database di sviluppo ci sono 21 impegni su ordini
         Shopify.
    */
    if (dto.purgeOrders) {
      const impegniAttivi = await this.prisma.stockReservation.count({
        where: {
          tenantId,
          status: 'active',
          order: { shopifyOrderId: { not: null } },
        },
      });
      if (impegniAttivi > 0) {
        throw new UnprocessableEntityException(
          `Impossibile rimuovere gli ordini Shopify: ${impegniAttivi} impegni di magazzino sono ` +
            'ancora attivi su quegli ordini. Cancellarli scollegherebbe la quantità impegnata ' +
            'dalla giacenza senza aggiornarla. Chiudi prima gli impegni.',
        );
      }
    }

    if (dto.purgeCustomers && !dto.purgeOrders) {
      const linkedOrders = await this.prisma.salesOrder.count({
        where: {
          tenantId,
          shopifyOrderId: { not: null },
          customer: { shopifyCustomerId: { not: null } },
        },
      });
      if (linkedOrders > 0) {
        throw new BadRequestException(
          'Per rimuovere i clienti Shopify includi anche gli ordini vendita Shopify.',
        );
      }
    }

    const purged = {
      products: 0,
      customers: 0,
      salesOrders: 0,
      stockMovements: 0,
      inventoryLevels: 0,
      inventoryCountLines: 0,
      locations: 0,
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        if (dto.purgeOrders) {
          const orders = await tx.salesOrder.deleteMany({
            where: { tenantId, shopifyOrderId: { not: null } },
          });
          purged.salesOrders = orders.count;
        }

        if (dto.purgeCustomers) {
          const customers = await tx.customer.deleteMany({
            where: { tenantId, shopifyCustomerId: { not: null } },
          });
          purged.customers = customers.count;
        }

        /*
          ⛔ **Qui c'era la pulizia delle SEDI**, e girava anche quando l'operatore
             aveva spuntato SOLO clienti o SOLO ordini:

               if (dto.purgeCatalog || dto.purgeCustomers || dto.purgeOrders) {
                 purged.locations = await this.cleanupShopifyLocations(tx, tenantId, dto.purgeCatalog);
               }

             `prepareShopifyLocationForRemoval` cancellava sessioni di conteggio,
             giacenze e movimenti di OGNI sede mai sincronizzata — e li cancellava
             PRIMA di controllare `purgeCatalog`, che veniva letto solo piu' sotto
             per gli ordini fornitore. Rimuovere i clienti Shopify portava via la
             storia inventariale di articoli che con Shopify non c'entravano nulla.

          ⭐ **Rimuovere clienti e ordini non tocca le sedi**, e non deve toccarle:
             una sede e' un luogo fisico del gestionale, non un dato del canale.
        */
      }, PURGE_TRANSACTION_OPTIONS);
    } catch (error) {
      this.logger.error(`Purge dati Shopify fallita (${tenantId})`, error);
      throw this.mapPurgeError(error);
    }

    this.logger.log(
      `Purge dati Shopify (${tenantId}, ${currentShopDomain}): prodotti=${purged.products} clienti=${purged.customers} ordini=${purged.salesOrders} location=${purged.locations}`,
    );

    return { purged };
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

  private mapPurgeError(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return new UnprocessableEntityException(
          'Impossibile rimuovere alcuni dati Shopify perché sono ancora collegati ad altre operazioni nel gestionale. Chiudi gli ordini fornitore aperti e riprova.',
        );
      }
      if (error.code === 'P2028') {
        return new UnprocessableEntityException(
          'Operazione troppo lunga: attendi qualche minuto e riprova.',
        );
      }
    }

    if (error instanceof Error && /expired transaction/i.test(error.message)) {
      return new UnprocessableEntityException(
        'Operazione troppo lunga: attendi qualche minuto e riprova.',
      );
    }

    return error instanceof Error ? error : new Error(String(error));
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
