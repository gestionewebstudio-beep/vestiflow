import {
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

export const SUPPLIER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'code', label: 'Codice', pinnable: true, defaultVisible: true },
  { id: 'name', label: 'Ragione sociale', defaultVisible: true },
  { id: 'vatNumber', label: 'P. IVA', defaultVisible: true },
  { id: 'email', label: 'Email', defaultVisible: true },
  { id: 'city', label: 'Città', defaultVisible: true },
  { id: 'phone', label: 'Telefono', defaultVisible: false },
  { id: 'paymentTerms', label: 'Pagamento', defaultVisible: false },
] as const;

export const SUPPLIER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['code', 'name', 'vatNumber', 'email', 'city'],
  [TableViewPresetId.Warehouse]: ['code', 'name', 'city', 'phone'],
  [TableViewPresetId.Accountant]: ['code', 'name', 'vatNumber', 'paymentTerms', 'email'],
  [TableViewPresetId.Supplier]: ['code', 'name', 'email', 'phone', 'city'],
  [TableViewPresetId.Analysis]: ['code', 'name', 'vatNumber', 'city'],
  [TableViewPresetId.Operational]: ['code', 'name', 'email', 'phone'],
};
