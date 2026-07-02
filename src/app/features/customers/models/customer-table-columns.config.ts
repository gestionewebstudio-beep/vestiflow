import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const CUSTOMER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'name', label: 'Cliente', pinnable: true, defaultVisible: true },
  { id: 'email', label: 'Email', defaultVisible: true },
  { id: 'phone', label: 'Telefono', defaultVisible: true },
  { id: 'city', label: 'Città', defaultVisible: true },
];

export const CUSTOMER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ['name', 'email', 'phone', 'city'],
  [PresetId.Warehouse]: ['name', 'phone', 'city'],
  [PresetId.Accountant]: ['name', 'email', 'city'],
  [PresetId.Supplier]: ['name', 'email', 'phone'],
  [PresetId.Analysis]: ['name', 'email', 'city'],
  [PresetId.Operational]: ['name', 'phone', 'city'],
};

export const CUSTOMER_LIST_VIEW = TableViewId.CustomersList;
