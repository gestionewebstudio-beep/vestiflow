/**
 * Quantità vendibile da pubblicare su Shopify.
 *
 * API utilizzata: REST `POST /inventory_levels/set.json` — campo `available`
 * (quantità vendibile del canale, NON giacenza fisica `on_hand`).
 *
 * ```text
 *   shopifyPublishableAvailable = max(0, available)
 * ```
 *
 * ⭐ **Il numero entra già fatto: è il Disponibile del gestionale**, la colonna
 *    `inventory_levels.available` — la stessa che l'operatore legge a schermo
 *    nelle Giacenze, nella Situazione magazzino e nell'elenco articoli. Qui
 *    resta soltanto la trasformazione verso il canale: il clamp a zero.
 *
 * ⛔ **Qui c'era `max(0, onHand - committed - safetyStock)`**, cioè un secondo
 *    calcolo del Disponibile accanto a quello del gestionale. Finché i due
 *    coincidevano non si vedeva; il giorno che avessero divergere, l'operatore
 *    avrebbe letto un numero e il canale ne avrebbe ricevuto un altro — e
 *    nessuno dei due sarebbe stato dichiarato sbagliato. Sostituito il
 *    09/09/2026, dopo aver **verificato** che `available` è mantenuto da tutti
 *    i percorsi applicativi che scrivono giacenza e impegni (censimento delle
 *    sette aree e prove `invariante-disponibile`).
 *
 * ⛔ **La scorta di sicurezza NON esiste più**, e non è una svista: il
 *    parametro c'era ma entrambi i chiamanti passavano `0`, e la decisione del
 *    09/09/2026 è esplicita — nessuna scorta di sicurezza. Un parametro che
 *    nessuno usa è un comando che non comanda, e prima o poi qualcuno lo
 *    scopre e lo valorizza credendo che sia configurato da qualche parte.
 *
 * ⚠️ **Il negativo LOCALE resta intatto.** Il clamp è una regola del canale,
 *    non del gestionale: Shopify non accetta quantità negative, VestiFlow le
 *    conserva perché dicono la verità (venduto più di quanto c'era).
 */
export function computeShopifyPublishableAvailable(available: number): number {
  return Math.max(0, available);
}
