import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AdjustmentDirection } from '@prisma/client';

import { DocumentLineInputDto } from './create-document.dto';

/** Aggiornamento di un documento in bozza: righe sostituite integralmente. */
export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  @IsOptional()
  @IsISO8601()
  documentDate?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsUUID()
  targetLocationId?: string | null;

  @IsOptional()
  @IsEnum(AdjustmentDirection)
  adjustmentDirection?: AdjustmentDirection | null;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalComment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string | null;

  @IsOptional()
  @IsISO8601()
  externalDocDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  billingCause?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalRef?: string | null;

  @IsOptional()
  @IsUUID()
  supplierOrderId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineInputDto)
  lines?: DocumentLineInputDto[];
}
