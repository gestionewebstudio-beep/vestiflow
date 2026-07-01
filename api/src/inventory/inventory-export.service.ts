import { Injectable } from '@nestjs/common';
import { MovementOrigin, Prisma, StockMovementType, TenantChannelProfile } from '@prisma/client';

import { serializeItalianExcelCsv } from '../common/csv.util';
import { onlineSalesChannelLabel } from '../common/tenant-channel-profile.util';
import { PrismaService } from '../prisma/prisma.service';
import type { ExportCorrispettiviQueryDto } from './dto/export-corrispettivi.query.dto';
import type { ExportInventoryLevelsQueryDto } from './dto/export-inventory-levels.query.dto';
import { buildInventoryVariantSearchWhere } from './inventory-variant-search.util';
import {
  buildVariantTitle,
  INVENTORY_EXPORT_HEADERS,
  serializeInventoryLevelsCsv,
  type InventoryExportHeader,
} from './import/inventory-csv.util';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import {
  INVENTORY_ACTION_SCOPE_MODE,
  INVENTORY_VIEW_SCOPE_MODE,
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  resolveOperationalLocationScope,
} from './licensed-location-scope.util';

const CORRISPETTIVI_EXPORT_HEADERS = [
  'Data e ora',
  'Tipo',
  'Canale',
  'SKU',
  'Prodotto',
  'Location',
  'Quantità',
  'Prezzo unitario',
  'Importo',
  'Valuta',
  'Operatore',
] as const;

const CORRISPETTIVI_ORIGIN_LABELS: Record<MovementOrigin, string> = {
  [MovementOrigin.manual]: 'Gestionale',
  [MovementOrigin.shopify]: 'Shopify',
  [MovementOrigin.tiktok]: 'TikTok',
  [MovementOrigin.vestiflow_pos]: 'Negozio fisico',
  [MovementOrigin.vestiflow_online]: 'Vendita online esterna',
};

function corrispettiviOriginLabel(
  origin: MovementOrigin,
  channelProfile: TenantChannelProfile | null | undefined,
): string {
  if (origin === MovementOrigin.vestiflow_online) {
    return onlineSalesChannelLabel(channelProfile);
  }
  return CORRISPETTIVI_ORIGIN_LABELS[origin] ?? origin;
}

const INVENTORY_LEVEL_COLUMN_EXPORT: Record<string, InventoryExportHeader> = {
  title: 'Variante',
  sku: 'SKU',
  locationName: 'Location',
  available: 'Disponibile',
  onHand: 'Fisico',
  committed: 'Impegnato',
  incoming: 'In arrivo',
  minThreshold: 'Soglia minima',
};

function resolveExportHeaders(columns?: string): readonly InventoryExportHeader[] {
  if (!columns?.trim()) {
    return INVENTORY_EXPORT_HEADERS;
  }
  const resolved = columns
    .split(',')
    .map((id) => INVENTORY_LEVEL_COLUMN_EXPORT[id.trim()])
    .filter((header): header is InventoryExportHeader => Boolean(header));
  return resolved.length > 0 ? resolved : INVENTORY_EXPORT_HEADERS;
}

const ROME_DATETIME_FORMAT = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Formato importo it-IT (es. 1.500,00) leggibile nativamente in Excel italiano. */
const EUR_AMOUNT_FORMAT = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

@Injectable()
export class InventoryExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Corrispettivi: vendite e storni (movimenti `sale`/`return`) in un periodo.
   * L'importo usa il prezzo di vendita CORRENTE della variante (i movimenti non
   * salvano il prezzo allo scontrino): per resi l'importo è negativo.
   */
  async exportCorrispettiviCsv(
    tenantId: string,
    query: ExportCorrispettiviQueryDto,
    user?: UserProfileDto,
  ): Promise<string> {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
      INVENTORY_VIEW_SCOPE_MODE,
    );
    if (!scope) {
      return serializeItalianExcelCsv(CORRISPETTIVI_EXPORT_HEADERS, []);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { channelProfile: true },
    });

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...locationScopeToMovementFilter(scope),
        type: { in: [StockMovementType.sale, StockMovementType.return] },
        ...(query.origin ? { origin: query.origin } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        variant: { select: { sellingPriceMinor: true, currency: true, product: { select: { name: true } } } },
        location: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = movements.map((movement) => {
      const isReturn = movement.type === StockMovementType.return;
      const unitMinor = movement.variant.sellingPriceMinor;
      const signedAmountMinor = (isReturn ? -1 : 1) * unitMinor * movement.quantity;
      return {
        'Data e ora': ROME_DATETIME_FORMAT.format(movement.createdAt),
        Tipo: isReturn ? 'Reso' : 'Vendita',
        Canale: corrispettiviOriginLabel(movement.origin, tenant?.channelProfile),
        SKU: movement.sku,
        Prodotto: movement.variant.product.name,
        Location: movement.location.name,
        Quantità: String(movement.quantity),
        'Prezzo unitario': this.formatMinor(unitMinor),
        Importo: this.formatMinor(signedAmountMinor),
        Valuta: movement.variant.currency,
        Operatore: movement.createdByName,
      };
    });

    return serializeItalianExcelCsv(CORRISPETTIVI_EXPORT_HEADERS, rows);
  }

  /** Unità minori intere → importo formattato it-IT (es. 1.500,00). */
  private formatMinor(minor: number): string {
    return EUR_AMOUNT_FORMAT.format(minor / 100);
  }

  async exportCsv(
    tenantId: string,
    query: ExportInventoryLevelsQueryDto,
    user?: UserProfileDto,
  ): Promise<string> {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
      INVENTORY_ACTION_SCOPE_MODE,
    );
    if (!scope) {
      return serializeInventoryLevelsCsv([], resolveExportHeaders(query.columns));
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: this.buildWhere(tenantId, query, scope),
      include: {
        variant: {
          select: {
            sku: true,
            optionValues: true,
            product: { select: { name: true } },
          },
        },
        location: { select: { name: true } },
      },
      orderBy: [{ variant: { product: { name: 'asc' } } }, { location: { name: 'asc' } }],
    });

    const filtered = query.stockStatus
      ? levels.filter((level) => this.stockStatusOf(level) === query.stockStatus)
      : levels;

    const rows: Record<InventoryExportHeader, string>[] = filtered.map((level) => ({
      Variante: buildVariantTitle(level.variant.product.name, level.variant.optionValues),
      SKU: level.variant.sku,
      Location: level.location.name,
      Disponibile: String(level.available),
      Fisico: String(level.onHand),
      Impegnato: String(level.committed),
      'In arrivo': String(level.incoming),
      'Soglia minima': String(level.minThreshold),
    }));

    const headers = resolveExportHeaders(query.columns);
    return serializeInventoryLevelsCsv(rows, headers);
  }

  private buildWhere(
    tenantId: string,
    query: ExportInventoryLevelsQueryDto,
    scope: readonly string[],
  ): Prisma.InventoryLevelWhereInput {
    return {
      tenantId,
      ...locationScopeToInventoryLevelFilter(scope),
      ...(query.search
        ? {
            variant: buildInventoryVariantSearchWhere(query.search),
          }
        : {}),
    };
  }

  private stockStatusOf(level: {
    readonly available: number;
    readonly minThreshold: number;
  }): 'ok' | 'low' | 'empty' {
    if (level.available <= 0) {
      return 'empty';
    }
    if (level.available <= level.minThreshold) {
      return 'low';
    }
    return 'ok';
  }
}
