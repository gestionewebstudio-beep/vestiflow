import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import type { PaymentOptionKind } from '@prisma/client';

export class CreatePaymentOptionDto {
  @IsIn(['method', 'terms'])
  kind!: PaymentOptionKind;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class UpdatePaymentOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
