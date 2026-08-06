import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TikTokConnectionStatus, TikTokSyncStatus, type TikTokConnection } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { TikTokConnectionDto } from './tiktok-config.service';
import { toTikTokUserMessage } from './tiktok-user-error.util';

export interface ClearTikTokErrorsResult {
  readonly cleared: true;
  readonly productsReset: number;
}

@Injectable()
export class TikTokConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getForTenant(tenantId: string): Promise<TikTokConnectionDto> {
    let connection = await this.prisma.tikTokConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.status === TikTokConnectionStatus.not_connected) {
      throw new NotFoundException('Connessione TikTok Shop non trovata');
    }

    if (connection.status === TikTokConnectionStatus.error) {
      await this.healStaleErrorStatus(tenantId);
      connection = await this.prisma.tikTokConnection.findUnique({ where: { tenantId } });
      if (!connection || connection.status === TikTokConnectionStatus.not_connected) {
        throw new NotFoundException('Connessione TikTok Shop non trovata');
      }
    }

    return this.toDto(connection);
  }

  async touchSync(tenantId: string): Promise<void> {
    await this.prisma.tikTokConnection.updateMany({
      where: { tenantId },
      data: {
        lastSyncAt: new Date(),
        lastErrorMessage: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
    await this.healStaleErrorStatus(tenantId);
  }

  async healStaleErrorStatus(tenantId: string): Promise<void> {
    const credential = await this.prisma.tikTokCredential.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    });
    if (!credential) {
      return;
    }

    await this.prisma.tikTokConnection.updateMany({
      where: { tenantId, status: TikTokConnectionStatus.error },
      data: { status: TikTokConnectionStatus.connected },
    });
  }

  async recordError(tenantId: string, message: string, code?: string): Promise<void> {
    await this.prisma.tikTokConnection.updateMany({
      where: { tenantId },
      data: {
        status: TikTokConnectionStatus.error,
        lastErrorMessage: message.slice(0, 500),
        lastErrorCode: code,
        lastErrorAt: new Date(),
      },
    });
  }

  async clearErrors(tenantId: string): Promise<ClearTikTokErrorsResult> {
    const connection = await this.prisma.tikTokConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.status === TikTokConnectionStatus.not_connected) {
      throw new NotFoundException('Connessione TikTok Shop non trovata');
    }

    const credential = await this.prisma.tikTokCredential.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    });
    if (!credential) {
      throw new UnprocessableEntityException(
        'Impossibile ripristinare la connessione: TikTok Shop non è più collegato.',
      );
    }

    await this.prisma.tikTokConnection.updateMany({
      where: { tenantId },
      data: {
        lastErrorMessage: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
    await this.healStaleErrorStatus(tenantId);

    await this.prisma.product.updateMany({
      where: { tenantId, tiktokLastError: { not: null } },
      data: { tiktokLastError: null },
    });

    const productsReset = await this.prisma.product.updateMany({
      where: { tenantId, tiktokSyncStatus: TikTokSyncStatus.error },
      data: { tiktokSyncStatus: TikTokSyncStatus.out_of_sync, tiktokLastError: null },
    });

    return { cleared: true, productsReset: productsReset.count };
  }

  private toDto(connection: TikTokConnection): TikTokConnectionDto {
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      status: connection.status,
      shopId: connection.shopId,
      shopCipher: connection.shopCipher,
      displayName: connection.displayName,
      region: connection.region,
      scopes: connection.scopes,
      lastConnectedAt: connection.lastConnectedAt?.toISOString() ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastErrorMessage
        ? {
            message: toTikTokUserMessage(
              connection.lastErrorCode ?? undefined,
              connection.lastErrorMessage,
            ),
            occurredAt: (connection.lastErrorAt ?? connection.updatedAt).toISOString(),
            code: connection.lastErrorCode ?? undefined,
          }
        : null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}
