/**
 * Che cosa FA ogni notifica di Shopify, detto in italiano: è ciò che l'avviso visibile
 * nomina quando una notifica manca («la sede assegnata agli ordini non arriva più»), al
 * posto del nome tecnico del topic, che sta nel dettaglio richiudibile (proprietario,
 * 14/09/2026: «indica quali funzioni sono interessate, in italiano comprensibile; i nomi
 * tecnici esatti dei topic stanno nel dettaglio»).
 *
 * I dieci topic sono quelli che l'API registra (`shopify-sync.service`). Un topic ignoto
 * resta col suo nome: meglio un nome tecnico che una funzione inventata.
 */
const FUNZIONE_DEL_TOPIC: Readonly<Record<string, string>> = {
  'orders/create': 'gli ordini nuovi',
  'orders/updated': 'gli aggiornamenti degli ordini',
  'orders/cancelled': 'gli annullamenti degli ordini',
  'customers/create': 'i clienti nuovi',
  'customers/update': 'gli aggiornamenti dei clienti',
  'inventory_levels/update': 'le quantità del negozio',
  'products/create': 'gli articoli nuovi del negozio',
  'products/update': 'le modifiche agli articoli del negozio',
  'fulfillment_orders/moved': 'la sede assegnata agli ordini',
  'fulfillment_orders/order_routing_complete': 'la sede assegnata agli ordini',
};

/** La funzione di un topic, o il topic stesso se non è fra quelli previsti. */
export function funzioneDellaNotifica(topic: string): string {
  return FUNZIONE_DEL_TOPIC[topic] ?? topic;
}

/**
 * Le funzioni interessate da un elenco di topic, senza ripetizioni e legate in una frase:
 * «la sede assegnata agli ordini», «gli ordini nuovi e i clienti nuovi»,
 * «gli ordini nuovi, i clienti nuovi e le quantità del negozio».
 */
export function descriviNotifiche(topics: readonly string[]): string {
  const funzioni = [...new Set(topics.map(funzioneDellaNotifica))];
  if (funzioni.length <= 1) {
    return funzioni[0] ?? '';
  }
  return `${funzioni.slice(0, -1).join(', ')} e ${funzioni[funzioni.length - 1]}`;
}
