import type { EntityId } from '@core/models/common.model';
import {
  InventoryCountStatus,
  type InventoryCountLine,
  type InventoryCountSession,
} from '@core/models/inventory-count.model';

export interface InventoryCountLineApiRow {
  readonly id: EntityId;
  readonly variantId: EntityId;
  readonly sku: string;
  readonly productName: string;
  readonly systemQuantity: number;
  readonly countedQuantity: number | null;
}

export interface InventoryCountSessionApiRow {
  readonly id: EntityId;
  readonly locationId: EntityId;
  readonly name: string;
  readonly notes: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly createdByName: string;
  readonly location: { readonly name: string };
  readonly _count?: { readonly lines: number };
  readonly linesCounted?: number;
  readonly linesWithDelta?: number;
  readonly lines?: readonly InventoryCountLineApiRow[];
  readonly documentId?: EntityId | null;
}

export function mapInventoryCountLineApiRow(row: InventoryCountLineApiRow): InventoryCountLine {
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.sku,
    productName: row.productName,
    systemQuantity: row.systemQuantity,
    countedQuantity: row.countedQuantity,
  };
}

export function mapInventoryCountSessionApiRow(
  row: InventoryCountSessionApiRow,
): InventoryCountSession {
  return {
    id: row.id,
    locationId: row.locationId,
    locationName: row.location.name,
    name: row.name,
    notes: row.notes,
    status: parseInventoryCountStatus(row.status),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    createdByName: row.createdByName,
    lineCount: row._count?.lines ?? row.lines?.length ?? 0,
    linesCounted: row.linesCounted ?? countLinesWithCount(row.lines),
    linesWithDelta: row.linesWithDelta ?? countLinesWithDelta(row.lines),
    lines: row.lines?.map(mapInventoryCountLineApiRow),
    documentId: row.documentId ?? undefined,
  };
}

function parseInventoryCountStatus(value: string): InventoryCountSession['status'] {
  if (value === InventoryCountStatus.Review) {
    return InventoryCountStatus.Review;
  }
  if (value === InventoryCountStatus.Completed) {
    return InventoryCountStatus.Completed;
  }
  if (value === InventoryCountStatus.Cancelled) {
    return InventoryCountStatus.Cancelled;
  }
  return InventoryCountStatus.InProgress;
}

function countLinesWithCount(lines: readonly InventoryCountLineApiRow[] | undefined): number {
  return lines?.filter((line) => line.countedQuantity !== null).length ?? 0;
}

function countLinesWithDelta(lines: readonly InventoryCountLineApiRow[] | undefined): number {
  return (
    lines?.filter(
      (line) => line.countedQuantity !== null && line.countedQuantity !== line.systemQuantity,
    ).length ?? 0
  );
}

export function inventoryCountLineDelta(line: InventoryCountLine): number | null {
  if (line.countedQuantity === null) {
    return null;
  }
  return line.countedQuantity - line.systemQuantity;
}
