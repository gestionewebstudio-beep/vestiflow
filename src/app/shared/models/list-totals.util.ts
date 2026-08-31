import type { DataTableTotals } from '@shared/components/data-table/data-table.model';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **I totali di un elenco che somma le righe che ha in mano.**
 *
 * `regole-gestionale` lo consente e lo prescrive: «elenchi, report, selezioni ed
 * export AGGREGANO i valori finali già determinati e persistiti». Qui si somma,
 * non si ricalcola: nessuna aliquota, nessuno sconto, nessuna formula.
 *
 * ⛔ **Non è per chi ha un RIEPILOGO invece di una riga totali.** Il Registro
 * Corrispettivi costruisce da sé il proprio, e non passa di qui.
 *
 * ⭐ **«Il suo risultato è più grande di quello che ha a schermo», e resta vero
 * anche a periodo filtrato** — è normale, non un effetto della paginazione.
 *
 * ⚠️ **Il perché non è il caricamento**: quel registro carica tutte le righe del
 * periodo, come ogni altro elenco, e parte dagli stessi trenta giorni. È che
 * **metà delle voci del riepilogo non sono colonne**, quindi non esistono come
 * righe da sommare: evasi senza data, annullamenti (contati, mai sottratti),
 * rettifiche alla loro data — che non è quella della riga che rettificano —,
 * netto venduto-meno-reso.
 *
 * ⛔ **Una riga totali somma ciò che si vede; un riepilogo risponde a domande che
 * le colonne non pongono** (`regole-stile-ui`). È la ragione per cui il Registro
 * costruisce da sé il proprio, e per cui i filtri di colonna lato client là non
 * si applicano: filtrerebbero le righe lasciando ferme le voci che righe non
 * hanno.
 *
 * ⚠️ **L'ambito lo decide la selezione**: nessuna riga scelta → tutte; una o più
 * → solo quelle. È la regola «senza selezione mostra i totali del risultato
 * filtrato; con una selezione, quelli della selezione».
 */
export function totaliDiElenco<T>(
  righe: readonly T[],
  opzioni: {
    /** Identità della riga, per confrontarla con la selezione. */
    readonly rowId: (row: T) => string;
    readonly selectedIds: ReadonlySet<string>;
    /** Le colonne VISIBILI: una colonna spenta non ha totale. */
    readonly columns: readonly ResolvedTableColumn[];
    /**
     * Per ogni colonna sommabile, come si legge il numero di una riga e come si
     * scrive il risultato. Una colonna assente da qui semplicemente non somma.
     */
    readonly campi: Readonly<
      Record<
        string,
        { readonly valore: (row: T) => number; readonly formato: (n: number) => string }
      >
    >;
  },
): DataTableTotals {
  const { rowId, selectedIds, columns, campi } = opzioni;
  const scelte = selectedIds.size > 0 ? righe.filter((r) => selectedIds.has(rowId(r))) : righe;

  const values: Record<string, string> = {};
  for (const colonna of columns) {
    const campo = campi[colonna.id];
    if (!campo) {
      continue;
    }
    values[colonna.id] = campo.formato(
      scelte.reduce((somma, riga) => somma + campo.valore(riga), 0),
    );
  }

  return { count: scelte.length, values };
}
