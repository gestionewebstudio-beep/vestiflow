import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ShopifyLinkCloseReason,
  ShopifyLinkStatus,
  ShopifySyncStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { gidSede, normalizeShopifyLocationId } from './shopify-location-id.util';

/**
 * ⭐ **Il collegamento ESPLICITO di una sede** — B7 (`docs/DA-FARE` §13) e la
 * prima connessione (`docs/27` §2).
 *
 * `docs/24` §1.13: «la sincronizzazione avviene soltanto dove esiste un
 * collegamento esplicito, e quel collegamento lo dichiara una persona». Questo
 * servizio è l'unico che scrive coppia e periodo delle sedi
 * (`shopify_location_pairs` / `shopify_location_links`): fino all'11/09/2026
 * nessun servizio li scriveva, e l'unica «fonte» era la colonna-cache
 * `locations.shopify_location_id`, riempita anche PER NOME dal sync.
 *
 * ⛔ **Qui non c'è nessun abbinamento**: si riceve una coppia già decisa
 *    (sede VestiFlow, location Shopify) e la si registra. Chi decide è
 *    l'operatore (le scelte di `ShopifySetupService`) — mai il nome.
 *
 * ⚠️ **Idempotente**: la stessa coppia registrata due volte non apre un secondo
 *    periodo (l'indice unico parziale «un solo periodo attivo per coppia» lo
 *    rifiuterebbe comunque, come 23505).
 */
@Injectable()
export class ShopifyLocationLinkService {
  private readonly logger = new Logger(ShopifyLocationLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra coppia e periodo attivo per (sede, location), e allinea la
   * colonna-cache `shopifyLocationId` — che resta per i lettori non migrati
   * (`docs/24` §8.5.5).
   *
   * @returns `registrato` (periodo aperto ora), `gia_collegata` (periodo attivo
   *   già presente), `sede_di_altra_location` (la sede ha già una coppia con
   *   un'altra location: una sede raccoglie UNA location, §8.11.1),
   *   `location_di_altra_sede` (la location è già la coppia di un'altra sede),
   *   `negozio_assente` (connessione senza `shopId`: niente da scrivere).
   */
  async collega(
    tx: Prisma.TransactionClient,
    dati: {
      readonly tenantId: string;
      readonly locationId: string;
      readonly shopifyLocationId: string;
    },
  ): Promise<
    | { tipo: 'registrato'; pairId: string; linkId: string }
    | { tipo: 'gia_collegata'; pairId: string; linkId: string }
    | { tipo: 'sede_di_altra_location'; pairId: string }
    | { tipo: 'location_di_altra_sede'; pairId: string }
    | { tipo: 'negozio_assente' }
  > {
    const { tenantId, locationId } = dati;
    const gid = gidSede(dati.shopifyLocationId);
    const numerico = normalizeShopifyLocationId(dati.shopifyLocationId);
    if (!gid || !numerico) {
      throw new Error(`Id location Shopify non valido: ${dati.shopifyLocationId}`);
    }

    const connessione = await tx.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopId: true },
    });
    const shopId = connessione?.shopId ?? null;
    if (!shopId) {
      return { tipo: 'negozio_assente' };
    }

    // La sede ha già una coppia? Con la stessa location è idempotenza; con
    // un'altra è un rifiuto: una sede raccoglie UNA location (§8.11.1).
    const coppiaDellaSede = await tx.shopifyLocationPair.findUnique({
      where: { locationId },
      select: { id: true, shopId: true, shopifyLocationGid: true },
    });
    if (
      coppiaDellaSede &&
      (coppiaDellaSede.shopId !== shopId || coppiaDellaSede.shopifyLocationGid !== gid)
    ) {
      return { tipo: 'sede_di_altra_location', pairId: coppiaDellaSede.id };
    }
    const coppiaDellaLocation = await tx.shopifyLocationPair.findUnique({
      where: { shopId_shopifyLocationGid: { shopId, shopifyLocationGid: gid } },
      select: { id: true, locationId: true },
    });
    if (coppiaDellaLocation && coppiaDellaLocation.locationId !== locationId) {
      return { tipo: 'location_di_altra_sede', pairId: coppiaDellaLocation.id };
    }

    const coppia =
      coppiaDellaSede ??
      coppiaDellaLocation ??
      (await tx.shopifyLocationPair.create({
        data: { tenantId, shopId, locationId, shopifyLocationGid: gid },
        select: { id: true, shopId: true, shopifyLocationGid: true },
      }));

    // La colonna-cache segue la coppia: i lettori non migrati leggono lei.
    // ⛔ SOLO l'id, non `shopifySyncStatus`: quello stato dice se i DATI della
    //    sede (nome, indirizzo, attiva) sono stati letti da Shopify — lo scrive
    //    «Sincronizza location» — e qui non è avvenuto niente del genere.
    //    «Collegata» si legge dall'id (che segue la coppia), non da `synced`:
    //    misurato sul collaudo il 13/09/2026, la Configurazione contava solo le
    //    `synced` e diceva «Sedi non attivate» a Sede B, coppia attiva.
    await tx.location.updateMany({
      where: { id: locationId, tenantId },
      data: { shopifyLocationId: numerico },
    });

    const attivo = await tx.shopifyLocationLink.findFirst({
      where: { pairId: coppia.id, status: ShopifyLinkStatus.active },
      select: { id: true },
    });
    if (attivo) {
      return { tipo: 'gia_collegata', pairId: coppia.id, linkId: attivo.id };
    }

    const periodo = await tx.shopifyLocationLink.create({
      data: { tenantId, pairId: coppia.id, status: ShopifyLinkStatus.active },
      select: { id: true },
    });
    this.logger.log(
      `Sede collegata a Shopify (${tenantId}): ${locationId} ↔ ${gid} (periodo ${periodo.id})`,
    );
    return { tipo: 'registrato', pairId: coppia.id, linkId: periodo.id };
  }

  /**
   * ⭐ **Chiude il collegamento di una location, per scelta dell’operatore**
   *    («lascia fuori da VestiFlow» su una location collegata): il periodo
   *    attivo della coppia passa a `unlinked` / `operator` e la colonna-cache
   *    della sede si azzera. La coppia resta: è storia, e un «collega»
   *    successivo sulla stessa coppia apre un periodo nuovo — mai si riaggancia
   *    da solo (`docs/24` §1.13, `DA-FARE` §12).
   *
   * ⚠️ Prima del 12/09/2026 «lascia» scriveva solo la scelta e la coppia restava
   *    attiva: gli ordini continuavano a risolvere la sede che l’operatore aveva
   *    appena escluso.
   */
  async scollega(
    tx: Prisma.TransactionClient,
    dati: { readonly tenantId: string; readonly shopifyLocationId: string },
  ): Promise<
    | { tipo: 'chiuso'; pairId: string; locationId: string }
    | { tipo: 'nessun_periodo' }
    | { tipo: 'negozio_assente' }
  > {
    const { tenantId } = dati;
    const gid = gidSede(dati.shopifyLocationId);
    if (!gid) {
      throw new Error(`Id location Shopify non valido: ${dati.shopifyLocationId}`);
    }
    const connessione = await tx.shopifyConnection.findUnique({
      where: { tenantId },
      select: { shopId: true },
    });
    if (!connessione?.shopId) {
      return { tipo: 'negozio_assente' };
    }
    const coppia = await tx.shopifyLocationPair.findUnique({
      where: { shopId_shopifyLocationGid: { shopId: connessione.shopId, shopifyLocationGid: gid } },
      select: { id: true, locationId: true },
    });
    if (!coppia) {
      return { tipo: 'nessun_periodo' };
    }
    const chiusi = await tx.shopifyLocationLink.updateMany({
      where: { pairId: coppia.id, status: ShopifyLinkStatus.active },
      data: {
        status: ShopifyLinkStatus.unlinked,
        closeReason: ShopifyLinkCloseReason.operator,
        closedAt: new Date(),
      },
    });
    if (chiusi.count === 0) {
      return { tipo: 'nessun_periodo' };
    }
    await tx.location.updateMany({
      where: { id: coppia.locationId, tenantId },
      // Scollegata per scelta: né id né stato di lettura dei dati.
      data: { shopifyLocationId: null, shopifySyncStatus: ShopifySyncStatus.not_connected },
    });
    this.logger.log(
      `Sede scollegata da Shopify per scelta (${tenantId}): ${coppia.locationId} ↔ ${gid}`,
    );
    return { tipo: 'chiuso', pairId: coppia.id, locationId: coppia.locationId };
  }

  /**
   * Le sedi del tenant con un periodo ATTIVO, con la location Shopify: è
   * questo l'elenco su cui lavorano trasferimento e attivazione — non la
   * colonna-cache, che il vecchio sync riempiva anche per nome.
   */
  async sediCollegate(
    tenantId: string,
  ): Promise<readonly { locationId: string; shopifyLocationId: string; gid: string }[]> {
    const coppie = await this.prisma.shopifyLocationPair.findMany({
      where: { tenantId, periodi: { some: { status: ShopifyLinkStatus.active } } },
      select: { locationId: true, shopifyLocationGid: true },
    });
    return coppie.map((c) => ({
      locationId: c.locationId,
      shopifyLocationId: normalizeShopifyLocationId(c.shopifyLocationGid) ?? c.shopifyLocationGid,
      gid: c.shopifyLocationGid,
    }));
  }
}
