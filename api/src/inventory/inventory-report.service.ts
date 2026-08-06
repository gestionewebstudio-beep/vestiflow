import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { InventoryLocationReportRowDto } from './dto/inventory-location-report.dto';
import {
  INVENTORY_VIEW_SCOPE_MODE,
  resolveOperationalLocationScope,
} from './licensed-location-scope.util';

type LocationReportQueryRow = {
  readonly location_id: string;
  readonly location_name: string;
  readonly tracked_variants: number | bigint;
  readonly available_units: number | bigint;
  readonly low_stock_count: number | bigint;
  readonly stock_value_minor: number | bigint;
  readonly currency_code: string;
};

@Injectable()
export class InventoryReportService {
  constructor(private readonly prisma: PrismaService) {}

  async locationSummary(
    tenantId: string,
    user?: UserProfileDto,
  ): Promise<readonly InventoryLocationReportRowDto[]> {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      undefined,
      INVENTORY_VIEW_SCOPE_MODE,
    );
    if (!scope) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<LocationReportQueryRow[]>(Prisma.sql`
      SELECT
        l.id AS location_id,
        l.name AS location_name,
        COUNT(il.id)::int AS tracked_variants,
        COALESCE(SUM(il.available), 0)::int AS available_units,
        COUNT(*) FILTER (WHERE il.available <= il.min_threshold)::int AS low_stock_count,
        COALESCE(SUM(GREATEST(0, il.available) * pv.selling_price_minor), 0)::bigint AS stock_value_minor,
        COALESCE(MAX(pv.currency), 'EUR') AS currency_code
      FROM locations l
      LEFT JOIN inventory_levels il
        ON il.location_id = l.id AND il.tenant_id = l.tenant_id
      LEFT JOIN product_variants pv
        ON pv.id = il.variant_id
      WHERE l.tenant_id = ${tenantId}::uuid
        AND l.licensed_in_vf = true
        AND l.is_active = true
        AND l.id IN (${Prisma.join(scope.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY l.id, l.name
      ORDER BY l.name ASC
    `);

    return rows.map((row) => ({
      locationId: row.location_id,
      locationName: row.location_name,
      trackedVariants: Number(row.tracked_variants),
      availableUnits: Number(row.available_units),
      lowStockCount: Number(row.low_stock_count),
      stockValueMinor: Number(row.stock_value_minor),
      currencyCode: row.currency_code,
    }));
  }
}
