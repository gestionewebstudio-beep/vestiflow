import { shopifyGid } from './shopify-money.util';

/**
 * Id ordine Shopify normalizzato a GID, dal payload REST o webhook.
 *
 * Vive qui e non dentro il sync perché lo usano in due: chi importa l'ordine e
 * chi confronta l'elenco remoto con quello locale per scoprire i cancellati. Le
 * due normalizzazioni DEVONO coincidere — se divergono, il confronto segnala
 * come spariti ordini che ci sono, che è il modo peggiore di sbagliare.
 */
export function extractShopifyOrderGid(order: Record<string, unknown>): string | null {
  if (typeof order.admin_graphql_api_id === 'string') {
    return order.admin_graphql_api_id;
  }
  if (order.id != null) {
    return shopifyGid('Order', String(order.id));
  }
  return null;
}
