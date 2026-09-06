/**
 * **I parametri della ricerca articolo per nome, in un posto solo.**
 *
 * Sono la ricerca di §9 della specifica righe documento — quella che si apre
 * digitando nel campo nome — e vanno tenuti distinti dalla corrispondenza
 * **esatta** dei campi codice (§10, `document-code-match.util`): là si conferma
 * un codice che si conosce, qui si cerca un articolo che non si sa dov'è.
 *
 * ── Perché stanno qui ──────────────────────────────────────────────────────
 *
 * ⛔ Erano **sette copie**, una per maschera: Ordine cliente, Arrivo merce,
 * Documenti vendita, Ordine fornitore, Trasferimento, Rettifica, Registra
 * movimento. Tutte e sette con gli stessi valori — ma per coincidenza tenuta a
 * mano, non per regola: cambiarne uno avrebbe cambiato il comportamento di una
 * maschera sola, e nessun test se ne sarebbe accorto.
 *
 * È il difetto che la specifica vieta esplicitamente (§28, «non costruire
 * motori ricerca locali») e che §9.1 chiude: «un solo motore».
 *
 * ⚠️ `scripts/check-search-config.mjs` fa fallire il lint se qualcuno ne
 * ridichiara una in una maschera: senza la guardia, la settima copia torna al
 * primo che ha fretta.
 */

/**
 * Da quanti caratteri parte la ricerca per nome.
 *
 * Due, ed è allineato all'apertura del pannello dei suggerimenti: la ricerca
 * parte nello stesso momento in cui l'elenco compare, così non si vede un
 * elenco vuoto che si riempie dopo.
 */
export const VARIANT_SEARCH_MIN_CHARS = 2;

/**
 * Quanto si aspetta prima di interrogare il server, in millisecondi.
 *
 * Serve a non partire a ogni tasto: chi digita «magli» farebbe cinque ricerche
 * di cui quattro buttate.
 */
export const VARIANT_SEARCH_DEBOUNCE_MS = 300;

/**
 * Quanti articoli si chiedono al server per una ricerca per nome.
 *
 * ⚠️ Non è il numero di risultati che esistono: è quanti se ne mostrano. Un
 * elenco più lungo di così non si scorre — si cerca meglio.
 */
export const VARIANT_SEARCH_PAGE_SIZE = 30;
