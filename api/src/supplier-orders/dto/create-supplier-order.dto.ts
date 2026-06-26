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
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { SupplierOrderStatus } from '@prisma/client';

export class CreateSupplierOrderLineDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  orderedQuantity!: number;

  /** Costo unitario in unità minori intere (regole-gestionale: mai float). */
  @IsInt()
  @Min(0)
  unitCostMinor!: number;
}

export class CreateSupplierOrderDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  destinationLocationId!: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string;

  /** Stato iniziale: solo bozza o inviato (gli altri sono transizioni). */
  @IsOptional()
  @IsEnum(SupplierOrderStatus)
  status?: SupplierOrderStatus;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierOrderLineDto)
  lines!: CreateSupplierOrderLineDto[];
}
