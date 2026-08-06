import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdjustmentDirection } from '@prisma/client';

/**
 * Riga Rettifica in salvataggio. L'id è presente per le righe già salvate:
 * preservarlo è essenziale per aggiornare il movimento collegato invece di
 * crearne uno nuovo (mirror §2.3 casi B/C dell'Arrivo merce).
 */
export class SaveAdjustmentLineDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @IsString()
  @Length(1, 300)
  description!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsBoolean()
  loadsStock?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  @ArrayMaxSize(500)
  serialNumbers?: string[];
}

/**
 * Salvataggio dedicato di una Rettifica GIÀ CONFERMATA (modifica righe dopo
 * la conferma): testata, righe (upsert per id) e movimenti per riga in
 * un'unica operazione idempotente. Mirror di SaveGoodsReceiptDto.
 *
 * La creazione e la prima conferma di una rettifica restano sul flusso
 * generico (POST /documents + POST /documents/:id/confirm): questa rotta
 * serve solo a preservare gli id riga stabili quando si modifica un
 * documento che ha GIÀ movimenti per riga collegati.
 */
export class SaveAdjustmentDto {
  @IsUUID()
  id!: string;

  /** Serie del documento: il progressivo è per serie. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /** Numero imposto dalla testata; assente = si conserva quello già assegnato. */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  @IsISO8601()
  documentDate!: string;

  @IsUUID()
  locationId!: string;

  @IsEnum(AdjustmentDirection)
  adjustmentDirection!: AdjustmentDirection;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Motivo della rettifica (obbligatorio, come richiesto già alla conferma). */
  @IsString()
  @Length(1, 2000)
  internalComment!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SaveAdjustmentLineDto)
  lines?: SaveAdjustmentLineDto[];
}
