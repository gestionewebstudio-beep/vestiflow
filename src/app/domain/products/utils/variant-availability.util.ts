import type { VariantSummary } from '../models/variant-summary.model';

/**
 * **L'avviso di disponibilità: quanto ce n'è, e cosa si dice quando non basta.**
 *
 * ## Perché sta qui e non nelle maschere
 *
 * ⛔ La regola è una sola e vale per ogni documento che scarica: l'insufficienza
 * di stock **avvisa e non blocca mai**, e Giacenza e Disponibile possono
 * diventare negative (`regole-gestionale` «Controlli e validazioni»,
 * `CONTRATTO-COMUNE-DOCUMENTI` §stock, `11` BANK-016).
 *
 * ⚠️ Escluso il blocco, **l'avviso è l'unico presidio rimasto**. Dove manca, lo
 * scarico oltre disponibile passa in perfetto silenzio — ed è esattamente ciò che
 * succedeva alla Fattura accompagnatoria, misurato il 26/08/2026: dei tre tipi
 * che scaricano (`sales_ddt`, `manual_unload`, `invoice_accompanying`) i primi
 * due avvisavano e il terzo no.
 *
 * ⭐ Estratto invece di copiato. La logica esisteva inline nell'Ordine cliente;
 * riscriverla nella maschera dei documenti di vendita avrebbe fatto la **terza**
 * implementazione dello stesso avviso — la Vendita al banco ha già la sua, con
 * un'altra strada per il dato. È la famiglia di difetti che questo progetto ha
 * già pagato: due copie dello stesso messaggio che divergevano **su un
 * apostrofo**, e nessun test lo vedeva.
 *
 * ## ⛔ Cosa NON decide
 *
 * **Se la riga movimenti magazzino.** Quella è una proprietà della riga
 * (`loadsStock` / `commitsStock`), e il chiamante la conosce. Qui non entra
 * nessun tipo documento: una funzione che sapesse distinguere una Fattura
 * accompagnatoria da un DDT sarebbe il ramo per tipo che si voleva evitare.
 */

/** Il messaggio, in un posto solo: due copie divergono, e si vede tardi. */
export function availabilityHintText(available: number): string {
  return `disponibili solo ${Math.max(0, available)}`;
}

/**
 * La disponibilità effettiva della variante, o `null` quando **non si applica**.
 *
 * `null` non è zero, ed è la distinzione che conta: un servizio e un articolo
 * che non gestisce magazzino non hanno disponibilità, quindi non possono
 * superarla e non devono avvisare. Un articolo che la gestisce ma non ne ha
 * notizia vale **zero**, e quello sì che avvisa.
 *
 * `ownReserved` è l'impegno che il documento stesso ha già prodotto: senza
 * riaggiungerlo, un documento che si riapre in modifica si vedrebbe avvisare per
 * la propria stessa prenotazione. Chi non impegna passa `0`.
 */
export function variantEffectiveAvailable(
  summary: Pick<VariantSummary, 'kind' | 'managesStock' | 'stockAvailable'> | null | undefined,
  ownReserved = 0,
): number | null {
  if (!summary || summary.kind === 'service' || summary.managesStock === false) {
    return null;
  }
  if (summary.stockAvailable == null) {
    return 0;
  }
  return summary.stockAvailable + ownReserved;
}

/** La quantità chiesta supera il disponibile. `null` = non si applica, mai avviso. */
export function quantityExceedsAvailability(available: number | null, quantity: number): boolean {
  if (available == null) {
    return false;
  }
  return quantity > available;
}

/**
 * Il testo dell'avviso, o `null` quando non c'è niente da dire.
 *
 * ⚠️ **Non blocca e non deve essere usato per bloccare**: chi lo chiama lo mostra
 * e lascia salvare. È scritto qui perché il prossimo che aggiunge un documento
 * che scarica lo legga prima di inventarsi un rifiuto.
 */
export function variantAvailabilityHint(available: number | null, quantity: number): string | null {
  if (!quantityExceedsAvailability(available, quantity)) {
    return null;
  }
  return availabilityHintText(available ?? 0);
}
