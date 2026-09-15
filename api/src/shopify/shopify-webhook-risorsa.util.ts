import { fulfillmentOrderGidsDalWebhook } from './shopify-fulfillment-orders.util';

/**
 * La RISORSA a cui una notifica webhook appartiene (docs/30 §7.1.2, decisione 1).
 *
 * ⭐ L'ordine di elaborazione si conserva PER RISORSA, non per negozio: l'ordine
 *    `#1001` e il prodotto `42` non dipendono l'uno dall'altro, e una ricevuta in
 *    attesa di ritentativo non deve fermare le risorse indipendenti. Tutti i topic
 *    dello stesso ordine convergono sulla STESSA chiave: `orders/*` e
 *    `fulfillment_orders/*` portano l'id dell'ordine in posti diversi
 *    (`id` numerico, `admin_graphql_api_id`, `order_id`, dentro `fulfillment_order`)
 *    e qui si normalizzano tutti all'id legacy.
 *
 * ⛔ Se la risorsa NON si risolve dal payload la risposta è `null`, e `null` non è
 *    una chiave: chi la porta non scavalca e non è scavalcato da nessun evento
 *    dello stesso negozio (il lavoratore la tratta come «correlata a tutto»).
 *    Attribuire una chiave inventata permetterebbe di superare eventi correlati.
 */
export function risorsaDelWebhook(topic: string, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const dati = payload as Record<string, unknown>;
  const famiglia = topic.split('/')[0];
  switch (famiglia) {
    case 'orders': {
      const id = idLegacy(dati['id']) ?? idLegacy(dati['admin_graphql_api_id']);
      return id ? `ordine:${id}` : null;
    }
    case 'fulfillment_orders': {
      const id = idLegacy(fulfillmentOrderGidsDalWebhook(dati).orderId);
      return id ? `ordine:${id}` : null;
    }
    case 'products': {
      const id = idLegacy(dati['id']) ?? idLegacy(dati['admin_graphql_api_id']);
      return id ? `prodotto:${id}` : null;
    }
    case 'customers': {
      const id = idLegacy(dati['id']) ?? idLegacy(dati['admin_graphql_api_id']);
      return id ? `cliente:${id}` : null;
    }
    case 'inventory_levels': {
      const item = idLegacy(dati['inventory_item_id']);
      const sede = idLegacy(dati['location_id']);
      return item && sede ? `inventario:${item}@${sede}` : null;
    }
    default:
      return null;
  }
}

/** `123`, `"123"` e `gid://shopify/Order/123` valgono tutti `123`; il resto è assente. */
function idLegacy(valore: unknown): string | null {
  if (valore === null || valore === undefined) {
    return null;
  }
  const testo = String(valore).trim();
  if (testo === '') {
    return null;
  }
  const gid = /^gid:\/\/shopify\/[A-Za-z]+\/(\d+)(?:\?.*)?$/.exec(testo);
  if (gid) {
    return gid[1]!;
  }
  return /^\d+$/.test(testo) ? testo : null;
}
