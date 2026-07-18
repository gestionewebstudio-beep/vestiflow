import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { MANUAL_MOVEMENT_TYPES } from './register-movement.dto';

/**
 * Riga del form Registra movimento multi-articolo. `quantity` per
 * carico/scarico/trasferimento; `newOnHand` (nuova giacenza) per le
 * rettifiche — il server calcola il delta rispetto alla giacenza attuale.
 */
export class RegisterMovementBatchLineDto {
  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  /** Solo rettifiche: nuova giacenza assoluta della variante nella location. */
  @IsOptional()
  @IsInt()
  @Min(0)
  newOnHand?: number;

  /**
   * Unità minori intere (mai float): costo unitario per i carichi, prezzo
   * unitario per gli scarichi. Salvato nello snapshot `unitCostMinor`.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  unitAmountMinor?: number;
}

/** Body POST /inventory/movements/batch: registra tutti i movimenti insieme. */
export class RegisterMovementBatchDto {
  @IsEnum(MANUAL_MOVEMENT_TYPES)
  type!: (typeof MANUAL_MOVEMENT_TYPES)[number];

  /** Data operazione (default oggi): diventa il createdAt dei movimenti. */
  @IsOptional()
  @IsISO8601()
  operationDate?: string;

  @IsUUID()
  locationId!: string;

  /** Solo trasferimenti: location di destinazione. */
  @IsOptional()
  @IsUUID()
  targetLocationId?: string;

  /** Causale condivisa da tutte le righe (obbligatoria per le rettifiche). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Controparte facoltativa: provenienza (carico) o destinatario (scarico). */
  @IsOptional()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  partyName?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RegisterMovementBatchLineDto)
  lines!: RegisterMovementBatchLineDto[];
}
