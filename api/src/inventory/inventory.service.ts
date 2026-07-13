import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdjustmentDirection,
  Prisma,
  StockMovementType,
  type InventoryLevel,
  type Location,
  type StockMovement,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { buildInventoryVariantSearchWhere } from './inventory-variant-search.util';
import { applyInventoryDelta } from './inventory-level-delta.util';
import {
  INVENTORY_VIEW_SCOPE_MODE,
  locationScopeToInventoryLevelFilter,
  locationScopeToMovementFilter,
  resolveOperationalLocationScope,
} from './licensed-location-scope.util';
import { assertUserCanAccessLocation } from './user-location-scope.util';
import type { Paginated } from '../common/dto/pagination.dto';
import type {
  ListInventoryLevelsQueryDto,
  ListMovementsQueryDto,
} from './dto/inventory-queries.dto';
import type { RegisterMovementDto } from './dto/register-movement.dto';
import {
  collectDocumentLookupIds,
  collectOnlineSaleLookupIds,
  resolveMovementDocumentReference,
} from './movement-document-reference.util';

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
    user?: UserProfileDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    const search = query.search?.trim();
    if (search) {
      return this.listLevelsForSearch(tenantId, query, search, user);
    }
    return this.listLevelsPaginated(tenantId, query, user);
  }

  /** Elenco paginato delle sole righe già presenti in inventario (browse senza ricerca). */
  private async listLevelsPaginated(
    tenantId: string,
    query: ListInventoryLevelsQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
      INVENTORY_VIEW_SCOPE_MODE,
    );
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
    user?: UserProfileDto,
  ): Promise<Paginated<InventoryLevelWithRefs>> {
    const variantWhere: Prisma.ProductVariantWhereInput = {
      tenantId,
      ...(query.variantId ? { id: query.variantId } : {}),
      ...buildInventoryVariantSearchWhere(search),
    };

    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
      INVENTORY_VIEW_SCOPE_MODE,
    );
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
    user?: UserProfileDto,
  ): Promise<Paginated<StockMovement>> {
    const scope = await resolveOperationalLocationScope(
      this.prisma,
      tenantId,
      user,
      query.locationId,
      INVENTORY_VIEW_SCOPE_MODE,
    );
    if (!scope) {
      return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    }

    const where: Prisma.StockMovementWhereInput = {
      tenantId,
      ...locationScopeToMovementFilter(scope),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.origin ? { origin: query.origin } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [rawItems, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          variant: { select: { product: { select: { name: true } } } },
        },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const documentIds = collectDocumentLookupIds(rawItems);
    const documents =
      documentIds.length > 0
        ? await this.prisma.document.findMany({
            where: { tenantId, id: { in: [...documentIds] } },
            select: { id: true, reference: true },
          })
        : [];
    const documentRefById = new Map(documents.map((doc) => [doc.id, doc.reference]));

    const onlineSaleIds = collectOnlineSaleLookupIds(rawItems);
    const onlineSales =
      onlineSaleIds.length > 0
        ? await this.prisma.onlineSale.findMany({
            where: { tenantId, id: { in: [...onlineSaleIds] } },
            select: { id: true, reference: true },
          })
        : [];
    const onlineSaleRefById = new Map(onlineSales.map((sale) => [sale.id, sale.reference]));

    const items = rawItems.map(({ variant, ...movement }) => ({
      ...movement,
      productTitle: variant?.product?.name ?? null,
      documentReference: resolveMovementDocumentReference(
        movement,
        documentRefById,
        onlineSaleRefById,
      ),
    }));

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
    actorUserId: string | undefined,
    user: UserProfileDto,
  ): Promise<StockMovement> {
    this.assertMovementShape(dto);
    assertUserCanAccessLocation(user, dto.locationId, 'write');
    if (dto.targetLocationId) {
      assertUserCanAccessLocation(user, dto.targetLocationId, 'transferDestination');
    }

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
    await applyInventoryDelta(tx, tenantId, variantId, locationId, delta);
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
    user?: UserProfileDto,
  ): Promise<InventoryLevelWithRefs> {
    const level = await this.prisma.inventoryLevel.findFirst({
      where: { id, tenantId },
      include: { variant: { select: LEVEL_VARIANT_INCLUDE } },
    });
    if (!level) {
      throw new NotFoundException('Giacenza non trovata');
    }
    if (user) {
      assertUserCanAccessLocation(user, level.locationId);
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
