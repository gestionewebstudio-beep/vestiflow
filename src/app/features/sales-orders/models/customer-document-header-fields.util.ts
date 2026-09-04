/**
 * **Quali campi di testata mostra ogni documento cliente: dichiarato UNA volta.**
 *
 * ## ⛔ Il difetto che chiude
 *
 * La stessa decisione era sparsa nel template come `@if (isManualUnload)`,
 * `@if (isSalesDdt)`, `@else if (isQuote)` — e **due volte ciascuna**, perché la
 * testata dell'Ordine cliente vive in due copie (vista estesa e pannello
 * mobile). Dieci biforcazioni per cinque campi.
 *
 * ⚠️ **Costava due cose.** Per sapere se un documento mostra il Pagamento
 * bisognava leggere il template e tenere a mente una condizione negata
 * (`@else if (!isManualUnload)`); e cambiare idea su un campo voleva dire
 * trovarne tutte le occorrenze, con il rischio di correggerne una sola — che è
 * il difetto già misurato sulla data, dove le due copie divergevano.
 *
 * ## ⭐ La forma: un `Record` ESAUSTIVO per tipo
 *
 * È la stessa scelta di `DOCUMENT_ROW_OPENS` in `document-routing.util`:
 * aggiungere un tipo di documento **non compila** finché non si dichiara cosa
 * mostra. Una decisione che vale per tutti non è una preferenza sparsa: è una
 * tabella che si legge in dieci secondi.
 *
 * ## ⚠️ Questa tabella è VISIBILITÀ, non dominio
 *
 * Deciso dal proprietario il 26/08/2026: _«la struttura, le righe, testate, deve
 * essere condivisa… stesso componente e dopo andremo a spegnere quelle che non
 * vogliamo far vedere»_.
 *
 * Quindi qui si dichiara **che cosa si vede**, e si cambia riga per riga senza
 * toccare il template. Non ci stanno le regole di dominio — il cliente
 * facoltativo, l'effetto sulla giacenza — che restano dove sono perché non
 * riguardano ciò che si mostra ma ciò che il documento È.
 *
 * ⛔ **E non ci sta il Listino**, che dopo il 26/08/2026 è di tutti: era spento
 * sulla Vendita manuale per via del nome vecchio, e rimetterlo in una tabella di
 * visibilità lo riesporrebbe allo stesso errore.
 */

/** Il tipo di documento cliente, come lo dichiara la rotta. */
export type CustomerDocumentKind = 'order' | 'quote' | 'ddt-vendita' | 'vendita-manuale';

/**
 * I campi di testata la cui presenza dipende dal tipo.
 *
 * ⛔ Non tutti i campi: solo quelli che **variano**. Cliente, Sede, Data,
 * Numero, Listino e Modalità prezzo ci sono su ognuno, e metterli qui
 * suggerirebbe che si possano togliere.
 */
export type CustomerHeaderField =
  /** Stato del documento (bozza/confermato). */
  | 'state'
  /** Data prevista di consegna. */
  | 'expectedDelivery'
  /** Riferimento libero — «Es. campionario fiera». */
  | 'externalRef'
  /** Termini di pagamento in testo libero — «Es. 30 gg d.f.». */
  | 'paymentTerms'
  /** Modalità di pagamento normativa (MP01–MP23), fatturazione elettronica. */
  | 'paymentMethod'
  /** Spunta «Seguirà doc. di vendita». */
  | 'followedBySalesDoc';

/**
 * La misura del 26/08/2026: **riproduce esattamente** ciò che il template
 * mostrava, riga per riga. Non è una proposta — è la fotografia di com'era,
 * portata in un posto solo perché da qui si possa cambiare.
 */
export const CUSTOMER_HEADER_FIELDS: Record<CustomerDocumentKind, readonly CustomerHeaderField[]> =
  {
    order: ['state', 'paymentTerms'],
    quote: ['expectedDelivery', 'paymentTerms'],
    'ddt-vendita': ['paymentMethod', 'followedBySalesDoc'],
    // ⚠️ La Vendita manuale non mostra oggi né pagamento né consegna. È lo stato
    // di partenza, non una decisione presa: il proprietario ha dichiarato che si
    // spegne dalla tabella ciò che non si vuole vedere, e questa riga è il posto
    // dove farlo.
    'vendita-manuale': ['externalRef'],
  };

/** Questo documento mostra questo campo di testata? */
export function showsHeaderField(kind: CustomerDocumentKind, field: CustomerHeaderField): boolean {
  return CUSTOMER_HEADER_FIELDS[kind].includes(field);
}
