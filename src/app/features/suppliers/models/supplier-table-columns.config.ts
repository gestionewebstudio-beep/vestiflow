import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const SUPPLIER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  colonna('code', { pinnable: true, defaultVisible: true }),
  { id: 'name', label: 'Ragione sociale', defaultVisible: true },
  colonna('vatNumber', { defaultVisible: true }),
  colonna('email', { defaultVisible: true }),
  colonna('city', { defaultVisible: true }),
  colonna('phone', { defaultVisible: false }),
  { id: 'paymentTerms', label: 'Pagamento', defaultVisible: false },
  { id: 'roleStatus', label: 'Stato ruolo', defaultVisible: false },
] as const;

export const SUPPLIER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['code', 'name', 'vatNumber', 'email', 'city'],
  [TableViewPresetId.Warehouse]: ['code', 'name', 'city', 'phone'],
  [TableViewPresetId.Accountant]: ['code', 'name', 'vatNumber', 'paymentTerms', 'email'],
  [TableViewPresetId.Supplier]: ['code', 'name', 'email', 'phone', 'city'],
  [TableViewPresetId.Analysis]: ['code', 'name', 'vatNumber', 'city'],
  [TableViewPresetId.Operational]: ['code', 'name', 'email', 'phone'],
};
