import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const USAGE_SCOPES = ['purchase', 'sales', 'both'] as const;
const CALCULATION_MODES = [
  'standard',
  'zero_rate',
  'reverse_charge',
  'split_payment',
  'margin_scheme',
  'informational',
] as const;

export class CreateVatCodeDto {
  /** Codice interno: max 16 char, lettere/numeri/punti/trattini/underscore. */
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,16}$/)
  code!: string;

  @IsUUID()
  natureId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  ratePercent!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  nonDeductiblePercent?: number;

  @IsString()
  @MaxLength(200)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsIn(USAGE_SCOPES)
  usageScope?: (typeof USAGE_SCOPES)[number];

  @IsOptional()
  @IsIn(CALCULATION_MODES)
  calculationMode?: (typeof CALCULATION_MODES)[number];

  @IsOptional()
  @IsBoolean()
  vatAffectsSupplierTotal?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVatCodeDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,16}$/)
  code?: string;

  @IsOptional()
  @IsUUID()
  natureId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  ratePercent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  nonDeductiblePercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsIn(USAGE_SCOPES)
  usageScope?: (typeof USAGE_SCOPES)[number];

  @IsOptional()
  @IsIn(CALCULATION_MODES)
  calculationMode?: (typeof CALCULATION_MODES)[number];

  @IsOptional()
  @IsBoolean()
  vatAffectsSupplierTotal?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DuplicateVatCodeDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,16}$/)
  code!: string;
}

export class ReorderVatCodesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(500)
  orderedIds!: string[];
}
