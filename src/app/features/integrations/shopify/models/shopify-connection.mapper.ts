// Mapper di sola lettura DTO -> dominio per la connessione Shopify. Nessuna
// logica applicativa: trasformazione 1:1 della forma, opzionali preservati.
// Nessun mapper dominio -> DTO: la connessione e' read-only in questa fase.

import type {
  ShopifyConnection,
  ShopifyConnectionError,
} from '@core/models/shopify-connection.model';

import type { ShopifyConnectionDto, ShopifyConnectionErrorDto } from './shopify-connection.dto';

function errorFromDto(dto: ShopifyConnectionErrorDto): ShopifyConnectionError {
  return {
    message: dto.message,
    occurredAt: dto.occurredAt,
    code: dto.code,
  };
}

export function shopifyConnectionFromDto(dto: ShopifyConnectionDto): ShopifyConnection {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    status: dto.status,
    shopDomain: dto.shopDomain,
    displayName: dto.displayName,
    apiVersion: dto.apiVersion,
    scopes: dto.scopes,
    storeId: dto.storeId,
    lastConnectedAt: dto.lastConnectedAt,
    lastSyncAt: dto.lastSyncAt,
    webhooksActivatedAt: dto.webhooksActivatedAt,
    webhooksActiveCount: dto.webhooksActiveCount,
    lastError: dto.lastError ? errorFromDto(dto.lastError) : undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}
