/**
 * Decide se il Codice IVA di una riga deve entrare nel payload di salvataggio.
 *
 * È il lato client di un **contratto binario** del dominio documenti:
 *
 * ```text
 * riga esistente + vatCodeId ASSENTE   → l'IVA non è stata modificata
 *                                      → il server conserva vatCodeId e vatSnapshot persistiti
 * riga esistente + vatCodeId PRESENTE  → assegnazione cambiata: il server risolve il codice
 *                                      → e rigenera lo snapshot
 * riga nuova                           → risoluzione normale da articolo/predefinito
 * ```
 *
 * ⚠️ **Perché serve.** Lo snapshot IVA è il fatto fiscale di quel documento. Se
 * il client rimanda sempre il codice che ha letto aprendo il documento, il
 * server lo rifotografa a ogni salvataggio — e il giorno in cui l'aliquota di un
 * Codice IVA cambia, riaprire un documento vecchio per correggere una nota lo
 * ri-prezza. Il difetto è invisibile finché nessuno tocca un'aliquota.
 *
 * ⛔ **Il confronto è col valore ORIGINARIAMENTE PERSISTITO, non col precedente.**
 * Il riferimento si fissa al caricamento del documento e **non si aggiorna
 * durante le modifiche locali**: si riallinea solo dopo un salvataggio riuscito
 * o un nuovo caricamento. Altrimenti due modifiche di fila si annullerebbero a
 * vicenda e la seconda non partirebbe.
 *
 * ⚠️ **Non basta guardare l'evento della cella**, ed è la ragione per cui questa
 * funzione confronta valori invece di ascoltare. L'IVA di una riga esistente
 * cambia legittimamente per **tre** vie, e due non emettono nulla:
 *
 * | via                                   | evento |
 * | ------------------------------------- | ------ |
 * | l'operatore sceglie dalla cella       | sì     |
 * | sostituzione dell'articolo sulla riga | no — `setValue(…, { emitEvent: false })` |
 * | riallineamento automatico del codice  | no — idem |
 *
 * Le due silenziose usano `emitEvent: false` **per una ragione**: la riga si sta
 * ancora componendo e i ricalcoli a catena non devono partire a metà. Non si
 * toccano; si guarda il risultato invece dell'evento.
 *
 * ⛔ **Anche il `dirty` del form è inservibile**, per lo stesso motivo: quelle
 * due vie non lo sporcano affatto, e altre scritture programmatiche lo sporcano
 * senza che l'operatore abbia scelto niente.
 */
export function vatCodeIdForLinePayload(params: {
  /** Il valore attuale del controllo di riga. Stringa vuota = nessun codice. */
  readonly currentVatCodeId: string | null | undefined;
  /**
   * Il valore com'era quando il documento è stato caricato. `undefined` per una
   * riga che non esisteva: è ciò che distingue una riga nuova da una esistente.
   */
  readonly persistedVatCodeId?: string | null;
  /** Vero per una riga già salvata, cioè che ha un id sul server. */
  readonly isExistingLine: boolean;
}): string | undefined {
  const current = params.currentVatCodeId?.trim() || undefined;

  if (!params.isExistingLine) {
    // Riga nuova: nessuno snapshot da conservare, vale il comportamento normale
    // — si manda quello che c'è, e il server risolve il resto.
    return current;
  }

  const persisted = params.persistedVatCodeId?.trim() || undefined;
  if (current === persisted) {
    // Non modificata: l'assenza della chiave È il messaggio.
    return undefined;
  }

  // ⚠️ Il caso «svuotata» non si può esprimere, ed è corretto così: sulla cella
  // IVA l'insieme è chiuso e senza voce vuota — svuotare il campo riporta al
  // valore di prima. Se un giorno la rimozione diventasse un'azione vera,
  // servirebbe estendere il contratto, non dedurla da una stringa vuota: qui si
  // preferisce non modificare nulla piuttosto che indovinare.
  return current;
}
