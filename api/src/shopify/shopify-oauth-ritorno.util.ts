/**
 * L'indirizzo a cui l'OAuth Shopify RIMANDA l'operatore — in un posto solo.
 *
 * ⛔ Qui c'era `/app/settings?shopify=…` scritto nove volte fra servizio e
 *    controller: la RADICE delle Impostazioni, dove il pannello Shopify non
 *    sta più dall'11/09/2026 (`settings.routes.ts`, rotta `shopify`). L'esito
 *    arrivava su una pagina che non lo legge. Misurato al collaudo del
 *    13/09/2026: «Aggiorna» su Shopify riportava alle Impostazioni generali,
 *    senza banner e col parametro appeso all'indirizzo — mentre l'e2e simulava
 *    il ritorno già sulla sotto-pagina, e per questo era verde.
 *
 * ⚠️ La pagina la conosce il frontend; qui si nomina una volta, e la prova
 *    tiene ferma la coppia pagina + parametro.
 */
export const PAGINA_IMPOSTAZIONI_SHOPIFY = '/app/settings/shopify';

/** Gli esiti che il pannello Shopify legge da `?shopify=`. */
export type EsitoRitornoShopify =
  | 'connected'
  | 'setup'
  | 'error'
  | 'channel_not_enabled'
  | 'shop_change_blocked'
  | 'shop_owned_elsewhere'
  | 'shop_identity_unavailable'
  | 'connection_conflict';

export function indirizzoRitornoShopify(
  frontendUrl: string,
  esito: EsitoRitornoShopify,
  parametri: Readonly<Record<string, string>> = {},
): string {
  const coda = Object.entries(parametri)
    .map(([chiave, valore]) => `&${chiave}=${encodeURIComponent(valore)}`)
    .join('');
  return `${frontendUrl}${PAGINA_IMPOSTAZIONI_SHOPIFY}?shopify=${esito}${coda}`;
}
