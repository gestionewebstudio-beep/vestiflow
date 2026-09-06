import type { DocumentRecord } from '@core/models/document.model';
import { DEFAULT_CURRENCY, formatMoney } from '@core/utils/money.util';
import { signedDocumentMoney } from '@domain/documents/models/document-economic-sign.util';
import type { DataTableTotals } from '@shared/components/data-table/data-table.model';
import { totaliDiElenco } from '@shared/models/list-totals.util';
import type { ResolvedTableColumn } from '@shared/table-columns/table-column.model';

/**
 * ⭐ **I totali dell'elenco documenti**, come funzione pura.
 *
 * ⛔ **Stava dentro `document-table`**, e ci stava bene finché la riga totali era
 * dentro la tabella. Dal 31/08/2026 il riepilogo dei documenti è una **fascia**
 * nella forma del Registro Corrispettivi, e la fascia vive nello slot
 * `[summary]` del telaio — cioè nella PAGINA, che è un altro componente.
 *
 * ⚠️ **La strada sbagliata era ricalcolarli anche nella pagina**: due somme della
 * stessa cosa, che il giorno in cui una cambia divergono in silenzio. Estrarre
 * la funzione le tiene una sola, e chi la chiama non conta.
 *
 * ⭐ **Porta il VERSO economico**: una fattura da 100 e una nota di credito da 50
 * fanno 50, e ci si arriva col segno del tipo — mai rifacendo l'IVA
 * (`regole-gestionale`, «Il riepilogo SOMMA, non ricalcola»).
 */
export function totaliDocumenti(
  documenti: readonly DocumentRecord[],
  opzioni: {
    readonly columns: readonly ResolvedTableColumn[];
    readonly selectedIds: ReadonlySet<string>;
  },
): DataTableTotals {
  return totaliDiElenco(documenti, {
    rowId: (doc) => doc.id,
    selectedIds: opzioni.selectedIds,
    columns: opzioni.columns,
    campi: campiSommabiliDocumenti(documenti[0]?.currency ?? DEFAULT_CURRENCY),
  });
}

/**
 * ⭐ **QUALI COLONNE SI SOMMANO — dichiarato UNA volta.**
 *
 * Le somme di questo elenco sono due: il **subtotale di giornata**, quando
 * «Raggruppa per giorno» è acceso, e la **riga totali** in fondo.
 *
 * ⛔ **Le dichiaravano in due, con lo stesso elenco copiato — e divergevano.**
 * Misurato il 01/09/2026: la riga totali sommava imponibile, IVA, totale e
 * «Ancora da saldare»; il subtotale di giornata solo imponibile e totale. Con il
 * raggruppamento acceso, sotto le colonne IVA ed Esposizione la riga di giornata
 * restava **vuota** mentre quella in fondo portava un numero.
 *
 * ⚠️ È lo stesso difetto trovato lo stesso giorno sugli **Ordini fornitore** e
 * corretto allo stesso modo (`supplier-order-list.component.ts`,
 * `campiSommabili`): là il gruppo aveva imponibile e IVA e la riga totali no —
 * lo scarto era girato al contrario, e la causa era la stessa duplicazione.
 *
 * ⚠️ **Sommano insiemi diversi, non campi diversi**: il gruppo somma la sua
 * giornata, la riga totali il risultato filtrato o la selezione. È l'insieme a
 * cambiare, mai l'elenco delle colonne.
 */
export function campiSommabiliDocumenti(valuta: string): Readonly<
  Record<
    string,
    { readonly valore: (doc: DocumentRecord) => number; readonly formato: (n: number) => string }
  >
> {
  const soldi = (n: number): string => formatMoney({ amountMinor: n, currencyCode: valuta });

  return {
      subtotal: {
        valore: (doc) => signedDocumentMoney(doc.type, doc.subtotal).amountMinor,
        formato: soldi,
      },
      /*
        ⭐ **L'IVA si somma come le altre due**, e col suo verso: una nota di
        credito ha imposta negativa, e sommarla senza segno gonfierebbe l'IVA
        del periodo invece di scalarla.
      */
      tax: {
        valore: (doc) => signedDocumentMoney(doc.type, doc.tax).amountMinor,
        formato: soldi,
      },
      total: {
        valore: (doc) => signedDocumentMoney(doc.type, doc.total).amountMinor,
        formato: soldi,
      },
      /*
        ⭐ **«Ancora da saldare» sommato è l'ESPOSIZIONE**, ed è il numero che
        interessa di più su un elenco di Registrazioni fattura: non «quanto ho
        comprato», ma «quanto devo».

        ⚠️ **Senza verso economico, e non è una svista**: il residuo è già un
        importo positivo che indica un debito. Applicargli il segno del tipo
        farebbe scendere l'esposizione quando arriva una nota di credito che il
        residuo l'ha già scalato.

        ⚠️ **Assente vale zero**: un documento saldato non ha residuo, e non
        toglie niente alla somma.
      */
    outstanding: {
      valore: (doc: DocumentRecord) => doc.outstanding?.amountMinor ?? 0,
      formato: soldi,
    },
  };
}

