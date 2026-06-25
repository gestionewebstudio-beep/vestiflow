import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdjustmentDirection,
  MovementOrigin,
  Prisma,
  StockMovementType,
  type InventoryLevel,
  type Location,
  type StockMovement,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import { buildInventoryVariantSearchWhere } from './inventory-variant-search.util';
import {
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  resolveLicensedLocationScope,
} from './licensed-location-scope.util';
import type { Paginated } from '../common/dto/pagination.dto';
import type {
  ListInventoryLevelsQueryDto,
  ListMovementsQueryDto,
} from './dto/inventory-queries.dto';
import type { RegisterMovementDto } from './dto/register-movement.dto';
import { RetailScanAction, type RegisterRetailScanDto } from './dto/register-retail-scan.dto';

export type RetailScanResult = {
  readonly movement: StockMovement;
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly productName: string;
  readonly remainingAvailable: number;
};

export type InventoryLevelWithRefs = InventoryLevel & {
  variant: { sku: string; optionValues: Prisma.JsonValue; product: { name: string } };
  location: { name: string };
};

/** Limite varianti espandibili in ricerca (variante × location). */
const MAX_SEARCH_VARIANTS = 100;

const LEVEL_VARIANT_INCLUDE = {
  sku: true,
  optionValues: true,
  product: { select: { name: true } },
} as const;

const LEVEL_LOCATION_INCLUDE = { name: true } as const;

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelSync: ChannelSyncFacade,
  ) {}

  listLocations(tenantId: string): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async listLevels(
    tenantId: string,
    query: ListInventoryLevelsQueryDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    const search = query.search?.trim();
    if (search) {
      return this.listLevelsForSearch(tenantId, query, search);
    }
    return this.listLevelsPaginated(tenantId, query);
  }

  /** Elenco paginato delle sole righe già presenti in inventario (browse senza ricerca). */
  private async listLevelsPaginated(
    tenantId: string,
    query: ListInventoryLevelsQueryDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    const scope = await resolveLicensedLocationScope(this.prisma, tenantId, query.locationId);
    if (!scope) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const where: Prisma.InventoryLevelWhereInput = {
      tenantId,
      ...locationScopeToInventoryLevelFilter(scope),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.lowStockOnly
        ? { available: { lte: this.prisma.inventoryLevel.fields.minThreshold } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryLevel.findMany({
        where,
        include: {
          variant: { select: LEVEL_VARIANT_INCLUDE },
          location: { select: LEVEL_LOCATION_INCLUDE },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryLevel.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Con ricerca attiva include anche varianti senza riga in `inventory_levels`
   * (giacenza 0 per location), allineandosi al comportamento di "Cerca".
   */
  private async listLevelsForSearch(
    tenantId: string,
    query: ListInventoryLevelsQueryDto,
    search: string,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    const variantWhere: Prisma.ProductVariantWhereInput = {
      tenantId,
      ...(query.variantId ? { id: query.variantId } : {}),
      ...buildInventoryVariantSearchWhere(search),
    };

    const scope = await resolveLicensedLocationScope(this.prisma, tenantId, query.locationId);
    if (!scope) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const [variants, locations] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: variantWhere,
        select: {
          id: true,
          sku: true,
          optionValues: true,
          product: { select: { name: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
        take: MAX_SEARCH_VARIANTS,
      }),
      this.prisma.location.findMany({
        where: {
          tenantId,
          licensedInVf: true,
          isActive: true,
          id: { in: [...scope] },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    if (variants.length === 0 || locations.length === 0) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const variantIds = variants.map((variant) => variant.id);
    const existingLevels = await this.prisma.inventoryLevel.findMany({
      where: {
        tenantId,
        variantId: { in: variantIds },
        ...locationScopeToInventoryLevelFilter(scope),
      },
      include: {
        variant: { select: LEVEL_VARIANT_INCLUDE },
        location: { select: { name: true } },
      },
    });

    const levelByKey = new Map(
      existingLevels.map((level) => [`${level.variantId}|${level.locationId}`, level]),
    );

    const rows: InventoryLevelWithRefs[] = [];
    for (const variant of variants) {
      for (const location of locations) {
        const key = `${variant.id}|${location.id}`;
        const existing = levelByKey.get(key);
        rows.push(
          existing ??
            this.buildVirtualInventoryLevel(tenantId, variant, location),
        );
      }
    }

    const filtered = query.lowStockOnly
      ? rows.filter((row) => row.available <= row.minThreshold)
      : rows;

    filtered.sort(
      (a, b) =>
        a.variant.product.name.localeCompare(b.variant.product.name) ||
        a.variant.sku.localeCompare(b.variant.sku) ||
        a.location.name.localeCompare(b.location.name),
    );

    const total = filtered.length;
    const skip = (query.page - 1) * query.pageSize;
    const items = filtered.slice(skip, skip + query.pageSize);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private buildVirtualInventoryLevel(
    tenantId: string,
    variant: { id: string; sku: string; optionValues?: Prisma.JsonValue; product: { name: string } },
    location: { id: string; name: string },
  ): InventoryLevelWithRefs {
    return {
      id: `virtual:${variant.id}:${location.id}`,
      tenantId,
      variantId: variant.id,
      locationId: location.id,
      onHand: 0,
      available: 0,
      committed: 0,
      incoming: 0,
      reserved: 0,
      minThreshold: 0,
      updatedAt: new Date(0),
      variant: {
        sku: variant.sku,
        optionValues: variant.optionValues ?? [],
        product: { name: variant.product.name },
      },
      location: { name: location.name },
    };
  }

  async listMovements(
    tenantId: string,
    query: ListMovementsQueryDto,
  ): Promise<Paginated<StockMovement>> {
    const scope = await resolveLicensedLocationScope(this.prisma, tenantId, query.locationId);
    if (!scope) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      ...locationScopeToMovementFilter(scope),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Registra un movimento manuale aggiornando le giacenze nella STESSA
   * transazione: o si scrivono movimento + giacenze, o niente
   * (regole-gestionale: mai stock aggiornato senza traccia).
   */
  async registerMovement(
    tenantId: string,
    dto: RegisterMovementDto,
    actorDisplayName: string,
    actorUserId?: string,
  ): Promise<StockMovement> {
    this.assertMovementShape(dto);

    const movement = await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: dto.variantId, tenantId },
        select: { id: true, sku: true },
      });
      if (!variant) {
        throw new NotFoundException('Variante non trovata');
      }
      await this.assertLocationExists(tx, tenantId, dto.locationId);
      if (dto.targetLocationId) {
        await this.assertLocationExists(tx, tenantId, dto.targetLocationId);
      }

      const delta = this.sourceDelta(dto);
      await this.applyDelta(tx, tenantId, dto.variantId, dto.locationId, delta);
      if (dto.type === StockMovementType.transfer && dto.targetLocationId) {
        await this.applyDelta(tx, tenantId, dto.variantId, dto.targetLocationId, dto.quantity);
      }

      return tx.stockMovement.create({
        data: {
          tenantId,
          type: dto.type,
          origin: 'manual',
          variantId: dto.variantId,
          sku: variant.sku,
          locationId: dto.locationId,
          targetLocationId: dto.targetLocationId,
          quantity: dto.quantity,
          direction: dto.type === StockMovementType.adjustment ? dto.direction : null,
          reason: dto.reason,
          createdById: actorUserId ?? null,
          createdByName: actorDisplayName.trim() || 'Utente',
        },
      });
    });

    const locationIds = dto.targetLocationId
      ? [dto.locationId, dto.targetLocationId]
      : [dto.locationId];
    void Promise.resolve(
      this.channelSync.pushInventoryLevels(tenantId, dto.variantId, locationIds),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Push inventario canali fallito';
      this.logger.warn(`Push inventario post-movimento (${tenantId}): ${message}`);
    });

    return movement;
  }

  /**
   * Registra una vendita o uno storno al banco (doppia scansione).
   * Ogni scansione produce un movimento `sale` o `return` con origine `vestiflow_pos`.
   */
  async registerRetailScan(
    tenantId: string,
    dto: RegisterRetailScanDto,
    actorDisplayName: string,
    actorUserId?: string,
  ): Promise<RetailScanResult> {
    const code = dto.code.trim();
    if (!code) {
      throw new NotFoundException('Variante non trovata per SKU o barcode');
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: {
        tenantId,
        OR: [
          { sku: { equals: code, mode: 'insensitive' } },
          { barcode: { equals: code, mode: 'insensitive' } },
        ],
      },
      include: { product: { select: { id: true, name: true } } },
    });
    if (!variant) {
      throw new NotFoundException('Variante non trovata per SKU o barcode');
    }

    const movementType =
      dto.action === RetailScanAction.Sale ? StockMovementType.sale : StockMovementType.return;
    const delta = dto.action === RetailScanAction.Sale ? -1 : 1;
    const reason =
      dto.action === RetailScanAction.Sale ? 'Vendita negozio' : 'Storno negozio (reso)';

    const movement = await this.prisma.$transaction(async (tx) => {
      await this.assertLocationExists(tx, tenantId, dto.locationId);
      await this.applyDelta(tx, tenantId, variant.id, dto.locationId, delta);

      return tx.stockMovement.create({
        data: {
          tenantId,
          type: movementType,
          origin: 'vestiflow_pos' as MovementOrigin,
          variantId: variant.id,
          sku: variant.sku,
          locationId: dto.locationId,
          quantity: 1,
          reason,
          createdById: actorUserId ?? null,
          createdByName: actorDisplayName.trim() || 'Utente',
        },
      });
    });

    const level = await this.prisma.inventoryLevel.findUnique({
      where: {
        variantId_locationId: { variantId: variant.id, locationId: dto.locationId },
      },
      select: { available: true },
    });

    void Promise.resolve(
      this.channelSync.pushInventoryLevels(tenantId, variant.id, [dto.locationId]),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Push inventario canali fallito';
      this.logger.warn(`Push inventario post-vendita al banco (${tenantId}): ${message}`);
    });

    return {
      movement,
      variantId: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      productName: variant.product.name,
      remainingAvailable: level?.available ?? 0,
    };
  }

  /** Variazione (con segno) da applicare alla location di origine. */
  private sourceDelta(dto: RegisterMovementDto): number {
    switch (dto.type) {
      case StockMovementType.load:
        return dto.quantity;
      case StockMovementType.unload:
      case StockMovementType.transfer:
        return -dto.quantity;
      case StockMovementType.adjustment:
        return dto.direction === AdjustmentDirection.increase ? dto.quantity : -dto.quantity;
      default:
        return 0;
    }
  }

  private async applyDelta(
    tx: Prisma.TransactionClient,
    tenantId: string,
    variantId: string,
    locationId: string,
    delta: number,
  ): Promise<void> {
    const level = await tx.inventoryLevel.upsert({
      where: { variantId_locationId: { variantId, locationId } },
      create: { tenantId, variantId, locationId },
      update: {},
    });
    const nextAvailable = level.available + delta;
    if (delta < 0 && nextAvailable < 0) {
      throw new UnprocessableEntityException(
        `Disponibilità insufficiente: richiesti ${Math.abs(delta)}, disponibili ${level.available}.`,
      );
    }
    await tx.inventoryLevel.update({
      where: { id: level.id },
      data: { onHand: level.onHand + delta, available: nextAvailable },
    });
  }

  private async assertLocationExists(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationId: string,
  ): Promise<void> {
    const location = await tx.location.findFirst({
      where: { id: locationId, tenantId, licensedInVf: true, isActive: true },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location non trovata o non attiva nel tuo piano');
    }
  }

  /** Aggiorna la soglia minima di una giacenza (manager+). */
  async updateLevelMinThreshold(
    tenantId: string,
    id: string,
    minThreshold: number,
  ): Promise<InventoryLevelWithRefs> {
    const level = await this.prisma.inventoryLevel.findFirst({
      where: { id, tenantId },
      include: { variant: { select: LEVEL_VARIANT_INCLUDE } },
    });
    if (!level) {
      throw new NotFoundException('Giacenza non trovata');
    }
    return this.prisma.inventoryLevel.update({
      where: { id },
      data: { minThreshold },
      include: {
        variant: { select: LEVEL_VARIANT_INCLUDE },
        location: { select: { name: true } },
      },
    });
  }

  /** Vincoli per tipo, prima di toccare il DB. */
  private assertMovementShape(dto: RegisterMovementDto): void {
    if (dto.type === StockMovementType.transfer) {
      if (!dto.targetLocationId) {
        throw new UnprocessableEntityException('Trasferimento senza location di destinazione');
      }
      if (dto.targetLocationId === dto.locationId) {
        throw new UnprocessableEntityException('Origine e destinazione coincidono');
      }
    }
    if (dto.type === StockMovementType.adjustment) {
      if (!dto.direction) {
        throw new UnprocessableEntityException('Rettifica senza direzione (increase/decrease)');
      }
      if (!dto.reason?.trim()) {
        throw new UnprocessableEntityException('Le rettifiche richiedono un motivo');
      }
    }
  }
}
