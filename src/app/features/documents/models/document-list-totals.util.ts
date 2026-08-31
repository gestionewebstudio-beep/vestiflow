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
      total: {
        valore: (doc) => signedDocumentMoney(doc.type, doc.total).amountMinor,
        formato: soldi,
      },
      lineCount: { valore: (doc) => righeDi(doc), formato: (n) => String(n) },
    },
  });
}

/** ⚠️ `lineCount` può non esserci: l'elenco leggero non porta le righe. */
export function righeDi(doc: DocumentRecord): number {
  return doc.lineCount ?? doc.lines?.length ?? 0;
}
