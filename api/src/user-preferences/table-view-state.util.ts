import { BadRequestException } from '@nestjs/common';

import {
  MAX_TABLE_VIEW_COLUMN_ID_LENGTH,
  MAX_TABLE_VIEW_COLUMN_IDS,
  TABLE_VIEW_PRESET_IDS,
  type TableViewPresetId,
} from './table-view.constants';

export interface ParsedTableViewState {
  readonly presetId: TableViewPresetId;
  readonly columnOrder: readonly string[];
  readonly hiddenColumnIds: readonly string[];
  readonly pinnedColumnIds: readonly string[];
}

const PRESET_ID_SET = new Set<string>(TABLE_VIEW_PRESET_IDS);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function normalizeColumnIds(value: unknown, fieldName: string): readonly string[] {
  if (!isStringArray(value)) {
    throw new BadRequestException(`stateJson.${fieldName} deve essere un array di stringhe`);
  }
  if (value.length > MAX_TABLE_VIEW_COLUMN_IDS) {
    throw new BadRequestException(
      `stateJson.${fieldName} supera il limite di ${MAX_TABLE_VIEW_COLUMN_IDS} colonne`,
    );
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of value) {
    const id = raw.trim();
    if (!id) {
      throw new BadRequestException(`stateJson.${fieldName} contiene id colonna vuoti`);
    }
    if (id.length > MAX_TABLE_VIEW_COLUMN_ID_LENGTH) {
      throw new BadRequestException(`stateJson.${fieldName} contiene id colonna troppo lunghi`);
    }
    if (seen.has(id)) {
      throw new BadRequestException(`stateJson.${fieldName} contiene id colonna duplicati`);
    }
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function normalizePresetId(value: unknown): TableViewPresetId {
  if (typeof value !== 'string' || !PRESET_ID_SET.has(value)) {
    throw new BadRequestException('stateJson.presetId non valido');
  }
  return value as TableViewPresetId;
}

/** Valida e normalizza lo state JSON delle preferenze colonne (persistenza sicura). */
export function parseAndValidateTableViewState(stateJson: string): ParsedTableViewState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stateJson);
  } catch {
    throw new BadRequestException('stateJson non è JSON valido');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BadRequestException('stateJson deve essere un oggetto');
  }

  const record = parsed as Record<string, unknown>;

  return {
    presetId: normalizePresetId(record['presetId']),
    columnOrder: normalizeColumnIds(record['columnOrder'], 'columnOrder'),
    hiddenColumnIds: normalizeColumnIds(record['hiddenColumnIds'], 'hiddenColumnIds'),
    pinnedColumnIds: normalizeColumnIds(record['pinnedColumnIds'], 'pinnedColumnIds'),
  };
}

/** Serializza lo state normalizzato (canonical JSON per storage). */
export function serializeTableViewState(state: ParsedTableViewState): string {
  return JSON.stringify({
    presetId: state.presetId,
    columnOrder: [...state.columnOrder],
    hiddenColumnIds: [...state.hiddenColumnIds],
    pinnedColumnIds: [...state.pinnedColumnIds],
  });
}
