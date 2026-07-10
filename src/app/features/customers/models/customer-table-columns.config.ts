import {
  TableViewId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';
import { TableViewPresetId as PresetId } from '@shared/table-columns/table-column.model';

export const CUSTOMER_LIST_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'name', label: 'Cliente', pinnable: true, defaultVisible: true },
  { id: 'source', label: 'Origine', defaultVisible: true },
  { id: 'email', label: 'Email', defaultVisible: true },
  { id: 'phone', label: 'Telefono', defaultVisible: true },
  { id: 'city', label: 'Città', defaultVisible: false },
  { id: 'province', label: 'Provincia', defaultVisible: false },
  { id: 'companyName', label: 'Ragione sociale', defaultVisible: false },
  { id: 'vatNumber', label: 'P. IVA', defaultVisible: false },
  { id: 'discount', label: 'Sconto', defaultVisible: false },
  { id: 'paymentTerms', label: 'Pagamento', defaultVisible: false },
  { id: 'alsoSupplier', label: 'Anche fornitore', defaultVisible: false },
  { id: 'createdAt', label: 'Creato il', defaultVisible: false },
];

export const CUSTOMER_LIST_COLUMN_PRESETS: TableViewPresetMap = {
  [PresetId.Default]: ['name', 'source', 'email', 'phone'],
  [PresetId.Warehouse]: ['name', 'phone', 'city'],
  [PresetId.Accountant]: ['name', 'companyName', 'vatNumber', 'paymentTerms', 'email'],
  [PresetId.Supplier]: ['name', 'email', 'phone', 'alsoSupplier'],
  [PresetId.Analysis]: ['name', 'source', 'discount', 'paymentTerms'],
  [PresetId.Operational]: ['name', 'phone', 'city', 'discount'],
};

export const CUSTOMER_LIST_VIEW = TableViewId.CustomersList;
