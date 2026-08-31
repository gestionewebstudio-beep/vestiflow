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
  const valuta = documenti[0]?.currency ?? DEFAULT_CURRENCY;
  const soldi = (n: number): string => formatMoney({ amountMinor: n, currencyCode: valuta });

  return totaliDiElenco(documenti, {
    rowId: (doc) => doc.id,
    selectedIds: opzioni.selectedIds,
    columns: opzioni.columns,
    campi: {
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
      lineCount: { valore: (doc) => righeDi(doc), formato: (n) => String(n) },
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
        valore: (doc) => doc.outstanding?.amountMinor ?? 0,
        formato: soldi,
      },
    },
  });
}

/** ⚠️ `lineCount` può non esserci: l'elenco leggero non porta le righe. */
export function righeDi(doc: DocumentRecord): number {
  return doc.lineCount ?? doc.lines?.length ?? 0;
}
