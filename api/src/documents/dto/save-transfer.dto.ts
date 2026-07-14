import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

/**
 * Riga Trasferimento in salvataggio. L'id è presente per le righe già
 * salvate: preservarlo è essenziale per aggiornare il movimento collegato
 * invece di crearne uno nuovo (mirror §2.3 casi B/C dell'Arrivo merce).
 */
export class SaveTransferLineDto {
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
 * Salvataggio dedicato di un Trasferimento GIÀ CONFERMATO (modifica righe
 * dopo la conferma): testata, righe (upsert per id) e movimenti per riga in
 * un'unica operazione idempotente. Mirror di SaveGoodsReceiptDto.
 *
 * La creazione e la prima conferma di un trasferimento restano sul flusso
 * generico (POST /documents + POST /documents/:id/confirm): questa rotta
 * serve solo a preservare gli id riga stabili quando si modifica un
 * documento che ha GIÀ movimenti per riga collegati.
 */
export class SaveTransferDto {
  @IsUUID()
  id!: string;

  @IsISO8601()
  documentDate!: string;

  @IsUUID()
  locationId!: string;

  @IsUUID()
  targetLocationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalComment?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SaveTransferLineDto)
  lines?: SaveTransferLineDto[];
}
