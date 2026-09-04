import type { SupplierOrder } from '@core/models/supplier-order.model';
import { formatDate } from '@core/utils/date.util';
import { formatMoney } from '@core/utils/money.util';
import type { ListExportConfig } from '@shared/utils/list-export.util';

import { supplierOrderStatusLabel } from '../models/supplier-order-labels.util';

/**
 * Colonne di Stampa ed Esporta dell'elenco **Ordini fornitore** (`14` §5.2).
 *
 * ⛔ **Solo la configurazione.** Il come — CSV con BOM e separatore `;`, pagina
 * HTML stampabile, totali di colonna — vive in `shared/utils/list-export.util`,
 * che serve già i documenti. Questa pagina non ha mai avuto né stampa né
 * export: li riceve senza che sia stata scritta una riga di generatore.
 *
 * ⚠️ **Il titolo è documentale e stabile: «Ordini fornitore».** Non «— elenco
 * selezionati»: con la regola dell'ambito (§5.3) una stampa senza selezione
 * riguarda l'intero risultato dei filtri, e quella dicitura direbbe il falso
 * proprio nel caso più comune. Quanti elementi ci sono lo dice il piè, che li
 * conta davvero.
 *
 * ⚠️ **Le colonne sono quelle della pagina** — Riferimento, Fornitore, Stato,
 * Attesa il, Totale — con **Data ordine** aggiunta: l'elenco ordina per
 * data ma non la mostra, e un foglio senza la data è inutilizzabile proprio
 * nello strumento per cui è fatto. Imponibile e IVA seguono il totale perché in
 * un export contabile la scomposizione serve.
 */
export const SUPPLIER_ORDER_LIST_EXPORT: ListExportConfig<SupplierOrder> = {
  title: 'Ordini fornitore',
  filePrefix: 'ordini-fornitore',
  itemNoun: 'ordini',
  columns: [
    { header: 'Data ordine', cell: (order) => formatDate(order.orderDate) },
    { header: 'Riferimento', cell: (order) => order.reference },
    { header: 'Fornitore', cell: (order) => order.supplierName },
    { header: 'Stato', cell: (order) => supplierOrderStatusLabel(order.status) },
    {
      header: 'Attesa il',
      cell: (order) => (order.expectedAt ? formatDate(order.expectedAt) : ''),
    },
    {
      header: 'Imponibile',
      numeric: true,
      cell: (order) => formatMoney(order.subtotal),
      footer: { kind: 'sumMoney', money: (order) => order.subtotal },
    },
    {
      header: 'IVA',
      numeric: true,
      cell: (order) => formatMoney(order.tax),
      footer: { kind: 'sumMoney', money: (order) => order.tax },
    },
    {
      header: 'Totale',
      numeric: true,
      cell: (order) => formatMoney(order.totalAmount),
      footer: { kind: 'sumMoney', money: (order) => order.totalAmount },
    },
  ],
};

