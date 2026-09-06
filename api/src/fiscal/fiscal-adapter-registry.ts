/**
 * Registro STATICO degli adapter fiscali compilati nell'applicazione.
 *
 * ⛔ **È una whitelist di sicurezza, non un elenco di comodo** (`docs/25` §10,
 * garanzia 3). Finché `FiscalDevice.brand` era un enum, la whitelist dei driver
 * la faceva il database; aperta `adapterKey` a testo libero, la whitelist deve
 * tornare esplicita **nel codice** — o un valore scritto da un tenant
 * diventerebbe il nome di qualcosa da caricare.
 *
 * ⛔ **Mai import dinamici, percorsi di file, URL o esecuzione di codice.** Una
 * chiave sintatticamente valida ma non registrata si **rifiuta**.
 *
 * ⭐ **Oggi è VUOTO, e non è un difetto**: C3 non fiscalizza e non ha adapter
 * concreti. Un dispositivo si può quindi censire e una sessione si può aprire
 * senza dispositivo, ma **nessun dispositivo può essere selezionato come
 * operativo** finché il suo adapter non esiste davvero. È il comportamento
 * voluto: meglio non poter emettere che credere di poterlo fare.
 *
 * ⚠️ **Nessun produttore è predeterminato.** Il primo adapter si sceglie in C5,
 * quando saranno disponibili dispositivo, firmware e documentazione.
 */

/** Chiave di un adapter: `<fornitore>.<protocollo>.<versione>`. */
export type FiscalAdapterKey = string;

/**
 * Le chiavi note all'applicazione.
 *
 * ⚠️ Si aggiunge una voce qui **insieme** all'adapter che la implementa, mai
 * prima: una chiave registrata senza codice dietro fa passare la validazione e
 * fallisce al primo tentativo di emissione, che è il posto peggiore in cui
 * scoprirlo.
 */
const ADAPTER_REGISTRATI: ReadonlySet<FiscalAdapterKey> = new Set<FiscalAdapterKey>([
  // (vuoto: nessun adapter concreto prima di C5)
]);

/**
 * Il registro in uso. È una variabile e non una costante **solo** per poterlo
 * sostituire nei test: la produzione non lo tocca mai.
 */
let registroCorrente: ReadonlySet<FiscalAdapterKey> = ADAPTER_REGISTRATI;

/** L'adapter è compilato nell'applicazione? */
export function isFiscalAdapterRegistered(key: string | null | undefined): boolean {
  if (!key) {
    return false;
  }
  return registroCorrente.has(key);
}

/** Le chiavi note, per messaggi e diagnostica. Mai per costruire una chiave. */
export function registeredFiscalAdapters(): readonly FiscalAdapterKey[] {
  return [...registroCorrente].sort();
}

/**
 * Sostituisce il registro **nei test**, e restituisce la funzione che ripristina
 * quello vero.
 *
 * ⚠️ Il ripristino va chiamato: un registro lasciato finto fa passare prove che
 * in produzione fallirebbero.
 */
export function withFiscalAdapters(chiavi: readonly FiscalAdapterKey[]): () => void {
  const precedente = registroCorrente;
  registroCorrente = new Set(chiavi);
  return () => {
    registroCorrente = precedente;
  };
}
