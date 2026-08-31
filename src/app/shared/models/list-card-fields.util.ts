import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **Una colonna è accesa?** — la stessa domanda, una risposta sola.
 *
 * ⛔ **Era scritta dodici volte**, identica, in ogni tabella di elenco:
 *
 * ```ts
 * protected visibile(columnId: string): boolean {
 *   return this.columns().some((column) => column.id === columnId);
 * }
 * ```
 *
 * Dodici copie di tre righe non sono un problema di volume: sono dodici posti
 * dove la domanda può cominciare a significare cose diverse. Indicato dal
 * proprietario il 31/08/2026: _«devi sempre fare funzioni condivise dove si
 * può»_.
 */
export function colonnaVisibile(
  colonne: readonly ResolvedTableColumn[],
  columnId: string,
): boolean {
  return colonne.some((column) => column.id === columnId);
}

/**
 * ⭐ **L'IDENTITÀ di una card non segue il selettore Colonne.**
 *
 * Deciso dal proprietario il 31/08/2026: _«spegnere una colonna non deve rompere
 * la card dei riepiloghi»_.
 *
 * ## ⛔ Qui c'era la decisione opposta, e va detto
 *
 * Fino a oggi ogni campo della card era condizionato a `visibile(...)`, con la
 * motivazione — scritta in dodici file — che «la card legge le colonne che il
 * motore ha già ricevuto: una fonte sola invece di due che possono divergere».
 *
 * L'argomento non era sbagliato, ed è stato pesato contro un altro: **spegnendo
 * due o tre colonne la card restava senza data, senza numero o del tutto vuota.**
 * Il selettore Colonne governa la TABELLA — è lì che si guadagna larghezza — e
 * una card non ha colonne da restringere.
 *
 * ## Che cosa resta legato alle colonne
 *
 * | | |
 * | --- | --- |
 * | **identità** — data, cosa, numero | ⭐ sempre presente |
 * | fascia **parole** (origine, sede, stato) | segue le colonne |
 * | fascia **numeri** (importi, quantità) | segue le colonne |
 *
 * ⚠️ **La distinzione non è arbitraria**: l'identità risponde a «di che riga si
 * tratta», e una riga di cui non si sa quale sia non è consultabile. Il resto è
 * dettaglio, e toglierlo è esattamente ciò che l'operatore chiede spegnendo una
 * colonna.
 */
export const IDENTITA_CARD = 'identità' as const;

/**
 * ⭐ **Il valore di un campo di card, o niente.**
 *
 * ⛔ **In tabella il trattino è giusto, su una card no**, e la differenza è
 * l'intestazione: sotto una colonna «Cod. articolo» un `—` dice «questo articolo
 * non ha codice», e distingue il vuoto dal non caricato (`regole-gestionale`).
 * In cima a una card non c'è nessuna intestazione, e lo stesso trattino è un
 * segno nudo che sembra un errore di caricamento.
 *
 * ```text
 * in tabella     COD. ARTICOLO        card       — fornitore test 1   OF-Mi-0020
 *                     —                          ↑ un trattino che non dice niente
 * ```
 *
 * Segnalato dal proprietario il 31/08/2026 sugli Ordini fornitore. Lì il rimedio
 * era un altro — la card mostrava la data sbagliata — ma il difetto vale per
 * quattro altre card, e la forma giusta è **omettere**, non trattinare.
 *
 * ⚠️ **Non tocca il testo delle CELLE**: `cellText` continua a restituire il
 * trattino, perché in tabella serve. È la card a filtrarlo, e solo nella fascia
 * identità.
 */
export function valoreCard(testo: string | null | undefined): string | null {
  const pulito = testo?.trim() ?? '';
  return pulito === '' || SEGNAPOSTO.has(pulito) ? null : pulito;
}

/**
 * I segnaposto di «vuoto» in uso nelle celle.
 *
 * ⚠️ **Il trattino è quello LUNGO** (—, U+2014), non il meno da tastiera: sono
 * due caratteri diversi, e cercare quello sbagliato non fallisce — semplicemente
 * non trova mai niente.
 */
const SEGNAPOSTO = new Set(['—', '–', '-', 'N/D', 'n/d']);
