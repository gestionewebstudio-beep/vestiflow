import { ConflictException } from '@nestjs/common';

/**
 * Il cestino di prodotti e varianti — la regola di CHI ci puo' entrare.
 *
 * ⭐ **Prima tranche: soltanto articoli ESCLUSIVAMENTE LOCALI.** Deciso dal
 *    proprietario l'08/09/2026. Per gli articoli collegati a Shopify il cestino
 *    attende il **ritiro dalla vendita**, che la specifica prevede gia' (§1.8)
 *    ma la cui forma tecnica non e' ancora decidibile (`docs/24` §0-bis voce 1,
 *    §8.5.7 passi 7-8: si decide DOPO il collaudo mutativo sullo shop di
 *    sviluppo, perche' non e' deducibile dalla documentazione Shopify).
 *
 * ⚠️ **E' una limitazione temporanea del RILASCIO, non una regola nuova.** Il
 *    comportamento definitivo resta quello di §1.8 — «spostare nel cestino
 *    toglie dalla vendita Shopify ma non cancella» — e questo file sparisce, o
 *    si riduce, quando il ritiro esiste.
 *
 * ⛔ **«Non collegato» NON significa «connessione disattivata» ne'
 *    «sincronizzazione spenta».** Sono tre assi diversi (§1.5), e confonderli
 *    farebbe entrare nel cestino proprio gli articoli che stanno su Shopify:
 *
 *    | asse                        | dove vive                        |
 *    | --------------------------- | -------------------------------- |
 *    | collegamento                | `shopifyProductId` / `shopifyVariantId` |
 *    | interruttore del prodotto   | `shopifySyncEnabled`             |
 *    | stato della connessione     | `ShopifyConnection.status`       |
 *
 *    Un prodotto con la sincronizzazione spenta **resta collegato**: gli ID
 *    Shopify sono conservati apposta (§1.8, «Mapping e ID Shopify restano
 *    sempre conservati»), e il prodotto remoto continua a esistere.
 *
 * ⭐ **Per un tenant SENZA Shopify la limitazione non si vede**: nessun articolo
 *    porta un identificativo remoto, quindi il cestino e' disponibile per tutto
 *    il catalogo.
 */

export const SHOPIFY_LINKED_TRASH_MESSAGE =
  'Il cestino non è ancora disponibile per gli articoli collegati a Shopify: ' +
  'serve prima il ritiro dalla vendita. Puoi renderlo Non attivo.';

/**
 * Rifiuta il cestino su un articolo collegato a Shopify.
 *
 * ⚠️ **Per la VARIANTE si guardano DUE identificativi**, e non e' ridondanza:
 *    `persistShopifyIds` non scrive `shopifyVariantId` per le varianti senza
 *    SKU locale o senza corrispondenza remota, quindi una variante di un
 *    prodotto pubblicato puo' averlo `null` ed essere comunque sul canale. Il
 *    collegamento del PRODOTTO basta a fermarla.
 */
export function assertLocalOnlyTrash(
  identificativiRemoti: readonly (string | null | undefined)[],
): void {
  if (identificativiRemoti.some((id) => id != null && id !== '')) {
    throw new ConflictException(SHOPIFY_LINKED_TRASH_MESSAGE);
  }
}
