import type { TableViewPresetId, TableViewState } from './table-column.model';
import { TableViewPresetId as PresetId } from './table-column.model';

const ALLOWED_PRESET_IDS = new Set<string>([
  PresetId.Default,
  PresetId.Warehouse,
  PresetId.Accountant,
  PresetId.Supplier,
  PresetId.Analysis,
  PresetId.Operational,
  'custom',
]);

const MAX_COLUMN_IDS = 100;
const MAX_COLUMN_ID_LENGTH = 64;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function normalizeColumnIds(value: unknown): readonly string[] | null {
  if (!isStringArray(value) || value.length > MAX_COLUMN_IDS) {
    return null;
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    const id = raw.trim();
    if (!id || id.length > MAX_COLUMN_ID_LENGTH || seen.has(id)) {
      return null;
    }
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

/** Parse sicuro dello state remoto/localStorage; null se invalido o corrotto. */
export function parseTableViewState(raw: unknown): TableViewState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const presetId = record['presetId'];
  if (typeof presetId !== 'string' || !ALLOWED_PRESET_IDS.has(presetId)) {
    return null;
  }

  const columnOrder = normalizeColumnIds(record['columnOrder']);
  const hiddenColumnIds = normalizeColumnIds(record['hiddenColumnIds']);
  const pinnedColumnIds = normalizeColumnIds(record['pinnedColumnIds']);

  if (!columnOrder || !hiddenColumnIds || !pinnedColumnIds) {
    return null;
  }

  const columnWidths = parseColumnWidths(record['columnWidths']);

  return {
    presetId: presetId as TableViewPresetId | 'custom',
    columnOrder,
    hiddenColumnIds,
    pinnedColumnIds,
    columnWidths,
  };
}

function parseColumnWidths(value: unknown): Readonly<Record<string, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 48 && raw <= 640) {
      result[key] = Math.round(raw);
    }
  }
  return result;
}

export function parseTableViewStateJson(json: string): TableViewState | null {
  try {
    return parseTableViewState(JSON.parse(json));
  } catch {
    return null;
  }
}
