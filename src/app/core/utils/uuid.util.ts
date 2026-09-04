/**
 * ⛔ **`crypto.randomUUID` NON ESISTE FUORI DAL CONTESTO SICURO**, e in
 * VestiFlow questo non è un dettaglio da manuale: è il gestionale che si apre
 * dal telefono in magazzino, cioè da `http://192.168.…`.
 *
 * Misurato in Chrome il 01/09/2026, sulla build di questa applicazione:
 *
 * ```text
 * http://127.0.0.1:4212      isSecureContext true    crypto.randomUUID  function
 * http://192.168.1.50:4212   isSecureContext FALSE   crypto.randomUUID  undefined
 *                                                    crypto.getRandomValues  function
 * ```
 *
 * ⛔ **Chiamarla lì non restituisce un valore sbagliato: LANCIA.** Ed è il
 * difetto peggiore, perché lancia in mezzo a un'azione sincrona — «Concludi
 * vendita» genera l'intento di creazione prima di partire — quindi la richiesta
 * non parte, nessun gestore d'errore la vede, nessun avviso compare. A chi
 * preme sembra soltanto che **non succeda niente**.
 *
 * ⭐ **`getRandomValues` invece c'è**, ed è la stessa sorgente di casualità: la
 * v4 si compone da sedici byte con i due campi di versione e variante imposti
 * dalla RFC 4122. Il ripiego non è «meno sicuro»: è la stessa entropia scritta
 * a mano.
 *
 * ⚠️ **Il terzo ripiego, `Math.random`, NON c'è ed è voluto.** Se un giorno
 * mancasse anche `getRandomValues` sarebbe un ambiente in cui questa
 * applicazione non deve funzionare in silenzio: meglio l'errore che un
 * identificativo prevedibile su cui si regge l'idempotenza di una vendita.
 */
export function nuovoId(): string {
  const cripto = globalThis.crypto;
  if (typeof cripto?.randomUUID === 'function') {
    return cripto.randomUUID();
  }

  const byte = new Uint8Array(16);
  cripto.getRandomValues(byte);
  // Versione 4 nel nibble alto del settimo byte, variante RFC nel nono.
  byte[6] = ((byte[6] ?? 0) & 0x0f) | 0x40;
  byte[8] = ((byte[8] ?? 0) & 0x3f) | 0x80;

  const esa = [...byte].map((b) => b.toString(16).padStart(2, '0')).join('');
  return [
    esa.slice(0, 8),
    esa.slice(8, 12),
    esa.slice(12, 16),
    esa.slice(16, 20),
    esa.slice(20),
  ].join('-');
}
