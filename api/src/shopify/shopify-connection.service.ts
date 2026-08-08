import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ShopifyConnectionStatus, ShopifySyncStatus, type ShopifyConnection } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { ShopifyConnectionDto, ShopifyScopeDiagnosticsDto } from './shopify-config.service';
import { ShopifyConfigService } from './shopify-config.service';
import { buildShopifyScopeDiagnostics } from './shopify-scopes.util';
import { toShopifyUserMessage } from './shopify-user-error.util';
import {
  missingShopifyWebhookTopics,
  normalizeObservedTopics,
  unexpectedShopifyWebhookTopics,
} from './shopify-webhook-topics';
import type { ShopifyWebhookObservation } from './shopify-webhook-topics';

export interface ClearShopifyErrorsResult {
  readonly cleared: true;
  readonly productsReset: number;
  readonly locationsReset: number;
}

/**
 * La parte che descrive un'osservazione, senza toccare l'attivazione.
 *
 * E' separata perche' osservare e attivare sono due cose diverse: «Verifica ora» chiede a
 * Shopify cosa c'e' e lo scrive qui, ma non deve accendere niente.
 */
function buildWebhookObservationData(topics: readonly string[], address: string) {
  return {
    webhookTopics: [...topics],
    webhookAddress: address,
    webhooksCheckedAt: new Date(),
    webhooksActiveCount: topics.length,
  };
}

/**
 * L'osservazione azzerata: elenco vuoto, indirizzo nullo e — soprattutto — data nulla,
 * cosi' «vuoto» continua a leggersi «non lo sappiamo» invece di «zero attivi».
 *
 * `lastWebhookEventAt` NON sta qui, di proposito: che un evento sia arrivato e' un fatto
 * del passato, e spegnere gli aggiornamenti automatici non lo rende falso. Lo azzera la
 * sola disconnessione, dove il negozio che verra' collegato dopo potrebbe essere un altro.
 */
function clearedWebhookObservation() {
  return {
    webhooksActivatedAt: null,
    webhooksActiveCount: null,
    webhookTopics: [] as string[],
    webhookAddress: null,
    webhooksCheckedAt: null,
  };
}

@Injectable()
export class ShopifyConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyConfig: ShopifyConfigService,
  ) {}

  async getForTenant(tenantId: string): Promise<ShopifyConnectionDto> {
    let connection = await this.prisma.shopifyConnection.findUnique({ where: { tenantId } });
    if (!connection) {
      return this.buildNotConnectedDto(tenantId);
    }

    if (connection.status === ShopifyConnectionStatus.not_connected) {
      return this.toDto(connection);
    }

    if (connection.status === ShopifyConnectionStatus.error) {
      await this.healStaleErrorStatus(tenantId);
      connection = await this.prisma.shopifyConnection.findUnique({ where: { tenantId } });
      if (!connection) {
        throw new NotFoundException('Connessione Shopify non trovata');
      }
      if (connection.status === ShopifyConnectionStatus.not_connected) {
        return this.toDto(connection);
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
        status: ShopifyConnectionStatus.error,
        lastErrorMessage: message.slice(0, 500),
        lastErrorCode: code,
        lastErrorAt: new Date(),
      },
    });
  }

  /** Registra un fallimento API Shopify (401/403 → reauth o error). */
  async recordApiFailure(tenantId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const raw = message.toLowerCase();
    const isAuthFailure =
      raw.includes('401') ||
      raw.includes('403') ||
      raw.includes('unauthorized') ||
      raw.includes('invalid api key') ||
      raw.includes('access token');

    if (!isAuthFailure) {
      return;
    }

    const userMessage = toShopifyUserMessage('token_expired', message);
    const needsReauth =
      raw.includes('401') ||
      raw.includes('invalid api key') ||
      raw.includes('access token') ||
      raw.includes('unauthorized');

    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        status: needsReauth
          ? ShopifyConnectionStatus.reauth_required
          : ShopifyConnectionStatus.error,
        lastErrorMessage: userMessage.slice(0, 500),
        lastErrorCode: needsReauth ? 'token_expired' : 'shopify_api_forbidden',
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

  /**
   * Registra cosa risulta attivo dopo una registrazione riuscita: QUALI topic e VERSO
   * DOVE, non quanti.
   *
   * Il conteggio continua a essere scritto ma e' ormai derivato dall'elenco — un solo
   * scrittore, quindi i due non possono divergere. Resta finche' i rami non sono uniti:
   * il database e' condiviso e il client Prisma dell'altro ramo seleziona quella colonna.
   */
  async recordWebhooksActivated(
    tenantId: string,
    observation: ShopifyWebhookObservation,
  ): Promise<void> {
    const topics = normalizeObservedTopics(observation.topics);
    if (topics.length === 0) {
      return;
    }
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        autoSyncEnabled: true,
        webhooksActivatedAt: new Date(),
        ...buildWebhookObservationData(topics, observation.address),
      },
    });
    await this.healStaleErrorStatus(tenantId);
  }

  async recordAutoSyncDisabled(tenantId: string): Promise<void> {
    await this.prisma.shopifyConnection.updateMany({
      where: { tenantId },
      data: {
        autoSyncEnabled: false,
        ...clearedWebhookObservation(),
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
        ...clearedWebhookObservation(),
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

  private buildNotConnectedDto(tenantId: string): ShopifyConnectionDto {
    const now = new Date().toISOString();
    return {
      id: tenantId,
      tenantId,
      status: ShopifyConnectionStatus.not_connected,
      shopDomain: null,
      displayName: null,
      apiVersion: this.shopifyConfig.apiVersion,
      scopes: [],
      scopeDiagnostics: this.buildScopeDiagnosticsDto([]),
      lastConnectedAt: null,
      lastSyncAt: null,
      webhooksActivatedAt: null,
      webhooksActiveCount: null,
      webhookAddress: null,
      webhookAddressMatchesConfigured: null,
      webhookTopics: [],
      webhookTopicsKnown: false,
      webhookMissingTopics: [],
      webhookUnexpectedTopics: [],
      webhooksCheckedAt: null,
      autoSyncEnabled: false,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private toDto(connection: ShopifyConnection): ShopifyConnectionDto {
    const scopeDiagnostics = this.buildScopeDiagnosticsDto(connection.scopes);
    const hideScopeDuplicate =
      scopeDiagnostics.catalogImportBlockedReason !== 'none' &&
      (connection.lastErrorCode === 'oauth_scope_not_granted' ||
        connection.lastErrorCode === 'oauth_scope_not_requested');

    const disconnected = connection.status === ShopifyConnectionStatus.not_connected;

    // La data dell'osservazione e' cio' che distingue «non lo sappiamo» da «zero attivi»:
    // senza di essa un elenco vuoto sarebbe indistinguibile da un negozio senza webhook.
    const topicsKnown = !disconnected && connection.webhooksCheckedAt !== null;
    const observedTopics = topicsKnown ? normalizeObservedTopics(connection.webhookTopics) : [];
    const observedAddress = disconnected ? null : connection.webhookAddress;
    const configuredAddress = this.shopifyConfig.webhookUrl ?? null;

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
      lastSyncAt: disconnected ? null : (connection.lastSyncAt?.toISOString() ?? null),
      webhooksActivatedAt: connection.webhooksActivatedAt?.toISOString() ?? null,
      webhooksActiveCount: connection.webhooksActiveCount,
      webhookAddress: observedAddress,
      // Un confronto, non un'inferenza: o i due indirizzi sono uguali o non lo sono.
      // `null` quando non c'e' niente da confrontare — mai `false` per ignoranza.
      webhookAddressMatchesConfigured:
        observedAddress && configuredAddress ? observedAddress === configuredAddress : null,
      webhookTopics: observedTopics,
      webhookTopicsKnown: topicsKnown,
      webhookMissingTopics: topicsKnown ? missingShopifyWebhookTopics(observedTopics) : [],
      webhookUnexpectedTopics: topicsKnown ? unexpectedShopifyWebhookTopics(observedTopics) : [],
      webhooksCheckedAt: disconnected
        ? null
        : (connection.webhooksCheckedAt?.toISOString() ?? null),
      autoSyncEnabled: disconnected ? false : connection.autoSyncEnabled,
      lastError:
        !disconnected &&
        !hideScopeDuplicate &&
        connection.lastErrorMessage
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
