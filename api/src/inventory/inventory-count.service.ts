import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AdjustmentDirection,
  DocumentType,
  InventoryCountStatus,
  Prisma,
  StockMovementType,
  type InventoryCountLine,
  type InventoryCountSession,
} from '@prisma/client';

import type { Paginated } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelSyncFacade } from '../channels/channel-sync.facade';
import type { UserProfileDto } from '../auth/dto/user-profile.dto';
import { DocumentsService } from '../documents/documents.service';
import type { CreateInventoryCountDto } from './dto/create-inventory-count.dto';
import type { ListInventoryCountsQueryDto } from './dto/list-inventory-counts.query.dto';
import {
  INVENTORY_VIEW_SCOPE_MODE,
  locationScopeToCountSessionFilter,
  resolveOperationalLocationScope,
} from './licensed-location-scope.util';
import { assertUserCanAccessLocation } from './user-location-scope.util';
import { applyInventoryDelta } from './inventory-level-delta.util';

export type InventoryCountSessionSummary = InventoryCountSession & {
  location: { name: string };
  _count: { lines: number };
  linesCounted: number;
  linesWithDelta: number;
};

export type InventoryCountSessionDetail = InventoryCountSession & {
  location: { name: string };
  lines: InventoryCountLine[];
};

@Injectable()
export class InventoryCountService {
  private readonly logger = new Logger(InventoryCountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelSync: ChannelSyncFacade,
    private readonly documents: DocumentsService,
  ) {}

  async list(
    tenantId: string,
    query: ListInventoryCountsQueryDto,
    user?: UserProfileDto,
  ): Promise<Paginated<InventoryCountSessionSummary>> {
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

    const where: Prisma.InventoryCountSessionWhereInput = {
      tenantId,
      ...locationScopeToCountSessionFilter(scope),
      ...(query.status ? { status: query.status } : {}),
    };

    const [sessions, total] = await this.prisma.$transaction([
      this.prisma.inventoryCountSession.findMany({
        where,
        include: {
          location: { select: { name: true } },
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryCountSession.count({ where }),
    ]);

    const sessionIds = sessions.map((s) => s.id);
    const countStats =
      sessionIds.length === 0
        ? []
        : await this.prisma.inventoryCountLine.groupBy({
            by: ['sessionId'],
            where: { sessionId: { in: sessionIds }, countedQuantity: { not: null } },
            _count: { _all: true },
          });

    const deltaStats =
      sessionIds.length === 0
        ? []
        : await this.prisma.$queryRaw<{ session_id: string; delta_count: bigint }[]>`
          SELECT session_id, COUNT(*)::bigint AS delta_count
          FROM inventory_count_lines
          WHERE session_id = ANY(${sessionIds}::uuid[])
            AND counted_quantity IS NOT NULL
            AND counted_quantity <> system_quantity
          GROUP BY session_id
        `;

    const countedMap = new Map(countStats.map((row) => [row.sessionId, row._count._all]));
    const deltaMap = new Map(deltaStats.map((row) => [row.session_id, Number(row.delta_count)]));

    const items: InventoryCountSessionSummary[] = sessions.map((session) => ({
      ...session,
      linesCounted: countedMap.get(session.id) ?? 0,
      linesWithDelta: deltaMap.get(session.id) ?? 0,
    }));

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async create(
    tenantId: string,
    dto: CreateInventoryCountDto,
    user: UserProfileDto,
  ): Promise<InventoryCountSessionDetail> {
    assertUserCanAccessLocation(user, dto.locationId);

    const location = await this.prisma.location.findFirst({
      where: { id: dto.locationId, tenantId, licensedInVf: true, isActive: true },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException('Location non trovata o non attiva nel tuo piano');
    }

    const levels = await this.prisma.inventoryLevel.findMany({
      where: { tenantId, locationId: dto.locationId },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { variant: { sku: 'asc' } },
    });

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryCountSession.create({
        data: {
          tenantId,
          locationId: dto.locationId,
          name: dto.name.trim(),
          notes: dto.notes?.trim() || null,
          status: InventoryCountStatus.in_progress,
          createdByName: 'API',
        },
      });

      if (levels.length > 0) {
        await tx.inventoryCountLine.createMany({
          data: levels.map((level) => ({
            tenantId,
            sessionId: created.id,
            variantId: level.variantId,
            sku: level.variant.sku,
            productName: level.variant.product.name,
            systemQuantity: level.onHand,
          })),
        });
      }

      return created;
    });

    return this.getById(tenantId, session.id);
  }

  async getById(tenantId: string, id: string): Promise<InventoryCountSessionDetail> {
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: { id, tenantId },
      include: {
        location: { select: { name: true } },
        lines: { orderBy: [{ productName: 'asc' }, { sku: 'asc' }] },
      },
    });
    if (!session) {
      throw new NotFoundException('Sessione inventario non trovata');
    }
    return session;
  }

  async updateLine(
    tenantId: string,
    sessionId: string,
    lineId: string,
    countedQuantity: number,
    user: UserProfileDto,
  ): Promise<InventoryCountLine> {
    const session = await this.assertEditableSession(tenantId, sessionId);
    assertUserCanAccessLocation(user, session.locationId);

    const line = await this.prisma.inventoryCountLine.findFirst({
      where: { id: lineId, sessionId: session.id, tenantId },
    });
    if (!line) {
      throw new NotFoundException('Riga inventario non trovata');
    }

    return this.prisma.inventoryCountLine.update({
      where: { id: line.id },
      data: { countedQuantity },
    });
  }

  async submitForReview(
    tenantId: string,
    sessionId: string,
    user: UserProfileDto,
  ): Promise<InventoryCountSessionDetail> {
    const session = await this.assertEditableSession(tenantId, sessionId);
    assertUserCanAccessLocation(user, session.locationId);

    const counted = await this.prisma.inventoryCountLine.count({
      where: { sessionId: session.id, countedQuantity: { not: null } },
    });
    if (counted === 0) {
      throw new UnprocessableEntityException(
        'Conta almeno una variante prima di inviare a revisione.',
      );
    }

    await this.prisma.inventoryCountSession.update({
      where: { id: session.id },
      data: { status: InventoryCountStatus.review },
    });

    return this.getById(tenantId, sessionId);
  }

  async finalize(
    tenantId: string,
    sessionId: string,
    user: UserProfileDto,
  ): Promise<InventoryCountSessionDetail> {
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: { id: sessionId, tenantId },
      include: { lines: true },
    });
    if (!session) {
      throw new NotFoundException('Sessione inventario non trovata');
    }
    assertUserCanAccessLocation(user, session.locationId);
    if (session.status !== InventoryCountStatus.review) {
      throw new ConflictException(
        'La sessione deve essere in revisione prima di applicare le rettifiche.',
      );
    }

    const reason = `Inventario fisico: ${session.name}`;
    const linesToApply = session.lines.filter(
      (line) => line.countedQuantity !== null && line.countedQuantity !== line.systemQuantity,
    );

    const variantIdsForPush = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const line of linesToApply) {
        const delta = line.countedQuantity! - line.systemQuantity;
        const direction = delta > 0 ? AdjustmentDirection.increase : AdjustmentDirection.decrease;
        const quantity = Math.abs(delta);

        await this.applyDelta(tx, tenantId, line.variantId, session.locationId, delta);

        await tx.stockMovement.create({
          data: {
            tenantId,
            type: StockMovementType.adjustment,
            origin: 'manual',
            variantId: line.variantId,
            sku: line.sku,
            locationId: session.locationId,
            quantity,
            direction,
            reason,
            createdByName: 'API',
            externalRef: `inventory-count:${session.id}:${line.id}`,
          },
        });

        variantIdsForPush.add(line.variantId);
      }

      await tx.inventoryCountSession.update({
        where: { id: session.id },
        data: {
          status: InventoryCountStatus.completed,
          completedAt: new Date(),
        },
      });
    });

    for (const variantId of variantIdsForPush) {
      try {
        await this.channelSync.pushInventoryLevels(tenantId, variantId, [session.locationId]);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Push Shopify fallito';
        this.logger.warn(`Push inventario post-conteggio (${tenantId}): ${message}`);
      }
    }

    if (linesToApply.length > 0) {
      const draft = await this.documents.create(
        tenantId,
        {
          type: DocumentType.inventory,
          documentDate: new Date().toISOString(),
          locationId: session.locationId,
          notes: reason,
          internalComment: `Sessione inventario ${session.id}`,
          lines: linesToApply.map((line) => {
            const delta = line.countedQuantity! - line.systemQuantity;
            const sign = delta > 0 ? '+' : '-';
            return {
              variantId: line.variantId,
              sku: line.sku,
              description: `${line.productName} (${sign}${Math.abs(delta)})`,
              quantity: Math.abs(delta),
              loadsStock: false,
            };
          }),
        },
        user,
      );
      const confirmed = await this.documents.confirm(tenantId, draft.id, user);
      await this.prisma.inventoryCountSession.update({
        where: { id: sessionId },
        data: { documentId: confirmed.id },
      });
    }

    return this.getById(tenantId, sessionId);
  }

  async cancel(
    tenantId: string,
    sessionId: string,
    user: UserProfileDto,
  ): Promise<InventoryCountSessionDetail> {
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Sessione inventario non trovata');
    }
    assertUserCanAccessLocation(user, session.locationId);
    if (
      session.status === InventoryCountStatus.completed ||
      session.status === InventoryCountStatus.cancelled
    ) {
      throw new ConflictException('La sessione non può essere annullata.');
    }

    await this.prisma.inventoryCountSession.update({
      where: { id: session.id },
      data: { status: InventoryCountStatus.cancelled },
    });

    return this.getById(tenantId, sessionId);
  }

  async deleteCancelled(
    tenantId: string,
    sessionId: string,
    user: UserProfileDto,
  ): Promise<void> {
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Sessione inventario non trovata');
    }
    assertUserCanAccessLocation(user, session.locationId);
    if (session.status !== InventoryCountStatus.cancelled) {
      throw new ConflictException('Solo le sessioni annullate possono essere eliminate.');
    }

    await this.prisma.inventoryCountSession.delete({
      where: { id: session.id },
    });
  }

  private async assertEditableSession(
    tenantId: string,
    sessionId: string,
  ): Promise<InventoryCountSession> {
    const session = await this.prisma.inventoryCountSession.findFirst({
      where: { id: sessionId, tenantId },
    });
    if (!session) {
      throw new NotFoundException('Sessione inventario non trovata');
    }
    if (session.status !== InventoryCountStatus.in_progress) {
      throw new ConflictException('La sessione non è modificabile in questo stato.');
    }
    return session;
  }

  private async applyDelta(
    tx: Prisma.TransactionClient,
    tenantId: string,
    variantId: string,
    locationId: string,
    delta: number,
  ): Promise<void> {
    await applyInventoryDelta(tx, tenantId, variantId, locationId, delta, {
      insufficientMessage: (available) =>
        `Disponibilità insufficiente per SKU in rettifica inventario (disponibili ${available}).`,
    });
  }
}
