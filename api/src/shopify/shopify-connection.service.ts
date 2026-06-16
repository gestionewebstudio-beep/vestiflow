import { Injectable, NotFoundException } from '@nestjs/common';
import type { ShopifyConnection } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConnectionDto } from './shopify-config.service';

@Injectable()
export class ShopifyConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getForTenant(tenantId: string): Promise<ShopifyConnectionDto> {
    const connection = await this.prisma.shopifyConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.status === 'not_connected') {
      throw new NotFoundException('Connessione Shopify non trovata');
    }
    return this.toDto(connection);
  }

  async touchSync(tenantId: string): Promise<void> {
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        lastSyncAt: new Date(),
        lastErrorMessage: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
  }

  async recordError(tenantId: string, message: string, code?: string): Promise<void> {
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        status: 'error',
        lastErrorMessage: message.slice(0, 500),
        lastErrorCode: code,
        lastErrorAt: new Date(),
      },
    });
  }

  /** Avviso post-OAuth senza invalidare la connessione (es. webhook non registrati). */
  async recordSetupWarning(tenantId: string, message: string, code?: string): Promise<void> {
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        lastErrorMessage: message.slice(0, 500),
        lastErrorCode: code,
        lastErrorAt: new Date(),
      },
    });
  }

  private toDto(connection: ShopifyConnection): ShopifyConnectionDto {
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      status: connection.status,
      shopDomain: connection.shopDomain,
      displayName: connection.displayName,
      apiVersion: connection.apiVersion,
      scopes: connection.scopes,
      lastConnectedAt: connection.lastConnectedAt?.toISOString() ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      lastError: connection.lastErrorMessage
        ? {
            message: connection.lastErrorMessage,
            occurredAt: (connection.lastErrorAt ?? connection.updatedAt).toISOString(),
            code: connection.lastErrorCode ?? undefined,
          }
        : null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}
