import { Injectable, NotFoundException } from '@nestjs/common';
import { ShopifyConnectionStatus, type ShopifyConnection } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConnectionDto } from './shopify-config.service';

@Injectable()
export class ShopifyConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  async getForTenant(tenantId: string): Promise<ShopifyConnectionDto> {
    let connection = await this.prisma.shopifyConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.status === 'not_connected') {
      throw new NotFoundException('Connessione Shopify non trovata');
    }

    if (connection.status === ShopifyConnectionStatus.error) {
      await this.healStaleErrorStatus(tenantId);
      connection = await this.prisma.shopifyConnection.findUnique({ where: { tenantId } });
      if (!connection || connection.status === 'not_connected') {
        throw new NotFoundException('Connessione Shopify non trovata');
      }
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
    await this.healStaleErrorStatus(tenantId);
  }

  /**
   * Ripristina status `connected` se OAuth è ancora valido ma un webhook passato
   * aveva impostato `error` (stato stale, non connessione realmente rotta).
   */
  async healStaleErrorStatus(tenantId: string): Promise<void> {
    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    });
    if (!credential) {
      return;
    }

    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId, status: ShopifyConnectionStatus.error },
      data: { status: ShopifyConnectionStatus.connected },
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

  async recordWebhooksActivated(tenantId: string, activeCount: number): Promise<void> {
    if (activeCount <= 0) {
      return;
    }
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        autoSyncEnabled: true,
        webhooksActivatedAt: new Date(),
        webhooksActiveCount: activeCount,
      },
    });
    await this.healStaleErrorStatus(tenantId);
  }

  async recordAutoSyncDisabled(tenantId: string): Promise<void> {
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        autoSyncEnabled: false,
        webhooksActivatedAt: null,
        webhooksActiveCount: null,
      },
    });
  }

  async isAutoSyncEnabled(tenantId: string): Promise<boolean> {
    const connection = await this.prisma.shopifyConnection.findUnique({
      where: { tenantId },
      select: { autoSyncEnabled: true },
    });
    return connection?.autoSyncEnabled ?? false;
  }

  async clearSetupStatus(tenantId: string): Promise<void> {
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        autoSyncEnabled: false,
        webhooksActivatedAt: null,
        webhooksActiveCount: null,
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
      webhooksActivatedAt: connection.webhooksActivatedAt?.toISOString() ?? null,
      webhooksActiveCount: connection.webhooksActiveCount,
      autoSyncEnabled: connection.autoSyncEnabled,
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
