import { SupplierOrderStatus } from '@prisma/client';

/**
 * Colonne e righe dell'export **Ordini fornitore** (`14` §5.2).
 *
 * ⛔ **Le colonne appartengono alla PAGINA, non al writer.** Il serializzatore
 * comune (`common/spreadsheet.util.ts`) riceve intestazioni e righe già
 * formattate e non sa nulla di ordini: ogni documento ha le proprie colonne, e
 * l'unica cosa condivisa è il modo di scrivere il foglio.
 *
 * Le cinque che seguono sono **quelle dell'elenco** — Riferimento, Fornitore,
 * Stato, Attesa il, Totale — perché l'Excel è della famiglia «esporta ciò che
 * sto guardando».
 *
 * ⛔ **«Righe» è stata tolta il 01/09/2026**, insieme alla colonna omonima
 * dell'elenco: un foglio che porta una colonna che l'elenco non ha più smentisce
 * la famiglia a cui l'export dichiara di appartenere. Era rimasta indietro
 * perché la rimozione era stata fatta tutta lato client, e nessun controllo
 * confronta le colonne dell'elenco con quelle dell'export.
 *
 * ⚠️ **E con la colonna è caduto anche il campo `lineCount`**, il 01/09/2026.
 * Reggeva ancora un consumatore — il «N righe ordine» accanto a ogni ordine nel
 * pannello «Includi ordine» dell'Arrivo merce — e il proprietario l'ha tolto
 * guardandolo: quel numero non distingue due ordini dello stesso fornitore, e su
 * un ordine **parzialmente ricevuto** era sbagliato, perché contava tutte le
 * righe mentre «Includi» ne aggiunge solo le residue.
 *
 * ⚠️ Il `lineCount` dei **documenti** è un altro modello e non è toccato: regge
 * il blocco che impedisce di stampare le etichette di un arrivo merce senza righe.
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
  [SupplierOrderStatus.to_confirm]: 'Da confermare',
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
    'Attesa il': date(order.expectedAt),
    Imponibile: amount(order.subtotalMinor),
    IVA: amount(order.taxMinor),
    Totale: amount(order.totalMinor),
    Valuta: order.currency,
  }));
}
