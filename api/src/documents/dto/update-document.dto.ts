import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdjustmentDirection } from '@prisma/client';

import { DocumentLineInputDto } from './create-document.dto';
import { DocumentAddressDto, DocumentTransportFieldsDto } from './document-transport.dto';

/** Aggiornamento di un documento in bozza: righe sostituite integralmente. */
export class UpdateDocumentDto extends DocumentTransportFieldsDto {
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
  @IsInt()
  @Min(0)
  @Max(100)
  documentDiscountPercent?: number;

  @IsOptional()
  @IsUUID()
  supplierOrderId?: string | null;

  /** Condizioni di pagamento in testata (Preventivo: campo «Pagamento»). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paymentTerms?: string | null;

  /** Modalità di pagamento (DDT vendita: voce normativa MP01–MP23, snapshot nome). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethod?: string | null;

  /** Data prevista consegna (Preventivo: campo «Consegna prevista»). */
  @IsOptional()
  @IsISO8601()
  expectedDeliveryDate?: string | null;

  /** "Seguirà doc. di vendita" (DDT vendita, prompt DDT §TESTATA). */
  @IsOptional()
  @IsBoolean()
  followedBySalesDoc?: boolean;

  /** Intestatario documento (snapshot indirizzo, prompt DDT §INDIRIZZI). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAddressDto)
  recipientAddress?: DocumentAddressDto | null;

  /** Destinazione merce (può differire dall'intestatario). */
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAddressDto)
  destinationAddress?: DocumentAddressDto | null;

  /** Ordini cliente inclusi nel DDT vendita («Includi documento»). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  includedSalesOrderIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineInputDto)
  lines?: DocumentLineInputDto[];
}
