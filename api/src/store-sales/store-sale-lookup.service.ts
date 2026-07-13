import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { LookupStoreSaleItemQueryDto } from './dto/lookup-store-sale-item.query.dto';

/** Articolo trovato per il carrello cassa: prezzo + quantità alla location. */
export interface StoreSaleItemLookupResult {
  readonly variantId: string;
  readonly sku: string;
  readonly barcode: string | null;
  readonly productName: string;
  readonly optionSummary: string;
  readonly sellingPriceMinor: number;
  readonly currency: string;
  readonly vatRatePercent: number | null;
  readonly onHand: number;
  readonly committed: number;
  readonly available: number;
}

@Injectable()
export class StoreSaleLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Match esatto barcode/SKU (scansione) o ricerca libera su SKU/nome prodotto.
   * Restituisce sempre Giacenza/Impegnata/Disponibile alla location (§8).
   */
  async lookupItems(
    tenantId: string,
    query: LookupStoreSaleItemQueryDto,
  ): Promise<StoreSaleItemLookupResult[]> {
    const code = query.code.trim();

    const exact = await this.prisma.productVariant.findMany({
      where: {
        tenantId,
        OR: [
          { sku: { equals: code, mode: 'insensitive' } },
          { barcode: { equals: code, mode: 'insensitive' } },
        ],
      },
      ...this.variantSelect(),
      take: 5,
    });

    const rows =
      exact.length > 0
        ? exact
        : await this.prisma.productVariant.findMany({
            where: {
              tenantId,
              OR: [
                { sku: { contains: code, mode: 'insensitive' } },
                { barcode: { contains: code, mode: 'insensitive' } },
                { product: { name: { contains: code, mode: 'insensitive' } } },
              ],
            },
            ...this.variantSelect(),
            orderBy: { sku: 'asc' },
            take: 15,
          });

    if (rows.length === 0) {
      return [];
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: {
        tenantId,
        locationId: query.locationId,
        variantId: { in: rows.map((row) => row.id) },
      },
      select: { variantId: true, onHand: true, committed: true, available: true },
    });
    const levelByVariant = new Map(levels.map((level) => [level.variantId, level]));

    return rows.map((row) => {
      const level = levelByVariant.get(row.id);
      return {
        variantId: row.id,
        sku: row.sku,
        barcode: row.barcode,
        productName: row.product.name,
        optionSummary: this.optionSummary(row.optionValues),
        sellingPriceMinor: row.sellingPriceMinor,
        currency: row.currency,
        vatRatePercent: row.product.defaultVatRatePercent,
        onHand: level?.onHand ?? 0,
        committed: level?.committed ?? 0,
        available: level?.available ?? 0,
      };
    });
  }

  private variantSelect() {
    return {
      select: {
        id: true,
        sku: true,
        barcode: true,
        optionValues: true,
        sellingPriceMinor: true,
        currency: true,
        product: { select: { name: true, defaultVatRatePercent: true } },
      },
    } as const;
  }

  private optionSummary(optionValues: Prisma.JsonValue): string {
    if (!Array.isArray(optionValues)) {
      return '';
    }
    const parts = optionValues
      .map((entry) =>
        entry && typeof entry === 'object' && 'value' in entry
          ? String((entry as { value: unknown }).value)
          : null,
      )
      .filter((value): value is string => !!value);
    return parts.join(' / ');
  }
}
