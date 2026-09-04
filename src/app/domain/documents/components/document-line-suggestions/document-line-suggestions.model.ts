/**
 * Voce del pannello suggerimenti di riga documento.
 *
 * ⚠️ **Il pannello è condiviso da TRE celle con esigenze diverse**, e il modello
 * lo rispecchia: due campi obbligatori e il resto facoltativo.
 *
 * ```text
 * cella «Nome prodotto»   una variante: immagine, codici, disponibilità, prezzo
 * cella «Codice»          una variante: nome, codici, costo
 * cella a scelta          una voce di elenco chiuso: «22» + «IVA 22%»
 * ```
 *
 * ⛔ **Un formato ricco non poteva valere per tutte e tre**: la terza mostra un
 * Codice IVA, non un articolo, e darle miniatura e disponibilità significherebbe
 * inventarle dei dati. I campi opzionali risolvono senza flag — chi non li passa
 * ottiene esattamente la riga di prima.
 */
export interface DocumentLineSuggestionItem {
  /** La prima cosa che si legge: il nome dell'articolo, o l'etichetta della voce. */
  readonly title: string;
  /**
   * La variante, quando c'è: «XL», «M · Rosso».
   *
   * ⭐ **Separata dal titolo, non attaccata con un trattino**: «maglietta — XXL»
   * si legge come un nome solo, e scorrendo dieci suggerimenti dello stesso
   * articolo la taglia — che è l'unica cosa che cambia — resta sepolta in fondo
   * a una riga di testo.
   */
  readonly variante?: string;
  /**
   * I codici, smorzati: SKU, EAN, codice articolo, già composti da chi chiama.
   *
   * ⚠️ Qui NON vanno i numeri commerciali: hanno un posto loro, a destra, dove
   * si incolonnano.
   */
  readonly detail?: string;
  /** Miniatura dell'articolo. Assente, il posto resta ma mostra un segnaposto. */
  readonly imageUrl?: string;
  /**
   * La disponibilità, già formattata («Disp. 4»).
   *
   * ⛔ **È il DISPONIBILE, non la giacenza** — `stockAvailable`, cioè giacenza
   * meno impegnata. Fino al 02/09/2026 la cella «Nome prodotto» passava qui
   * `stockOnHand` chiamandolo «Disp.»: su un ordine cliente, dove la merce si
   * impegna, poteva dire «18» mentre di vendibili ce n'erano tre. Tutto il resto
   * dell'app — card di riga, Giacenze, Situazione — usa `available`.
   */
  readonly disponibile?: string;
  /**
   * Come si legge la disponibilità: `ok` sopra zero, `zero` a zero, `negativa`
   * sotto. ⚠️ Il colore accompagna il numero, non lo sostituisce — il numero
   * resta sempre leggibile (`regole-gestionale`).
   */
  readonly tonoDisponibile?: 'ok' | 'zero' | 'negativa';
  /** Il prezzo di vendita, già formattato. */
  readonly prezzo?: string;
  /** Il costo d'acquisto, già formattato: serve alle celle dei documenti di acquisto. */
  readonly costo?: string;
}
