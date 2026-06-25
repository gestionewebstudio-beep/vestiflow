import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AdjustmentDirection, StockMovementType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { InventoryService } from './inventory.service';
import {
  InventoryCsvParseError,
  buildVariantTitle,
  inventoryImportKey,
  parseInventoryImportCsv,
  type InventoryCsvImportRow,
} from './import/inventory-csv.util';

export interface InventoryImportPreviewItem {
  readonly key: string;
  readonly rowNumber: number;
  readonly variantTitle: string;
  readonly sku: string;
  readonly locationName: string;
  readonly currentAvailable: number | null;
  readonly newAvailable: number | null;
  readonly delta: number | null;
  readonly status: 'ready' | 'unchanged' | 'error';
  readonly message?: string;
}

export interface InventoryImportPreviewResult {
  readonly rows: readonly InventoryImportPreviewItem[];
  readonly summary: {
    readonly total: number;
    readonly ready: number;
    readonly unchanged: number;
    readonly errors: number;
  };
}

export interface InventoryImportResultItem {
  readonly key: string;
  readonly sku: string;
  readonly locationName: string;
  readonly status: 'updated' | 'unchanged' | 'skipped' | 'failed';
  readonly message?: string;
}

export interface InventoryImportResult {
  readonly updated: number;
  readonly unchanged: number;
  readonly skipped: number;
  readonly failed: number;
  readonly rows: readonly InventoryImportResultItem[];
}

export interface InventoryImportOptions {
  readonly keys?: readonly string[];
}

interface ResolvedImportRow {
  readonly key: string;
  readonly rowNumber: number;
  readonly variantTitle: string;
  readonly sku: string;
  readonly locationName: string;
  readonly variantId: string;
  readonly locationId: string;
  readonly currentAvailable: number;
  readonly newAvailable: number;
  readonly delta: number;
  readonly minThreshold: number | null;
}

@Injectable()
export class InventoryImportService {
  private readonly logger = new Logger(InventoryImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async previewCsv(tenantId: string, csvText: string): Promise<InventoryImportPreviewResult> {
    const parsedRows = this.parseCsvOrThrow(csvText);
    const items = await this.buildPreviewItems(tenantId, parsedRows);
    return {
      rows: items,
      summary: {
        total: items.length,
        ready: items.filter((item) => item.status === 'ready').length,
        unchanged: items.filter((item) => item.status === 'unchanged').length,
        errors: items.filter((item) => item.status === 'error').length,
      },
    };
  }

  async importCsv(
    tenantId: string,
    csvText: string,
    user: UserProfileDto,
    options: InventoryImportOptions = {},
  ): Promise<InventoryImportResult> {
    const parsedRows = this.parseCsvOrThrow(csvText);
    const parsedByRowNumber = new Map(parsedRows.map((row) => [row.rowNumber, row]));
    const previewItems = await this.buildPreviewItems(tenantId, parsedRows);
    const keyFilter = options.keys?.length
      ? new Set(options.keys.map((key) => key.trim().toLowerCase()))
      : null;

    const [variants, locations] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { tenantId },
        select: { id: true, sku: true },
      }),
      this.prisma.location.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);
    const variantBySku = new Map(
      variants.map((variant) => [variant.sku.trim().toLowerCase(), variant]),
    );
    const locationByName = new Map(
      locations.map((location) => [location.name.trim().toLowerCase(), location]),
    );

    const results: InventoryImportResultItem[] = [];
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of previewItems) {
      if (keyFilter && !keyFilter.has(item.key.toLowerCase())) {
        continue;
      }

      if (item.status === 'error') {
        skipped += 1;
        results.push({
          key: item.key,
          sku: item.sku,
          locationName: item.locationName,
          status: 'skipped',
          message: item.message,
        });
        continue;
      }

      if (item.status === 'unchanged') {
        unchanged += 1;
        results.push({
          key: item.key,
          sku: item.sku,
          locationName: item.locationName,
          status: 'unchanged',
        });
        continue;
      }

      const variant = variantBySku.get(item.sku.trim().toLowerCase());
      const location = locationByName.get(item.locationName.trim().toLowerCase());
      const sourceRow = parsedByRowNumber.get(item.rowNumber);
      if (
        !variant ||
        !location ||
        item.newAvailable === null ||
        item.delta === null ||
        !sourceRow
      ) {
        skipped += 1;
        results.push({
          key: item.key,
          sku: item.sku,
          locationName: item.locationName,
          status: 'skipped',
          message: 'Riga non risolvibile.',
        });
        continue;
      }

      try {
        await this.applyRow(tenantId, user, {
          key: item.key,
          rowNumber: item.rowNumber,
          variantTitle: item.variantTitle,
          sku: item.sku,
          locationName: item.locationName,
          variantId: variant.id,
          locationId: location.id,
          currentAvailable: item.currentAvailable ?? 0,
          newAvailable: item.newAvailable,
          delta: item.delta,
          minThreshold: this.parseOptionalThreshold(sourceRow.minThresholdText),
        });
        updated += 1;
        results.push({
          key: item.key,
          sku: item.sku,
          locationName: item.locationName,
          status: 'updated',
        });
      } catch (error: unknown) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Import riga fallito';
        this.logger.warn(`Import giacenza CSV (${tenantId}, ${item.key}): ${message}`);
        results.push({
          key: item.key,
          sku: item.sku,
          locationName: item.locationName,
          status: 'failed',
          message,
        });
      }
    }

    return { updated, unchanged, skipped, failed, rows: results };
  }

  private parseCsvOrThrow(csvText: string): InventoryCsvImportRow[] {
    try {
      return parseInventoryImportCsv(csvText);
    } catch (error: unknown) {
      if (error instanceof InventoryCsvParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async buildPreviewItems(
    tenantId: string,
    parsedRows: readonly InventoryCsvImportRow[],
  ): Promise<InventoryImportPreviewItem[]> {
    const [variants, locations, levels] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: { tenantId },
        select: {
          id: true,
          sku: true,
          optionValues: true,
          product: { select: { name: true } },
        },
      }),
      this.prisma.location.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.inventoryLevel.findMany({
        where: { tenantId },
        select: {
          variantId: true,
          locationId: true,
          available: true,
        },
      }),
    ]);

    const variantBySku = new Map(
      variants.map((variant) => [variant.sku.trim().toLowerCase(), variant]),
    );
    const locationByName = new Map(
      locations.map((location) => [location.name.trim().toLowerCase(), location]),
    );
    const levelByKey = new Map(
      levels.map((level) => [`${level.variantId}|${level.locationId}`, level.available]),
    );
    const seenKeys = new Set<string>();

    const items: InventoryImportPreviewItem[] = [];
    for (const row of parsedRows) {
      const key = inventoryImportKey(row.sku, row.locationName);
      const base = {
        key,
        rowNumber: row.rowNumber,
        variantTitle: row.variantTitle,
        sku: row.sku,
        locationName: row.locationName,
      };

      if (!row.sku.trim()) {
        items.push({
          ...base,
          currentAvailable: null,
          newAvailable: null,
          delta: null,
          status: 'error',
          message: `Riga ${row.rowNumber}: SKU mancante.`,
        });
        continue;
      }

      if (!row.locationName.trim()) {
        items.push({
          ...base,
          currentAvailable: null,
          newAvailable: null,
          delta: null,
          status: 'error',
          message: `Riga ${row.rowNumber}: Location mancante.`,
        });
        continue;
      }

      if (seenKeys.has(key)) {
        items.push({
          ...base,
          currentAvailable: null,
          newAvailable: null,
          delta: null,
          status: 'error',
          message: `Riga ${row.rowNumber}: combinazione SKU/Location duplicata nel file.`,
        });
        continue;
      }
      seenKeys.add(key);

      const parsedAvailable = this.parseQuantity(row.availableText);
      if (parsedAvailable === null) {
        items.push({
          ...base,
          currentAvailable: null,
          newAvailable: null,
          delta: null,
          status: 'error',
          message: `Riga ${row.rowNumber}: Disponibile non valido.`,
        });
        continue;
      }

      const variant = variantBySku.get(row.sku.trim().toLowerCase());
      if (!variant) {
        items.push({
          ...base,
          currentAvailable: null,
          newAvailable: parsedAvailable,
          delta: null,
          status: 'error',
          message: `Riga ${row.rowNumber}: SKU non trovato.`,
        });
        continue;
      }

      const location = locationByName.get(row.locationName.trim().toLowerCase());
      if (!location) {
        items.push({
          ...base,
          currentAvailable: null,
          newAvailable: parsedAvailable,
          delta: null,
          status: 'error',
          message: `Riga ${row.rowNumber}: Location non trovata.`,
        });
        continue;
      }

      const currentAvailable = levelByKey.get(`${variant.id}|${location.id}`) ?? 0;
      const delta = parsedAvailable - currentAvailable;
      const title =
        row.variantTitle.trim() || buildVariantTitle(variant.product.name, variant.optionValues);

      items.push({
        key,
        rowNumber: row.rowNumber,
        variantTitle: title,
        sku: variant.sku,
        locationName: location.name,
        currentAvailable,
        newAvailable: parsedAvailable,
        delta,
        status: delta === 0 ? 'unchanged' : 'ready',
      });
    }

    return items;
  }

  private async applyRow(
    tenantId: string,
    user: UserProfileDto,
    row: ResolvedImportRow,
  ): Promise<void> {
    if (row.delta !== 0) {
      await this.inventory.registerMovement(
        tenantId,
        {
          type: StockMovementType.adjustment,
          variantId: row.variantId,
          locationId: row.locationId,
          quantity: Math.abs(row.delta),
          direction: row.delta > 0 ? AdjustmentDirection.increase : AdjustmentDirection.decrease,
          reason: 'Import CSV giacenze',
        },
        'Import CSV',
        undefined,
        user,
      );
    }

    if (row.minThreshold !== null) {
      await this.prisma.inventoryLevel.updateMany({
        where: {
          tenantId,
          variantId: row.variantId,
          locationId: row.locationId,
        },
        data: { minThreshold: row.minThreshold },
      });
    }
  }

  private parseQuantity(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return null;
    }
    const normalized = trimmed.replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return null;
    }
    return value;
  }

  private parseOptionalThreshold(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') {
      return null;
    }
    const normalized = trimmed.replace(',', '.');
    const value = Number(normalized);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return null;
    }
    return value;
  }
}
