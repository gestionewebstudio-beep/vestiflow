import { SupplierOrderStatus } from '@prisma/client';

/**
 * Colonne e righe dell'export **Ordini fornitore** (`14` §5.2).
 *
 * ⛔ **Le colonne appartengono alla PAGINA, non al writer.** Il serializzatore
 * comune (`common/spreadsheet.util.ts`) riceve intestazioni e righe già
 * formattate e non sa nulla di ordini: ogni documento ha le proprie colonne, e
 * l'unica cosa condivisa è il modo di scrivere il foglio.
 *
 * Le sei che seguono sono **quelle dell'elenco** — Riferimento, Fornitore,
 * Stato, Righe, Attesa il, Totale — perché l'Excel è della famiglia «esporta
 * ciò che sto guardando».
 *
 * ⚠️ **«Data ordine» è l'unica aggiunta**, e va detto: l'elenco non la mostra
 * come colonna (ordina per data e basta), ma un foglio si filtra e si ordina
 * per data, e senza di essa l'export sarebbe inutilizzabile proprio nello
 * strumento per cui è fatto.
 */
export const SUPPLIER_ORDER_EXPORT_HEADERS = [
  'Data ordine',
  'Riferimento',
  'Fornitore',
  'Stato',
  'Righe',
  'Attesa il',
  'Imponibile',
  'IVA',
  'Totale',
  'Valuta',
] as const;

export type SupplierOrderExportHeader = (typeof SUPPLIER_ORDER_EXPORT_HEADERS)[number];
export type SupplierOrderExportRow = Record<SupplierOrderExportHeader, string>;

/**
 * ⚠️ Specchio di `supplier-order-labels.util.ts` lato frontend. Nessuno
 * strumento verifica che restino uguali: se divergono, l'operatore legge
 * «Concluso» a schermo e un'altra parola nel foglio che ha appena scaricato.
 */
const STATUS_LABELS: Readonly<Record<SupplierOrderStatus, string>> = {
  [SupplierOrderStatus.confirmed]: 'Confermato',
  [SupplierOrderStatus.concluded]: 'Concluso',
  [SupplierOrderStatus.cancelled]: 'Annullato',
};

const ROME_DATE_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const AMOUNT_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Unità minori → decimale it-IT, senza simbolo: la valuta ha una colonna sua. */
function amount(minor: number): string {
  return AMOUNT_FORMAT.format(minor / 100);
}

function date(value: Date | null | undefined): string {
  return value ? ROME_DATE_FORMAT.format(value) : '';
}

/** Ciò che l'export deve sapere di un ordine: nient'altro. */
export interface SupplierOrderExportSource {
  readonly reference: string;
  readonly supplierName: string;
  readonly status: SupplierOrderStatus;
  readonly lineCount: number;
  readonly orderDate: Date;
  readonly expectedAt: Date | null;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
  readonly currency: string;
}

export function buildSupplierOrderExportRows(
  orders: readonly SupplierOrderExportSource[],
): readonly SupplierOrderExportRow[] {
  return orders.map((order) => ({
    'Data ordine': date(order.orderDate),
    Riferimento: order.reference,
    Fornitore: order.supplierName,
    Stato: STATUS_LABELS[order.status],
    Righe: String(order.lineCount),
    'Attesa il': date(order.expectedAt),
    Imponibile: amount(order.subtotalMinor),
    IVA: amount(order.taxMinor),
    Totale: amount(order.totalMinor),
    Valuta: order.currency,
  }));
}
