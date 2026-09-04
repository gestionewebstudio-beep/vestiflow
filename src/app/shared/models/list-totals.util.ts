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
 * ⭐ **Le voci di quel riepilogo NON SONO COLONNE**, ed è la distinzione che
 * `regole-stile-ui` fa fra riga totali e riepilogo: «Annullamenti 2» e
 * «Rettifiche (4) − 205,01 €» non stanno in nessuna intestazione della tabella.
 * Questa funzione somma colonne; quel riepilogo risponde ad altro.
 *
 * ⛔ **«Non sono colonne» NON vuol dire «non sono righe»**, e confonderli è
 * l'errore che ho fatto due volte prima di leggere l'API (01/09/2026). Le
 * rettifiche hanno la propria data e SONO righe del registro; il riepilogo legge
 * le stesse quattro sorgenti dell'elenco, con gli stessi interruttori — lo dice
 * il commento dell'API, che lo dichiara come invariante.
 *
 * ⚠️ **Genuinamente senza riga sono solo due contatori dichiarativi**, e sono
 * già per contratto immuni ai filtri dell'elenco: gli **annullamenti** (letti
 * ignorando il filtro Tipo, perché «una dichiarazione che sparisce quando si
 * filtra dice meno del vero») e gli **evasi senza data** (contati senza periodo
 * e senza filtri).
 *
 * ⭐ **L'ostacolo vero ai filtri di colonna là è un altro, ed è più stretto**:
 * quei numeri li calcola il SERVER sul proprio insieme filtrato, quindi un
 * filtro applicato lato client non li raggiungerebbe. O i filtri entrano nella
 * query, o il registro si ritrova due aggregatori per la stessa transazione.
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
