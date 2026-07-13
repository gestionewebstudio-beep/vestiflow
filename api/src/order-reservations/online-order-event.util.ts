import { OnlineOrderEventType } from '@prisma/client';
import type { SalesOrderSource } from '@prisma/client';

/** Suffisso breve del tipo evento nella dedupe key. */
const EVENT_KEY_SUFFIX: Record<OnlineOrderEventType, string> = {
  [OnlineOrderEventType.online_order_created]: 'created',
  [OnlineOrderEventType.online_order_updated]: 'updated',
  [OnlineOrderEventType.online_order_cancelled]: 'cancelled',
  [OnlineOrderEventType.online_order_fulfilled]: 'fulfilled',
  [OnlineOrderEventType.online_order_partially_fulfilled]: 'partially_fulfilled',
  [OnlineOrderEventType.online_order_refunded]: 'refunded',
  [OnlineOrderEventType.online_order_restocked]: 'restocked',
};

/**
 * Chiave di idempotenza dell'evento canonico (unica per tenant):
 * `{channel}:{externalOrderId}:{type}[:{suffix}]`.
 *
 * Gli eventi one-shot (cancelled, fulfilled, ...) non hanno suffisso: il
 * vincolo unique impedisce il doppio evento. Gli eventi ripetibili (updated)
 * usano un suffisso di versione (es. updated_at del payload) per distinguere
 * aggiornamenti reali dai retry dello stesso webhook.
 */
export function buildOnlineOrderDedupeKey(
  channel: SalesOrderSource,
  externalOrderId: string,
  type: OnlineOrderEventType,
  suffix?: string,
): string {
  const base = `${channel}:${externalOrderId}:${EVENT_KEY_SUFFIX[type]}`;
  return suffix ? `${base}:${suffix}` : base;
}
