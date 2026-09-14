import { colonna } from '@shared/table-columns/column-catalog';
import {
  TableViewId,
  TableViewPresetId,
  type TableColumnDef,
  type TableViewPresetMap,
} from '@shared/table-columns/table-column.model';

/**
 * L'elenco delle AZIENDE registrate (amministrazione piattaforma, `docs/26` A14).
 *
 * ⛔ **Era una `<table>` a mano** con «Apri gestionale» per riga. Entrata nel
 *    motore l'11/09/2026: colonne dal catalogo dove il concetto esiste (P. IVA,
 *    Email, Creato il), filtri di colonna, ordinamento; il comando per riga è
 *    nella barra sulla selezione, come su ogni elenco.
 */
export const ADMIN_TENANTS_VIEW = TableViewId.AdminTenants;

export const ADMIN_TENANTS_COLUMN_DEFS: readonly TableColumnDef[] = [
  { id: 'name', label: 'Azienda', filter: 'text', defaultVisible: true, cardTitle: true },
  { id: 'profile', label: 'Profilo', filter: 'values', defaultVisible: true, defaultWidthPx: 140 },
  colonna('vatNumber', { display: 'code', defaultVisible: true, defaultWidthPx: 150 }),
  { id: 'owner', label: 'Utente', filter: 'text', defaultVisible: true, defaultWidthPx: 180 },
  colonna('email', { defaultVisible: true }),
  colonna('createdAt', { defaultVisible: true, defaultWidthPx: 150 }),
] as const;

export const ADMIN_TENANTS_COLUMN_PRESETS: TableViewPresetMap = {
  [TableViewPresetId.Default]: ['name', 'profile', 'vatNumber', 'owner', 'email', 'createdAt'],
  [TableViewPresetId.Operational]: ['name', 'profile', 'owner', 'email'],
  [TableViewPresetId.Warehouse]: ['name', 'profile', 'owner'],
  [TableViewPresetId.Accountant]: ['name', 'vatNumber', 'email', 'createdAt'],
  [TableViewPresetId.Supplier]: ['name', 'owner', 'email'],
  [TableViewPresetId.Analysis]: ['name', 'profile', 'vatNumber', 'owner', 'email', 'createdAt'],
};
