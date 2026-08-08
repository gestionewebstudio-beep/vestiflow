/** Topic webhook Shopify registrati da VestiFlow post-OAuth. */
export const SHOPIFY_WEBHOOK_TOPICS = [
  'inventory_levels/update',
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'customers/create',
  'customers/update',
  'products/create',
  'products/update',
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];

/** Richiedono Protected customer data approval su Shopify Partners. */
export const SHOPIFY_PROTECTED_WEBHOOK_TOPICS: ReadonlySet<ShopifyWebhookTopic> = new Set([
  'orders/create',
  'orders/updated',
  'orders/cancelled',
  'customers/create',
  'customers/update',
]);

export interface ShopifyWebhookRegistrationResult {
  readonly registered: readonly ShopifyWebhookTopic[];
  readonly skipped: readonly ShopifyWebhookTopic[];
  readonly failed: readonly { topic: ShopifyWebhookTopic; message: string }[];
}

/**
 * Cosa VestiFlow ha osservato sul negozio: quali topic, e verso quale indirizzo.
 *
 * Le due cose viaggiano insieme perche' separate non dicono niente: un elenco di topic
 * senza l'indirizzo non dice se quelle sottoscrizioni consegnano qui o altrove.
 */
export interface ShopifyWebhookObservation {
  readonly topics: readonly string[];
  readonly address: string;
}

/**
 * L'elenco salvato e' un insieme: si deduplica e si ordina, cosi' non dipende da come
 * Shopify ha risposto e due osservazioni uguali risultano uguali.
 */
export function normalizeObservedTopics(topics: readonly string[]): readonly string[] {
  return [...new Set(topics)].sort();
}

/**
 * I topic attesi che non risultano fra quelli osservati sul negozio.
 *
 * Va chiamata SOLO quando un'osservazione esiste davvero. Su una connessione mai
 * verificata l'elenco osservato e' vuoto, e qui uscirebbero «mancano tutti e otto»:
 * sarebbe ignoranza travestita da diagnosi. Chi legge deve prima guardare
 * `webhookTopicsKnown`.
 *
 * E' il confronto che nessuna riga faceva: `orders/cancelled` e' entrato nella lista
 * attesa il 13/07 e non e' mai stato registrato sui due negozi, perche' la
 * registrazione avviene solo all'OAuth o su richiesta esplicita. Il conteggio salvato
 * diceva «7» ed era pure esatto.
 */
export function missingShopifyWebhookTopics(
  observed: readonly string[],
): readonly ShopifyWebhookTopic[] {
  const present = new Set(observed);
  return SHOPIFY_WEBHOOK_TOPICS.filter((topic) => !present.has(topic));
}

/** I topic osservati che VestiFlow non si aspetta piu': residui di versioni precedenti. */
export function unexpectedShopifyWebhookTopics(observed: readonly string[]): readonly string[] {
  const expected = new Set<string>(SHOPIFY_WEBHOOK_TOPICS);
  return [...new Set(observed)].filter((topic) => !expected.has(topic)).sort();
}

/** Le sottoscrizioni che consegnano a uno stesso indirizzo. */
export interface ShopifyWebhookAddressGroup {
  readonly address: string;
  readonly topics: readonly string[];
}

/**
 * Raggruppa le sottoscrizioni per indirizzo di consegna.
 *
 * Il raggruppamento non e' un dettaglio di presentazione: piu' di un gruppo significa che
 * esistono sottoscrizioni verso indirizzi diversi, cioe' che si sono SOMMATE invece di
 * sostituirsi — lo scenario del registro 2.2-bis, dove un cambio di indirizzo lascia vive
 * le vecchie e VestiFlow non le riconosce piu'.
 */
export function groupWebhooksByAddress(
  subscriptions: readonly { readonly topic: string; readonly address: string }[],
): readonly ShopifyWebhookAddressGroup[] {
  const byAddress = new Map<string, Set<string>>();
  for (const subscription of subscriptions) {
    const topics = byAddress.get(subscription.address) ?? new Set<string>();
    topics.add(subscription.topic);
    byAddress.set(subscription.address, topics);
  }

  return [...byAddress.entries()]
    .map(([address, topics]) => ({ address, topics: [...topics].sort() }))
    .sort((a, b) => a.address.localeCompare(b.address));
}

/**
 * Quale gruppo descrive le sottoscrizioni «di VestiFlow».
 *
 * L'indirizzo configurato vince sempre, quando esiste: e' l'unico a cui gli eventi arrivano
 * davvero qui. Se non c'e' nessuna sottoscrizione verso di lui si riporta comunque quella
 * piu' popolosa fra le altre — cosi' la coppia (indirizzo, topic) resta coerente e la
 * schermata puo' dire «consegnano LI'» invece di tacere. A parita' vince il primo per
 * indirizzo: i gruppi arrivano gia' ordinati, quindi la scelta e' deterministica.
 */
export function chooseObservedAddressGroup(
  groups: readonly ShopifyWebhookAddressGroup[],
  configuredAddress: string | null,
): ShopifyWebhookAddressGroup | null {
  if (configuredAddress) {
    const configured = groups.find((group) => group.address === configuredAddress);
    if (configured) {
      return configured;
    }
  }

  if (groups.length === 0) {
    return null;
  }

  return groups.reduce((best, group) => (group.topics.length > best.topics.length ? group : best));
}
