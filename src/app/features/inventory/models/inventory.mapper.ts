// Mapper puri DTO <-> dominio per location e giacenze. Nessuna logica
// applicativa: solo trasformazione 1:1 della forma. Le proprietà opzionali
// restano tali (niente default impliciti).

import type { InventoryLevel } from '@core/models/inventory-level.model';
import type { Location } from '@core/models/location.model';

import type { InventoryLevelDto } from './inventory-level.dto';
import type { LocationDto } from './location.dto';

export function locationFromDto(dto: LocationDto): Location {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    name: dto.name,
    code: dto.code,
    address: dto.address,
    isActive: dto.isActive,
    storeId: dto.storeId,
    shopify: dto.shopify,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function locationToDto(location: Location): LocationDto {
  return {
    id: location.id,
    tenantId: location.tenantId,
    name: location.name,
    code: location.code,
    address: location.address,
    isActive: location.isActive,
    storeId: location.storeId,
    shopify: location.shopify,
    createdAt: location.createdAt,
    updatedAt: location.updatedAt,
  };
}

export function inventoryLevelFromDto(dto: InventoryLevelDto): InventoryLevel {
  return {
    id: dto.id,
    variantId: dto.variantId,
    locationId: dto.locationId,
    onHand: dto.onHand,
    available: dto.available,
    committed: dto.committed,
    incoming: dto.incoming,
    reserved: dto.reserved,
    minThreshold: dto.minThreshold,
  };
}

export function inventoryLevelToDto(level: InventoryLevel): InventoryLevelDto {
  return {
    id: level.id,
    variantId: level.variantId,
    locationId: level.locationId,
    onHand: level.onHand,
    available: level.available,
    committed: level.committed,
    incoming: level.incoming,
    reserved: level.reserved,
    minThreshold: level.minThreshold,
  };
}
