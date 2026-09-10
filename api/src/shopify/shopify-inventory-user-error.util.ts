/**
 * Come si legge un `userErrors` di `inventorySetQuantities`.
 *
 * ⛔ **NON tutti gli `userErrors` sono rifiuti definitivi**, e trattarli come
 *    un blocco solo è il difetto che questo file chiude. Il caso che lo
 *    dimostra è `IDEMPOTENCY_CONCURRENT_REQUEST` — «This request is currently
 *    in progress» — che letto come un rifiuto faceva chiudere il tentativo,
 *    dimenticare la chiave e, al giro dopo, aprire un invio nuovo e
 *    indipendente **mentre il primo stava ancora andando a segno**.
 *
 * ## ⛔ Il riconoscimento è per CODICE ESATTO, e prima non lo era
 *
 * Qui c'era una lettura per **frammenti** del nome (`COMPARE`, `STALE`,
 * `INVALID`, `MISMATCH`…) più una lettura del **testo del messaggio**, difesa
 * così: «sbagliare un nome di codice produce una prudenza in più, mai una
 * scrittura in più».
 *
 * ⛔ **Quella difesa era falsa, e in un modo preciso: un frammento PROMUOVE uno
 *    sconosciuto a una classe che CONCLUDE.** Due contro esempi, entrambi
 *    codici veri dell'enum:
 *
 *    | Codice                               | Significato documentato             | Con i frammenti             |
 *    | ------------------------------------ | ----------------------------------- | --------------------------- |
 *    | `COMPARE_QUANTITY_REQUIRED`          | manca il parametro di confronto     | ⛔ «divergenza di quantità» |
 *    | `IDEMPOTENCY_KEY_PARAMETER_MISMATCH` | stessa chiave, parametri diversi    | ⛔ chiudeva il tentativo    |
 *
 *    Nel primo caso si presentava come differenza di giacenza un parametro
 *    mancante; nel secondo si buttava via l'operazione originale — cioè proprio
 *    ciò che la chiave di idempotenza serve a non perdere.
 *
 * ⭐ **Adesso la mappa è esplicita e l'incontro è per UGUAGLIANZA.** Ciò che non
 *    è in tabella è `sconosciuto`, e `sconosciuto` **conserva il tentativo**: da
 *    qui la proprietà di prudenza diventa vera, perché nessun nome non previsto
 *    può più cadere in una classe che conclude.
 *
 * ⛔ **E il MESSAGGIO non decide più niente.** Resta informativo — finisce nella
 *    nota, perché è ciò che un operatore legge — ma non chiude un tentativo: un
 *    testo può cambiare senza che cambi la versione dell'API.
 *
 * ## DOCUMENTATO e COLLAUDATO sono due cose diverse
 *
 * | Livello                          | Che cosa significa                              |
 * | -------------------------------- | ----------------------------------------------- |
 * | **documentato da Shopify**       | letto sulla documentazione pubblica dell'enum   |
 * | **collaudato contro il negozio** | osservato rispondere così da uno shop vero      |
 *
 * ⭐ **I codici qui sotto sono DOCUMENTATI, non collaudati.** Sono i diciassette
 *    valori di `InventorySetQuantitiesUserErrorCode` letti sulla documentazione
 *    pubblica il 10/09/2026. Nessuno di essi è stato provocato su uno shop vero.
 *
 * ⚠️ **E la pagina non si è lasciata ancorare a una versione**: chiedendo il
 *    percorso di `2025-07` la documentazione ha restituito lo **stesso**
 *    contenuto dichiarando `2026-07`. Quindi «documentato per `2026-07`»
 *    significa qui «la documentazione dichiara `2026-07`», non «verificato che
 *    `2026-07` differisca dalle altre versioni».
 *
 * ⭐ **Ed è la ragione per cui la mappa regge comunque lo scarto**: se una
 *    versione portasse un valore in più, o con un altro nome, quel valore cade
 *    in `sconosciuto` e il tentativo si conserva. L'unica cosa che la mappa non
 *    può fare è concludere per conto proprio.
 *
 * ## Le cinque classi
 *
 * | Classe             | Che cosa dice il canale                         | Tentativo   |
 * | ------------------ | ----------------------------------------------- | ----------- |
 * | **confronto**      | la quantità là non è quella che credevamo       | si chiude   |
 * | **validazione**    | la richiesta non è accettabile così com'è       | si chiude   |
 * | **concorrenza**    | quella stessa operazione **è in corso**         | ⛔ intatto  |
 * | **non ripetibile** | la chiave non può più ripetere quell'operazione | ⛔ intatto  |
 * | **sconosciuto**    | qualcosa che questo codice non sa leggere       | ⛔ intatto  |
 *
 * ⛔ **Si chiude SOLO quando il significato documentato permette di concludere
 *    che quell'operazione non è stata applicata.** Le altre tre non lo
 *    permettono, ognuna per una ragione sua, e in tutte e tre non si tocca
 *    niente: né chiave, né parametri, né nota, né marcatore.
 */

/** Un `userError` del canale, con il **codice**: senza, non si può classificare. */
export interface ShopifyUserError {
  readonly field: readonly string[] | null;
  readonly message: string;
  readonly code: string | null;
}

/** Le cinque letture possibili di un rifiuto. `null` quando non c'è rifiuto. */
export type ClasseRifiutoInventario =
  | 'confronto'
  | 'validazione'
  | 'concorrenza'
  | 'non_ripetibile'
  | 'sconosciuto';

/**
 * ⭐ **Documentato**: «This request is currently in progress, please try again.»
 *    L'operazione con questa chiave è ancora in corso — non è un rifiuto.
 */
export const CODICE_CONCORRENZA = 'IDEMPOTENCY_CONCURRENT_REQUEST';

/**
 * ⭐ **Documentato**: il confronto che VestiFlow usa davvero. Mandiamo
 *    `changeFromQuantity`, quindi è questo il codice che un confronto fallito
 *    produce sul nostro percorso.
 */
export const CODICE_CONFRONTO_FALLITO = 'CHANGE_FROM_QUANTITY_STALE';

/**
 * ⭐ **Documentato**: la chiave riusata con parametri diversi. Non dice che
 *    l'operazione di allora non sia stata applicata.
 */
export const CODICE_PARAMETRI_INCOERENTI = 'IDEMPOTENCY_KEY_PARAMETER_MISMATCH';

/**
 * ⭐ **Documentato**: il parametro di confronto manca. ⛔ Non è una differenza
 *    di giacenza.
 */
export const CODICE_CONFRONTO_MANCANTE = 'COMPARE_QUANTITY_REQUIRED';

/**
 * ⚠️ **COLLAUDATO, ma NON usato per classificare.** È il messaggio che lo shop
 *    di sviluppo ha davvero restituito il 03/09/2026 forzando un
 *    `changeFromQuantity` sbagliato — e **non coincide** con la descrizione
 *    dell'enum, che dice «The changeFromQuantity value does not match persisted
 *    value.».
 *
 * ⛔ **Che due testi diversi descrivano lo stesso codice è esattamente il motivo
 *    per cui il messaggio non decide.** Serve al simulatore, per riprodurre ciò
 *    che il canale dice davvero, e alla nota che l'operatore legge. Nient'altro.
 */
export const MESSAGGIO_CONFRONTO_FALLITO =
  'The changeFromQuantity argument no longer matches the persisted quantity.';

/**
 * I diciassette valori di `InventorySetQuantitiesUserErrorCode`, con la classe
 * che il loro significato **documentato** permette di attribuire.
 *
 * ⛔ **Nessuna classe attribuita per somiglianza del nome.** Dove il testo
 *    documentato non permette di concludere, la classe è una di quelle che
 *    conservano il tentativo — e il commento dice perché.
 */
const CLASSE_PER_CODICE: Readonly<Record<string, ClasseRifiutoInventario>> = {
  // ── il confronto: la quantità persistita non è quella dichiarata ──────────
  //    «The changeFromQuantity value does not match persisted value.»
  CHANGE_FROM_QUANTITY_STALE: 'confronto',
  //    «The compareQuantity value does not match persisted value.» — la forma
  //    con l'argomento vecchio, che questo percorso non manda: se arrivasse
  //    sarebbe comunque una divergenza di quantità.
  COMPARE_QUANTITY_STALE: 'confronto',

  // ⛔ **NON è una divergenza**, ed è il primo contro esempio ai frammenti:
  //    «The compareQuantity argument must be given to each quantity or ignored
  //    using ignoreCompareQuantity.» Manca un PARAMETRO. Presentarlo come
  //    differenza di giacenza manderebbe a riconciliare quantità che nessuno ha
  //    ancora confrontato.
  COMPARE_QUANTITY_REQUIRED: 'validazione',

  // ── idempotenza ──────────────────────────────────────────────────────────
  //    «This request is currently in progress, please try again.»
  IDEMPOTENCY_CONCURRENT_REQUEST: 'concorrenza',
  // ⛔ **Non autorizza a dimenticare l'operazione originale**, ed è il secondo
  //    contro esempio: «The same idempotency key cannot be used with different
  //    operation parameters.» Dice che i parametri non corrispondono, NON che
  //    l'operazione di allora non sia stata applicata. Chiave e parametri si
  //    conservano, l'incoerenza si segnala, e non si apre niente di iniziativa.
  IDEMPOTENCY_KEY_PARAMETER_MISMATCH: 'non_ripetibile',
  // ⚠️ «A previous request with this idempotency key failed. Retry with a new
  //    idempotency key.» Dice che un tentativo precedente è **fallito**, non che
  //    non abbia avuto effetto — un guasto può cadere dopo l'applicazione. E la
  //    protezione di quella chiave non c'è più: ripeterla non deduplica.
  //    ⛔ Generare una chiave nuova di iniziativa sarebbe un invio indipendente
  //    su un esito ignoto: si conserva e si chiede riconciliazione.
  IDEMPOTENCY_PREVIOUS_ATTEMPT_FAILED: 'non_ripetibile',

  // ── la richiesta non è accettabile: la mutation non ha eseguito ───────────
  INVALID_INVENTORY_ITEM: 'validazione',
  INVALID_LOCATION: 'validazione',
  INVALID_NAME: 'validazione',
  INVALID_QUANTITY_NEGATIVE: 'validazione',
  INVALID_QUANTITY_TOO_HIGH: 'validazione',
  INVALID_QUANTITY_TOO_LOW: 'validazione',
  INVALID_REASON: 'validazione',
  INVALID_REFERENCE_DOCUMENT: 'validazione',
  ITEM_NOT_STOCKED_AT_LOCATION: 'validazione',
  NO_DUPLICATE_INVENTORY_ITEM_ID_GROUP_ID_PAIR: 'validazione',
  NON_MUTABLE_INVENTORY_ITEM: 'validazione',
};

/** I codici che questo file dichiara di conoscere. Serve alle prove. */
export const CODICI_DOCUMENTATI: readonly string[] = Object.keys(CLASSE_PER_CODICE);

/**
 * La classe di UN singolo errore, per uguaglianza del codice.
 *
 * ⛔ **Nessun frammento, nessuna lettura del messaggio.** Codice assente o non
 *    in tabella: `sconosciuto`, che conserva il tentativo.
 */
export function classificaRifiutoInventario(errore: ShopifyUserError): ClasseRifiutoInventario {
  const codice = (errore.code ?? '').trim().toUpperCase();
  return CLASSE_PER_CODICE[codice] ?? 'sconosciuto';
}

/**
 * La classe di un ELENCO di errori, con la precedenza che conta.
 *
 * ⭐ **L'ordine va dal più prudente al più conclusivo**, e ognuno ha la sua
 *    ragione:
 *
 *    1. `concorrenza` — se anche uno solo dice «è in corso», non si tocca
 *       niente: il tentativo può essere ancora vivo;
 *    2. `sconosciuto` — se anche uno solo non si sa leggere, non si può
 *       concludere che la scrittura non sia avvenuta;
 *    3. `non_ripetibile` — riconosciuto, ma non dice se l'operazione di allora
 *       abbia avuto effetto: si conserva;
 *    4. `validazione` — batte il confronto, perché presentare come divergenza
 *       di quantità un identificativo sbagliato manda a cercare il problema
 *       dalla parte opposta a dove sta;
 *    5. `confronto` — resta quando è l'unica lettura possibile.
 *
 * `null` quando l'elenco è vuoto, cioè quando la scrittura è stata applicata.
 */
export function classificaRifiutiInventario(
  errori: readonly ShopifyUserError[],
): ClasseRifiutoInventario | null {
  if (errori.length === 0) {
    return null;
  }
  const classi = errori.map(classificaRifiutoInventario);
  for (const classe of ['concorrenza', 'sconosciuto', 'non_ripetibile', 'validazione'] as const) {
    if (classi.includes(classe)) {
      return classe;
    }
  }
  return 'confronto';
}

/** I motivi leggibili, col codice davanti quando c'è. */
export function motiviDi(errori: readonly ShopifyUserError[]): readonly string[] {
  return errori.map((e) => (e.code ? `${e.code}: ${e.message}` : e.message));
}
