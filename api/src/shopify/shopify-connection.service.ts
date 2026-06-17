import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ShopifyConnectionStatus, ShopifySyncStatus, type ShopifyConnection } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConnectionDto, ShopifyScopeDiagnosticsDto } from './shopify-config.service';
import { ShopifyConfigService } from './shopify-config.service';
import { buildShopifyScopeDiagnostics } from './shopify-scopes.util';
import { toShopifyUserMessage } from './shopify-user-error.util';

export interface ClearShopifyErrorsResult {
  readonly cleared: true;
  readonly productsReset: number;
  readonly locationsReset: number;
}

@Injectable()
export class ShopifyConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
  ) {}

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

  /** Azzera avvisi/errori Shopify salvati e ripristina lo stato connessione se OAuth è valido. */
  async clearErrors(tenantId: string): Promise<ClearShopifyErrorsResult> {
    const connection = await this.prisma.shopifyConnection.findUnique({ where: { tenantId } });
    if (!connection || connection.status === ShopifyConnectionStatus.not_connected) {
      throw new NotFoundException('Connessione Shopify non trovata');
    }

    const credential = await this.prisma.shopifyCredential.findUnique({
      where: { tenantId },
      select: { tenantId: true },
    });
    if (!credential) {
      throw new UnprocessableEntityException(
        'Impossibile ripristinare la connessione: Shopify non è più collegato.',
      );
    }

    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        lastErrorMessage: null,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    });
    await this.healStaleErrorStatus(tenantId);

    await this.prisma.product.updateMany({
      where: { tenantId, shopifyLastError: { not: null } },
      data: { shopifyLastError: null },
    });

    const productsReset = await this.prisma.product.updateMany({
      where: { tenantId, shopifySyncStatus: ShopifySyncStatus.error },
      data: { shopifySyncStatus: ShopifySyncStatus.out_of_sync, shopifyLastError: null },
    });

    await this.prisma.location.updateMany({
      where: { tenantId, shopifyLastError: { not: null } },
      data: { shopifyLastError: null },
    });

    const locationsReset = await this.prisma.location.updateMany({
      where: { tenantId, shopifySyncStatus: ShopifySyncStatus.error },
      data: { shopifySyncStatus: ShopifySyncStatus.out_of_sync, shopifyLastError: null },
    });

    return {
      cleared: true,
      productsReset: productsReset.count,
      locationsReset: locationsReset.count,
    };
  }

  private toDto(connection: ShopifyConnection): ShopifyConnectionDto {
    const scopeDiagnostics = this.buildScopeDiagnosticsDto(connection.scopes);
    return {
      id: connection.id,
      tenantId: connection.tenantId,
      status: connection.status,
      shopDomain: connection.shopDomain,
      displayName: connection.displayName,
      apiVersion: connection.apiVersion,
      scopes: connection.scopes,
      scopeDiagnostics,
      lastConnectedAt: connection.lastConnectedAt?.toISOString() ?? null,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      webhooksActivatedAt: connection.webhooksActivatedAt?.toISOString() ?? null,
      webhooksActiveCount: connection.webhooksActiveCount,
      autoSyncEnabled: connection.autoSyncEnabled,
      lastError: connection.lastErrorMessage
        ? {
            message: toShopifyUserMessage(
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

  private buildScopeDiagnosticsDto(granted: readonly string[]): ShopifyScopeDiagnosticsDto {
    const diagnostics = buildShopifyScopeDiagnostics(this.shopifyConfig.requestedScopes, granted);
    return diagnostics;
  }
}
