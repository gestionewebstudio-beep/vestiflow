import type { DocumentRecord } from '@core/models/document.model';
import { formatDate } from '@core/utils/date.util';
import type { TableColumnDef } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **LE COLONNE CONDIVISE DEI DOCUMENTI — dichiarazione e resa insieme.**
 *
 * Chiesto dal proprietario il 31/08/2026: _«crea colonne condivise che vanno poi
 * riutilizzate nei documenti»_.
 *
 * ## ⛔ Il difetto che questo modulo rende impossibile
 *
 * Poche ore prima erano state aggiunte tre colonne — Operatore, Sede, Scadenza —
 * a cinque cataloghi documentali, **senza il loro ramo in `cellText`**.
 * Accendendole dal selettore si ottenevano tre colonne **sempre vuote** su
 * Documenti, Vendite, Fatture, Vendite al banco e Arrivi merce: cadevano nel
 * `default: return ''`.
 *
 * ⚠️ **Non falliva niente.** Una colonna senza renderer compila, passa il lint e
 * passa 5.281 test: è una stringa in un array e una cella vuota a schermo. L'ha
 * trovata una revisione avversariale, non un controllo.
 *
 * ⭐ **Qui la coppia è indivisibile**: una voce di questo catalogo porta la
 * propria `def` E il proprio `testo`. Non si può dichiarare una colonna e
 * dimenticarne la resa, perché sono lo stesso oggetto.
 *
 * ## Come si usa
 *
 * ```ts
 * // nel catalogo colonne del profilo
 * ...colonneDocumentoCondivise(ALTRE_COLONNE),
 *
 * // in cellText, PRIMA dello switch
 * const condivisa = testoColonnaCondivisa(doc, columnId);
 * if (condivisa !== null) return condivisa;
 * ```
 *
 * ## ⚠️ Perché una FUNZIONE e non un array da spargere
 *
 * Lo spread nudo aveva prodotto un secondo difetto: `STORE_SALE` e
 * `GOODS_RECEIPT` dichiaravano già `colonna('location')`, e si sono ritrovati
 * **due voci «Sede»** nel selettore — una funzionante e una vuota. La funzione
 * riceve le colonne già presenti e non ripete ciò che c'è.
 */

/** Una colonna condivisa: la dichiarazione e il modo di renderla, insieme. */
interface ColonnaDocumentoCondivisa {
  readonly def: TableColumnDef;
  /**
   * ⚠️ Restituisce il **segnaposto** quando il valore manca, non la stringa
   * vuota: in tabella «niente» e «non caricato» si distinguono solo così
   * (`regole-gestionale`). È la card a omettere il trattino, non la cella.
   */
  readonly testo: (doc: DocumentRecord) => string;
}

const VUOTO = '—';

/**
 * ⭐ **Le colonne che OGNI documento ha**, quale che sia il tipo.
 *
 * Chi l'ha creato, in che sede, entro quando va pagato: tre domande che si
 * pongono su un preventivo come su una fattura, e che il modello portava già
 * senza che nessun profilo le esponesse.
 *
 * ⚠️ **Spente di serie**, tutte: aggiungere una colonna al preset predefinito
 * cambia ciò che tutti vedono senza che nessuno l'abbia chiesto.
 */
export const COLONNE_DOCUMENTO_CONDIVISE = {
  createdByName: {
    def: { id: 'createdByName', label: 'Operatore', defaultVisible: false },
    testo: (doc) => doc.createdByName?.trim() || VUOTO,
  },
  locationName: {
    def: { id: 'locationName', label: 'Sede', defaultVisible: false },
    testo: (doc) => doc.locationName?.trim() || VUOTO,
  },
  paymentDueDate: {
    def: { id: 'paymentDueDate', label: 'Scadenza', defaultVisible: false },
    testo: (doc) => (doc.paymentDueDate ? formatDate(doc.paymentDueDate) : VUOTO),
  },
} as const satisfies Record<string, ColonnaDocumentoCondivisa>;

export type ColonnaDocumentoCondivisaId = keyof typeof COLONNE_DOCUMENTO_CONDIVISE;

/**
 * Le dichiarazioni da aggiungere a un catalogo, **senza ripetere** quelle che
 * quel profilo dichiara già per conto proprio.
 *
 * ⛔ **Il confronto è sull'ETICHETTA, non sull'id**, ed è la parte che conta:
 * `STORE_SALE` non dichiara `locationName` — dichiara `location`, che il
 * catalogo condiviso etichetta «Sede». Confrontando gli id, le due voci
 * sarebbero passate entrambe e il selettore avrebbe mostrato «Sede» due volte.
 */
export function colonneDocumentoCondivise(
  giaDichiarate: readonly TableColumnDef[],
): readonly TableColumnDef[] {
  const etichette = new Set(giaDichiarate.map((c) => c.label));
  const ids = new Set(giaDichiarate.map((c) => c.id));
  return Object.values(COLONNE_DOCUMENTO_CONDIVISE)
    .map((voce) => voce.def)
    .filter((def) => !ids.has(def.id) && !etichette.has(def.label));
}

/**
 * ⭐ **Un catalogo con le colonne condivise in coda**, in una chiamata sola.
 *
 * ```ts
 * export const X_COLUMN_DEFS: readonly TableColumnDef[] = conColonneCondivise([
 *   colonna('documentDate', …),
 *   …
 * ]);
 * ```
 *
 * ⚠️ **Avvolge invece di spargere**, ed è la differenza che conta: uno spread
 * (`...COLONNE_EXTRA`) non può sapere che cosa c'è nell'array che lo ospita, e
 * infatti aveva prodotto due voci «Sede» dove il profilo dichiarava già
 * `location`. La funzione riceve il catalogo e non ripete ciò che c'è.
 */
export function conColonneCondivise(proprie: readonly TableColumnDef[]): readonly TableColumnDef[] {
  return [...proprie, ...colonneDocumentoCondivise(proprie)];
}

/**
 * Il testo di una colonna condivisa, o `null` se `columnId` non è una di
 * queste — nel qual caso decide il `cellText` del profilo.
 *
 * ⚠️ **`null` e non stringa vuota**: la stringa vuota è un valore legittimo per
 * una cella, e confonderla con «non è affar mio» rimetterebbe in piedi
 * esattamente il difetto delle colonne senza renderer.
 */
export function testoColonnaCondivisa(doc: DocumentRecord, columnId: string): string | null {
  const voce = (COLONNE_DOCUMENTO_CONDIVISE as Record<string, ColonnaDocumentoCondivisa>)[columnId];
  return voce ? voce.testo(doc) : null;
}
