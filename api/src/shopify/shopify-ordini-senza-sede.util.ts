import {
  SalesOrderFulfillmentStatus,
  SalesOrderSource,
  type Prisma,
  type PrismaClient,
} from '@prisma/client';

import { ORDINE_SENZA_SEDE_MARCATORE } from './shopify-order-location.util';

/**
 * Gli ordini di canale APERTI senza una sede determinabile — e quindi senza
 * impegno — e la quantità che per loro conto NON deve partire verso Shopify.
 *
 * ⛔ **Misurato sul negozio vero il 13/09/2026, prova 1 del collaudo.** Gli
 *    ordini #1010 e #1011 (nati da bozze, `location_id` nullo, sede nota solo
 *    alla spedizione) sono entrati «Da verificare» senza impegno, com'è deciso:
 *    nessuna sede si indovina. Ma Shopify per loro ha già `committed` 6, e
 *    VestiFlow no: il Disponibile VestiFlow è più alto di 6 su quegli articoli.
 *    L'allineamento automatico dell'attivazione avrebbe scritto quel Disponibile
 *    su Shopify, che avrebbe **alzato** l'on_hand di 6 pezzi già promessi. Non è
 *    successo solo perché il push era rotto per un'altra ragione (GID).
 *
 * ⭐ **La quantità di una variante coinvolta in un ordine aperto senza sede
 *    resta FERMA** — da ogni percorso (post-commit, recupero, «Allinea»,
 *    attivazione) — finché l'ordine non ha una sede: alla spedizione, o quando
 *    la sua location viene collegata. Il motivo e l'azione si mostrano; nessuna
 *    compensazione numerica, nessuna sede inventata (decisione del proprietario
 *    del 13/09/2026).
 *
 * ⚠️ Il criterio è l'ordine, non la variante: se una sola riga di un ordine
 *    senza sede porta la variante, la variante è ferma su OGNI sede — il
 *    Disponibile di ognuna ignora un impegno che esiste.
 */

type PrismaReader = PrismaClient | Prisma.TransactionClient;

export interface OrdineApertoSenzaSede {
  readonly id: string;
  readonly orderNumber: string;
  /** Il «Da verificare» dell'ordine: porta l'AZIONE che scioglie la sede. */
  readonly reviewReason: string | null;
  /**
   * Quando l'ordine è stato valutato l'ultima volta (l'ultima lettura del
   * canale che lo ha riscritto): il motivo è una fotografia di QUEL momento,
   * e chi lo mostra deve dirlo con la data (proprietario, 13/09/2026).
   */
  readonly rilevatoAt: Date;
}

const ORIGINI_CANALE: readonly SalesOrderSource[] = [
  SalesOrderSource.shopify_online,
  SalesOrderSource.shopify_pos,
];

/**
 * Gli ordini di canale aperti «Da verificare» per sede non determinabile;
 * con `variantId`, solo quelli che hanno almeno una riga su quella variante.
 */
export async function ordiniApertiSenzaSede(
  prisma: PrismaReader,
  tenantId: string,
  variantId?: string,
): Promise<readonly OrdineApertoSenzaSede[]> {
  const ordini = await prisma.salesOrder.findMany({
    where: {
      tenantId,
      source: { in: [...ORIGINI_CANALE] },
      cancelledAt: null,
      fulfillmentStatus: { not: SalesOrderFulfillmentStatus.fulfilled },
      requiresReview: true,
      reviewReason: { contains: ORDINE_SENZA_SEDE_MARCATORE },
      ...(variantId ? { lines: { some: { variantId } } } : {}),
    },
    select: { id: true, orderNumber: true, reviewReason: true, updatedAt: true },
    orderBy: { orderNumber: 'asc' },
  });
  return ordini.map(({ updatedAt, ...ordine }) => ({ ...ordine, rilevatoAt: updatedAt }));
}

/**
 * L'AZIONE scritta sull'ordine: il segmento del «Da verificare» che porta il
 * marcatore, senza il marcatore. È la stessa frase che l'operatore legge
 * sull'ordine, e dice la cosa giusta per QUEL caso — l'ambito da aggiungere, la
 * location da collegare, l'assegnazione da attendere.
 *
 * ⛔ Qui c'era «collega la location … in Sedi» per ogni caso, e con l'ambito
 *    mancante mandava l'operatore a collegare una location che non poteva
 *    nemmeno essere letta (proprietario, 13/09/2026).
 */
function azioneDellOrdine(reviewReason: string | null): string | null {
  const segmento = (reviewReason ?? '')
    .split(' · ')
    .find((parte) => parte.includes(ORDINE_SENZA_SEDE_MARCATORE));
  if (!segmento) {
    return null;
  }
  const testo = segmento.slice(
    segmento.indexOf(ORDINE_SENZA_SEDE_MARCATORE) + ORDINE_SENZA_SEDE_MARCATORE.length,
  );
  const pulito = testo.replace(/^\s*:\s*/, '').trim();
  return pulito ? pulito.charAt(0).toUpperCase() + pulito.slice(1) : null;
}

/** Il motivo, con l'azione: è ciò che l'operatore legge. */
export function motivoQuantitaFerma(ordini: readonly OrdineApertoSenzaSede[]): string {
  const elenco = ordini.map((o) => o.orderNumber).join(', ');
  const plurale = ordini.length > 1;
  const azioni = [
    ...new Set(
      ordini.map((o) => azioneDellOrdine(o.reviewReason)).filter((a): a is string => a !== null),
    ),
  ];
  const azione =
    azioni.length > 0
      ? azioni.join(' ')
      : "Attendi l'assegnazione della sede da parte di Shopify, oppure la spedizione.";
  return (
    `Quantità ferma verso Shopify: ${plurale ? 'gli ordini' : "l'ordine"} ${elenco} ` +
    `${plurale ? 'sono aperti' : 'è aperto'} senza una sede determinabile, quindi senza impegno, ` +
    'e il Disponibile VestiFlow non tiene conto di quei pezzi. Nessuna quantità parte finché ' +
    `${plurale ? 'restano' : 'resta'} così. ${azione}`
  );
}

export const CODICE_QUANTITA_FERMA = 'quantita_ferma_ordine_senza_sede';
