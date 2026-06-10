import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { AdjustmentDirection, StockMovementType } from '@prisma/client';

/**
 * Tipi registrabili manualmente dal gestionale. `sale` e `return` arrivano
 * solo dalla sync Shopify, mai da questo endpoint.
 */
export const MANUAL_MOVEMENT_TYPES = [
  StockMovementType.load,
  StockMovementType.unload,
  StockMovementType.transfer,
  StockMovementType.adjustment,
] as const;

export class RegisterMovementDto {
  @IsEnum(MANUAL_MOVEMENT_TYPES)
  type!: (typeof MANUAL_MOVEMENT_TYPES)[number];

  @IsUUID()
  variantId!: string;

  @IsUUID()
  locationId!: string;

  /** Solo trasferimenti: location di destinazione. */
  @IsOptional()
  @IsUUID()
  targetLocationId?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /** Solo rettifiche. */
  @IsOptional()
  @IsEnum(AdjustmentDirection)
  direction?: AdjustmentDirection;

  /** Obbligatorio per le rettifiche (regole-gestionale: mai adjustment silenziosi). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
