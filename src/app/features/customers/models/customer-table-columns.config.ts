import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const CUSTOMER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  colonna('code', { pinnable: true, defaultVisible: true }),
  { id: 'name', label: 'Cliente', pinnable: true, defaultVisible: true },
  colonna('source', { defaultVisible: true }),
  colonna('email', { defaultVisible: true }),
  colonna('phone', { defaultVisible: true }),
  colonna('city', { defaultVisible: false }),
  { id: 'province', label: 'Provincia', defaultVisible: false },
  { id: 'companyName', label: 'Ragione sociale', defaultVisible: false },
  colonna('vatNumber', { defaultVisible: false }),
  { id: 'discount', label: 'Sconto', defaultVisible: false },
  { id: 'paymentTerms', label: 'Pagamento', defaultVisible: false },
  { id: 'alsoSupplier', label: 'Anche fornitore', defaultVisible: false },
  colonna('createdAt', { defaultVisible: false, filter: 'range' }),
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
