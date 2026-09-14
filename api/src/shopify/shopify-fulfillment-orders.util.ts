import { ORDINE_SENZA_SEDE_MARCATORE } from './shopify-order-location.util';

/**
 * La SEDE di un ordine online prima della spedizione sta nel FULFILLMENT ORDER
 * di Shopify (`assignedLocation`), non nell'ordine: Shopify la assegna con le sue
 * regole di evasione — anche dopo la creazione — e può spostarla fino alla
 * spedizione. Deciso dal proprietario il 13/09/2026 (`DA-FARE` §10e.7-bis):
 * si ACQUISISCE in sola lettura, per riga, e gli impegni la seguono.
 *
 * Qui vive la parte PURA: dai fulfillment order letti alla sede di ogni riga.
 * Niente Prisma, niente rete — è ciò che le prove unitarie falsificano.
 *
 * ⛔ **La quantità dell'impegno NON viene da qui.** `remainingQuantity` è quanto
 *    resta da evadere su quel fulfillment order; l'impegno VestiFlow è la
 *    quantità CORRENTE della riga meno ciò che è già uscito con le spedizioni
 *    applicate (`applyOrderUpsertTx`). Usare il residuo di Shopify sottrarrebbe
 *    le spedite due volte. Da qui esce solo DOVE, mai QUANTO.
 */

/** Gli stati di un fulfillment order su Shopify (`FulfillmentOrderStatus`). */
export type StatoFulfillmentOrder =
  'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'SCHEDULED' | 'INCOMPLETE' | 'CLOSED' | 'CANCELLED';

/** Un fulfillment order come lo restituisce la lettura, nella forma che serve. */
export interface FulfillmentOrderRemoto {
  readonly id: string;
  readonly status: StatoFulfillmentOrder | string;
  /** `assignedLocation.location.id`; `null` se la location è stata eliminata. */
  readonly assignedLocationGid: string | null;
  readonly righe: readonly {
    /** GID del `LineItem` dell'ordine (`gid://shopify/LineItem/<id REST>`). */
    readonly lineItemGid: string | null;
    readonly remainingQuantity: number;
    readonly totalQuantity: number;
  }[];
}

/**
 * L'esito della lettura: o i fulfillment order, o il PERCHÉ non si è letto.
 *
 * ⛔ Tre esiti distinti, perché chiedono tre azioni diverse: l'ambito mancante
 *    si aggiunge e si ricollega; una lettura fallita si riprova; un elenco letto
 *    si usa. Fonderli in «nessun fulfillment order» farebbe sparire l'azione.
 */
export type LetturaFulfillmentOrders =
  | {
      readonly ok: true;
      readonly fulfillmentOrders: readonly FulfillmentOrderRemoto[];
      /**
       * ⭐ TUTTI i fulfillment order e TUTTE le loro righe sono stati letti
       *    (nessuna pagina oltre la prima). Una lettura troncata classifica
       *    ancora le righe viste, ma non basta a RILASCIARE un impegno:
       *    «lettura incerta o incompleta» resta conservativa (13/09/2026).
       */
      readonly completa: boolean;
    }
  | {
      readonly ok: false;
      readonly motivo: 'permesso_mancante' | 'lettura_fallita';
      readonly dettaglio: string;
    };

/**
 * Dove sta UNA riga secondo i fulfillment order ATTIVI.
 *
 * - `assegnata`: i fulfillment order attivi che la portano stanno in UNA
 *   location → quella; `residuo` è quanto di quella riga resta da evadere lì,
 *   sommato — serve a dire se TUTTA la quantità residua sta in quel posto;
 * - `in_attesa`: nessun fulfillment order (attivo o chiuso) la nomina: Shopify
 *   non ha ancora completato l'assegnazione (`order_routing_complete` arriverà);
 * - `divisa`: la STESSA riga sta in più fulfillment order attivi, su sedi
 *   diverse — il limite dichiarato del modello (un impegno per riga);
 * - `evasa`: la riga compare solo in fulfillment order chiusi/annullati: non c'è
 *   più niente da assegnare (le spedizioni la scaricano per la loro via).
 */
export type SedeRigaDaFulfillmentOrder =
  | { readonly esito: 'assegnata'; readonly shopifyLocationGid: string; readonly residuo: number }
  | { readonly esito: 'in_attesa' }
  | { readonly esito: 'divisa'; readonly shopifyLocationGids: readonly string[] }
  | { readonly esito: 'evasa' };

const STATI_ATTIVI: ReadonlySet<string> = new Set([
  'OPEN',
  'IN_PROGRESS',
  'ON_HOLD',
  'SCHEDULED',
  'INCOMPLETE',
]);

/** Un fulfillment order che porta ancora merce da evadere in una sede. */
export function isFulfillmentOrderAttivo(status: string): boolean {
  return STATI_ATTIVI.has(status);
}

/** Il GID della riga d'ordine dal suo id REST (`line_items[].id`). */
export function gidRigaOrdine(externalLineId: string): string {
  return externalLineId.startsWith('gid://')
    ? externalLineId
    : `gid://shopify/LineItem/${externalLineId}`;
}

/**
 * Per ogni riga (id locale → id REST della riga Shopify), la sede secondo i
 * fulfillment order. Una riga senza `externalLineId` non può essere abbinata e
 * resta `in_attesa`.
 *
 * ⭐ Una riga presente in un solo fulfillment order attivo con
 *    `remainingQuantity` 0 è già uscita per quella parte: se non c'è altro che
 *    la nomini, è `evasa`; un altro attivo con residuo la porta là.
 */
export function sediPerRigaDaFulfillmentOrders(
  fulfillmentOrders: readonly FulfillmentOrderRemoto[],
  righe: readonly { readonly salesOrderLineId: string; readonly externalLineId: string | null }[],
): ReadonlyMap<string, SedeRigaDaFulfillmentOrder> {
  const attiviPerRiga = new Map<string, Map<string, number>>();
  // Righe che un fulfillment order ATTIVO porta senza una location: assegnate
  // a nessun posto, cioè in attesa — non «evase».
  const senzaLocation = new Set<string>();
  // Righe che compaiono solo in fulfillment order chiusi, o a residuo zero.
  const concluse = new Set<string>();
  for (const fo of fulfillmentOrders) {
    const attivo = isFulfillmentOrderAttivo(fo.status);
    for (const riga of fo.righe) {
      if (!riga.lineItemGid) {
        continue;
      }
      if (!attivo || riga.remainingQuantity <= 0) {
        concluse.add(riga.lineItemGid);
        continue;
      }
      if (!fo.assignedLocationGid) {
        senzaLocation.add(riga.lineItemGid);
        continue;
      }
      const sedi = attiviPerRiga.get(riga.lineItemGid) ?? new Map<string, number>();
      sedi.set(
        fo.assignedLocationGid,
        (sedi.get(fo.assignedLocationGid) ?? 0) + riga.remainingQuantity,
      );
      attiviPerRiga.set(riga.lineItemGid, sedi);
    }
  }

  const esito = new Map<string, SedeRigaDaFulfillmentOrder>();
  for (const riga of righe) {
    if (!riga.externalLineId) {
      esito.set(riga.salesOrderLineId, { esito: 'in_attesa' });
      continue;
    }
    const gid = gidRigaOrdine(riga.externalLineId);
    const sedi = attiviPerRiga.get(gid);
    if (sedi && sedi.size === 1) {
      const [shopifyLocationGid, residuo] = [...sedi][0] as [string, number];
      esito.set(riga.salesOrderLineId, { esito: 'assegnata', shopifyLocationGid, residuo });
    } else if (sedi && sedi.size > 1) {
      esito.set(riga.salesOrderLineId, {
        esito: 'divisa',
        shopifyLocationGids: [...sedi.keys()].sort(),
      });
    } else if (senzaLocation.has(gid) || !concluse.has(gid)) {
      esito.set(riga.salesOrderLineId, { esito: 'in_attesa' });
    } else {
      esito.set(riga.salesOrderLineId, { esito: 'evasa' });
    }
  }
  return esito;
}

/**
 * I GID dei fulfillment order che un webhook `fulfillment_orders/*` nomina.
 *
 * `order_routing_complete` porta `fulfillment_order.id`; `moved` porta
 * `original_fulfillment_order`, `moved_fulfillment_order` e talvolta
 * `source_fulfillment_order`. Nessuno dei due porta l'id dell'ORDINE: si risale
 * dal fulfillment order (`fulfillmentOrder(id:) { order { id } }`). Si accetta
 * anche un `order_id` diretto, se un giorno Shopify lo aggiungesse.
 */
export function fulfillmentOrderGidsDalWebhook(payload: Record<string, unknown>): {
  readonly fulfillmentOrderGids: readonly string[];
  readonly orderId: string | null;
} {
  const gids: string[] = [];
  const contenitori = [
    'fulfillment_order',
    'moved_fulfillment_order',
    'original_fulfillment_order',
    'source_fulfillment_order',
  ];
  let orderId: string | null = null;
  const leggiOrderId = (valore: unknown): void => {
    if (orderId === null && valore != null && String(valore).trim() !== '') {
      orderId = String(valore).trim();
    }
  };
  leggiOrderId(payload.order_id);
  for (const chiave of contenitori) {
    const fo = payload[chiave];
    if (!fo || typeof fo !== 'object') {
      continue;
    }
    const record = fo as Record<string, unknown>;
    leggiOrderId(record.order_id);
    const id = record.id;
    if (id != null && String(id).trim() !== '') {
      const testo = String(id).trim();
      gids.push(testo.startsWith('gid://') ? testo : `gid://shopify/FulfillmentOrder/${testo}`);
    }
  }
  return { fulfillmentOrderGids: [...new Set(gids)], orderId };
}

/** Perché una riga resta senza sede, con l'AZIONE che chiude il caso. */
export type MotivoRigaSenzaSede =
  | { readonly tipo: 'permesso_mancante'; readonly dettaglio: string }
  | { readonly tipo: 'lettura_fallita'; readonly dettaglio: string }
  | { readonly tipo: 'in_attesa' }
  | {
      readonly tipo: 'location_non_collegata';
      readonly shopifyLocationGid: string;
      /** Quanto di quella riga Shopify tiene ancora da evadere in quella location. */
      readonly residuoAssegnato: number;
      /** La lettura era completa: senza, l'impegno precedente non si rilascia. */
      readonly letturaCompleta: boolean;
    }
  | { readonly tipo: 'divisa'; readonly shopifyLocationGids: readonly string[] };

const AMBITO_FULFILLMENT_ORDERS = 'read_merchant_managed_fulfillment_orders';

/**
 * Il motivo «Da verificare» dell'ordine, sotto il MARCATORE che la protezione
 * delle quantità riconosce (`shopify-ordini-senza-sede.util`). Un motivo per
 * tipo, non per riga: l'operatore legge l'azione, non l'elenco.
 */
export function motivoSedeNonDeterminabile(motivi: readonly MotivoRigaSenzaSede[]): string {
  const frasi: string[] = [];
  const visti = new Set<string>();
  const aggiungi = (chiave: string, frase: string): void => {
    if (!visti.has(chiave)) {
      visti.add(chiave);
      frasi.push(frase);
    }
  };
  for (const motivo of motivi) {
    switch (motivo.tipo) {
      case 'permesso_mancante':
        aggiungi(
          motivo.tipo,
          `l'app non ha il permesso di leggere i fulfillment order di Shopify (ambito ${AMBITO_FULFILLMENT_ORDERS}): aggiungilo alla versione dell'app, poi Disconnetti e Connetti in Impostazioni → Shopify e reimporta`,
        );
        break;
      case 'lettura_fallita':
        aggiungi(
          motivo.tipo,
          `la lettura dei fulfillment order è fallita (${motivo.dettaglio.slice(0, 160)}): reimporta l'ordine`,
        );
        break;
      case 'in_attesa':
        aggiungi(
          motivo.tipo,
          "Shopify non ha ancora assegnato una sede a una o più righe: l'impegno nasce all'assegnazione",
        );
        break;
      case 'location_non_collegata':
        aggiungi(
          `${motivo.tipo}:${motivo.shopifyLocationGid}`,
          `la location Shopify ${motivo.shopifyLocationGid} assegnata da Shopify non è collegata a una sede VestiFlow: collegala in Impostazioni → Shopify → Sedi e reimporta`,
        );
        break;
      case 'divisa':
        aggiungi(
          `${motivo.tipo}:${motivo.shopifyLocationGids.join(',')}`,
          `una riga è suddivisa fra più sedi su Shopify (${motivo.shopifyLocationGids.join(', ')}): VestiFlow impegna una riga in una sola sede, l'impegno nasce alla spedizione`,
        );
        break;
    }
  }
  return `${ORDINE_SENZA_SEDE_MARCATORE}: ${frasi.join('; ')}.`;
}

/**
 * Toglie dal «Da verificare» dell'ordine il SOLO segmento della sede, lasciando
 * gli altri motivi (righe col collegamento chiuso, ecc.). I motivi si accodano
 * con « · », e il segmento della sede è quello che porta il marcatore.
 *
 * @returns il motivo residuo (`null` se non resta niente) e se qualcosa è cambiato.
 */
export function senzaMotivoSede(reviewReason: string | null): {
  readonly reviewReason: string | null;
  readonly cambiato: boolean;
} {
  if (!reviewReason || !reviewReason.includes(ORDINE_SENZA_SEDE_MARCATORE)) {
    return { reviewReason: reviewReason ?? null, cambiato: false };
  }
  const residui = reviewReason
    .split(' · ')
    .filter((segmento) => !segmento.includes(ORDINE_SENZA_SEDE_MARCATORE));
  return { reviewReason: residui.length > 0 ? residui.join(' · ') : null, cambiato: true };
}
