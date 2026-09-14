import { ShopifyLinkStatus, type Prisma, type PrismaClient } from '@prisma/client';

import { gidSede, normalizeShopifyLocationId } from './shopify-location-id.util';
import { toShopifyGid } from './shopify-money.util';

type PrismaReader = PrismaClient | Prisma.TransactionClient;

/**
 * Estrae la location Shopify di un payload ordine (REST): quella da cui la merce
 * è USCITA, se c'è un'evasione; altrimenti quella di testata.
 *
 * ⛔ Qui la testata vinceva sull'evasione, e sul negozio vero non è la stessa
 *    cosa (misurato il 13/09/2026, prova 3, ordine #1012): un ordine nato da
 *    bozza porta in `location_id` la location dello staff («Magazzino test 3»,
 *    non abbinata) mentre l'evasione dice «Shop location». La Vendita online
 *    restava senza sede — cioè fuori dal perimetro di chi legge per sede —
 *    mentre lo scarico per riga andava alla sede giusta, perché le spedizioni
 *    leggono le evasioni una per una. Un'evasione annullata non conta.
 */
export function extractShopifyOrderLocationId(order: Record<string, unknown>): string | null {
  const fulfillments = order.fulfillments as Record<string, unknown>[] | undefined;
  if (fulfillments?.length) {
    for (const fulfillment of fulfillments) {
      if (fulfillment.status === 'cancelled') {
        continue;
      }
      const locId = fulfillment.location_id;
      if (locId != null && String(locId).trim() !== '') {
        return toShopifyGid('Location', String(locId));
      }
    }
  }

  const direct = order.location_id;
  if (direct != null && String(direct).trim() !== '') {
    // Un GID già formato (GraphQL, fulfillment order) non si raddoppia.
    return toShopifyGid('Location', String(direct));
  }

  return null;
}

/** Perché un ordine resta senza sede: la ragione va sull'ordine, non nel log. */
/**
 * Le prime parole del motivo: sono il MARCATORE con cui si riconosce, sull'ordine,
 * un «Da verificare» per sede non determinabile (i motivi si accodano, quindi si
 * cerca dentro, non si confronta l'intero). ⛔ Cambiare il testo del motivo
 * senza cambiare il marcatore spegnerebbe la protezione delle quantità
 * (`shopify-ordini-senza-sede.util`).
 */
export const ORDINE_SENZA_SEDE_MARCATORE = 'Sede non determinabile';

export const ORDINE_SENZA_SEDE_MOTIVO = `${ORDINE_SENZA_SEDE_MARCATORE}: il payload Shopify non porta una location collegata a una sede VestiFlow. Nessun impegno preso; collega la location in Impostazioni → Shopify e reimporta.`;

/**
 * Risolve la sede VestiFlow di un ordine Shopify dal SOLO collegamento
 * esplicito (la location nel payload, collegata a una sede licenziata e
 * attiva). `null` se manca: l’ordine resta senza impegno e viene segnalato.
 *
 * ⛔ Qui c’era il RIPIEGO ALFABETICO — «altrimenti la prima sede licenziata
 *    attiva» — tolto il 12/09/2026 (B7, `DA-FARE` §12 e §30.8 punto 4): una
 *    sede indovinata metteva l’impegno su uno scaffale a caso, e con quattro
 *    sedi era sbagliato tre volte su quattro. Ciò che non è determinabile
 *    resta segnalato e non entra nella sincronizzazione come preparato.
 */
export async function resolveShopifyOrderLocationId(
  prisma: PrismaReader,
  tenantId: string,
  orderPayload: Record<string, unknown>,
): Promise<string | null> {
  const shopifyLocationId = extractShopifyOrderLocationId(orderPayload);
  if (!shopifyLocationId) {
    return null;
  }
  const gid = gidSede(shopifyLocationId);
  const numero = normalizeShopifyLocationId(shopifyLocationId);
  // ⭐ La FONTE del collegamento è la coppia attiva dello storico (B7).
  if (gid) {
    const coppia = await prisma.shopifyLocationPair.findFirst({
      where: {
        tenantId,
        shopifyLocationGid: gid,
        periodi: { some: { status: ShopifyLinkStatus.active } },
        location: { licensedInVf: true, isActive: true },
      },
      select: { locationId: true },
    });
    if (coppia) {
      return coppia.locationId;
    }
  }
  // Le connessioni nate prima dello storico hanno solo la colonna-cache, che
  // può portare il gid o il numero: si accettano entrambe le forme.
  const forme = [shopifyLocationId, gid, numero].filter((f): f is string => Boolean(f));
  const mapped = await prisma.location.findFirst({
    where: { tenantId, shopifyLocationId: { in: forme }, licensedInVf: true, isActive: true },
    select: { id: true },
  });
  return mapped?.id ?? null;
}
