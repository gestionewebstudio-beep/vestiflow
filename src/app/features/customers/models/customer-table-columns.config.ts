import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

/*
  ⭐ **UNA sola colonna resta senza larghezza, ed è il CLIENTE.**

  Con `table-layout: fixed` le colonne non dichiarate si dividono in parti uguali
  lo spazio che avanza: dichiarare le ALTRE è il modo di dare peso a quella che
  deve crescere. Il nome del cliente prende il residuo e cresce con la finestra.

  ⚠️ **Le misure sono strette apposta**, tarate sul contenuto reale e non
  sull'intestazione: «Provincia» mostra due lettere, «Origine» una parola.
  Larghezze generose su colonne brevi sono spazio sottratto al nome — è il
  difetto misurato sui prodotti lo stesso giorno.

  ⭐ L'operatore le cambia trascinando la maniglia, e `14` §G1 dice che la
  modifica **non si conserva**: è un aggiustamento del momento.
*/
export const CUSTOMER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  colonna('code', { pinnable: true, defaultVisible: true, defaultWidthPx: 96 }),
  { id: 'name', label: 'Cliente', pinnable: true, defaultVisible: true, cardTitle: true },
  colonna('source', { defaultVisible: true, defaultWidthPx: 80 }),
  colonna('email', { defaultVisible: true, defaultWidthPx: 200 }),
  colonna('phone', { defaultVisible: true, defaultWidthPx: 120 }),
  colonna('city', { defaultVisible: false, defaultWidthPx: 120 }),
  { id: 'province', label: 'Provincia', defaultVisible: false, defaultWidthPx: 76 },
  { id: 'companyName', label: 'Ragione sociale', defaultVisible: false, defaultWidthPx: 180 },
  colonna('vatNumber', { defaultVisible: false, defaultWidthPx: 120 }),
  { id: 'discount', label: 'Sconto', defaultVisible: false, defaultWidthPx: 76 },
  { id: 'paymentTerms', label: 'Pagamento', defaultVisible: false, defaultWidthPx: 120 },
  { id: 'alsoSupplier', label: 'Anche fornitore', defaultVisible: false, defaultWidthPx: 110 },
  colonna('createdAt', { defaultVisible: false, defaultWidthPx: 100 }),
];

export const CUSTOMER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ['code', 'name', 'source', 'email', 'phone'],
  [PresetId.Warehouse]: ['name', 'phone', 'city'],
  [PresetId.Accountant]: ['code', 'name', 'companyName', 'vatNumber', 'paymentTerms', 'email'],
  [PresetId.Supplier]: ['name', 'email', 'phone', 'alsoSupplier'],
  [PresetId.Analysis]: ['name', 'source', 'discount', 'paymentTerms'],
  [PresetId.Operational]: ['name', 'phone', 'city', 'discount'],
};

export const CUSTOMER_LIST_VIEW = TableViewId.CustomersList;
