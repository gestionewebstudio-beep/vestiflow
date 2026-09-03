/** Messaggi Shopify comprensibili per l'utente (it-IT). Il raw resta in DB/log. */

/**
 * Spegnere «Sincronizza con Shopify» non è arrivato fino a Shopify: il prodotto
 * può essere ancora in vendita, e VestiFlow ha rimesso in moto le giacenze
 * apposta (docs/24 §1.8).
 *
 * ⛔ Sta QUI e non nel servizio di push perché è un messaggio per l'operatore, e
 *    perché `toShopifyUserMessage` deve poterlo riconoscere: senza, un timeout
 *    lo sostituirebbe con «ha impiegato troppo tempo» — vero, e senza la parte
 *    che conta.
 */
export const SYNC_DISABLE_FAILED_MESSAGE =
  'La sincronizzazione non è stata disattivata. Il prodotto potrebbe essere ancora in vendita su Shopify';

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  webhook_partial_registration:
    'Gli aggiornamenti automatici sono attivi solo in parte. Premi «Attiva aggiornamenti automatici» per completare la configurazione.',
  webhook_registration_failed:
    'Non è stato possibile attivare gli aggiornamenti automatici su Shopify. Verifica la connessione e riprova.',
  webhook_sync_failed:
    'Un aggiornamento da Shopify non è andato a buon fine. I dati potrebbero non essere aggiornati: riprova la sincronizzazione.',
  product_webhook_failed:
    'Un prodotto non è stato aggiornato correttamente da Shopify. Usa «Importa catalogo» o la sync manuale sul prodotto.',
  location_sync_failed:
    'Le sedi Shopify non sono state sincronizzate. Premi «Sincronizza location» per riprovare.',
  webhook_disable_partial:
    'Gli aggiornamenti automatici sono disattivati in VestiFlow, ma alcuni canali potrebbero restare su Shopify. Puoi ignorare l’avviso o riprovare.',
  catalog_import_blocked:
    'Impossibile importare il catalogo: la connessione Shopify non è pronta. Ricollega lo store da Impostazioni.',
  catalog_scope_missing:
    'Mancano i permessi per leggere i prodotti su Shopify. Ricollega lo store e accetta tutti i permessi richiesti.',
  oauth_scope_not_requested:
    'La configurazione del server non richiede read_products (variabile SHOPIFY_SCOPES). Aggiorna Railway e riconnetti Shopify.',
  oauth_scope_not_granted:
    'Shopify non ha concesso read_products. In Partners abilita l’ambito Admin API Read products, salva e riconnetti il negozio.',
};

function includesAny(haystack: string, needles: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

/** Converte codice/messaggio tecnico in testo per l'interfaccia utente. */
export function toShopifyUserMessage(code: string | undefined, rawMessage: string): string {
  if (code && CODE_MESSAGES[code]) {
    return CODE_MESSAGES[code];
  }

  const raw = rawMessage.trim();
  if (!raw) {
    return 'Si è verificato un problema con Shopify. Riprova tra qualche istante.';
  }

  // Già scritto per chi legge: passa intatto, causa tecnica in coda compresa.
  if (raw.startsWith(SYNC_DISABLE_FAILED_MESSAGE)) {
    return raw.length > 500 ? `${raw.slice(0, 497)}…` : raw;
  }

  if (raw.startsWith('Shopify ') || includesAny(raw, ['shopify graphql'])) {
    return raw.length > 500 ? `${raw.slice(0, 497)}…` : raw;
  }

  if (includesAny(raw, ['transaction already closed', 'expired transaction', 'timeout'])) {
    return 'L’operazione con Shopify ha impiegato troppo tempo. Riprova: di solito al secondo tentativo va a buon fine.';
  }

  if (includesAny(raw, ['504', 'gateway timeout', 'gateway time-out'])) {
    return 'La sincronizzazione con Shopify ha impiegato troppo tempo (timeout). Riprova tra qualche istante.';
  }

  if (
    includesAny(raw, [
      'attributi categoria',
      'metafield categoria',
      'write_metaobjects',
      'read_metaobject_definitions',
      'metaobjectdefinitionbytype',
      'nessun attributo categoria',
      'category metafield',
      'metaobjectupsert',
      'metafieldsset',
      'standardmetaobject',
      'campo taxonomy obbligatorio',
      'nessun campo metaobject',
      'assenti su shopify',
      'sincronizza con shopify',
    ])
  ) {
    return raw.length > 500 ? `${raw.slice(0, 497)}…` : raw;
  }

  if (includesAny(raw, ['429', 'rate limit', 'too many requests'])) {
    return 'Shopify ha limitato temporaneamente le richieste. Attendi un minuto e riprova.';
  }

  if (
    includesAny(raw, ['read_products', 'permesso read_products', 'permesso di lettura catalogo'])
  ) {
    return 'Il collegamento Shopify è incompleto: puoi modificare il catalogo ma non importarlo. Disconnetti e riconnetti lo store per aggiornare i permessi.';
  }

  if (includesAny(raw, ['scope', 'permesso'])) {
    return 'Mancano i permessi per accedere ai prodotti Shopify. Ricollega lo store da Impostazioni.';
  }

  if (
    includesAny(raw, ['connessione shopify non attiva', 'shopify non connesso', 'not connected'])
  ) {
    return 'La connessione Shopify non è attiva. Ricollega lo store da Impostazioni.';
  }

  if (includesAny(raw, ['401', 'unauthorized', 'invalid api key', 'access token'])) {
    return 'L’accesso a Shopify non è più valido. Disconnetti e ricollega lo store da Impostazioni.';
  }

  if (includesAny(raw, ['unique constraint', 'sku', 'duplicate'])) {
    return 'Conflitto su SKU o codici prodotto. Verifica che non ci siano duplicati nel catalogo.';
  }

  if (includesAny(raw, ['shopify_app_url', 'webhook url assente'])) {
    return 'La configurazione server di Shopify non è completa. Contatta l’amministratore del gestionale.';
  }

  if (includesAny(raw, ['enrichment', 'import fallito', 'import webhook'])) {
    return 'Importazione prodotto da Shopify non riuscita. Riprova con «Importa catalogo» o la sync sul singolo prodotto.';
  }

  if (includesAny(raw, ['sync prodotto shopify'])) {
    return CODE_MESSAGES.product_webhook_failed!;
  }

  if (raw.length > 0 && raw.length <= 500) {
    return raw;
  }

  return 'Si è verificato un problema con Shopify. Riprova o contatta il supporto se l’errore continua.';
}
