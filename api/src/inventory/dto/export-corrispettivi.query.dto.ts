import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { MovementOrigin } from '@prisma/client';

/**
 * Filtri export corrispettivi: vendite e storni (movimenti `sale`/`return`)
 * in un periodo, opzionalmente per location e canale (origine movimento).
 */
export class ExportCorrispettiviQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Canale: negozio (vestiflow_pos), online (vestiflow_online), Shopify, ecc. */
  @IsOptional()
  @IsEnum(MovementOrigin)
  origin?: MovementOrigin;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
