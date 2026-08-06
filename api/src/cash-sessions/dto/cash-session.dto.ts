import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Apertura cassa: sede e fondo dichiarato (contanti nel cassetto). */
export class OpenCashSessionDto {
  @IsUUID()
  locationId!: string;

  @IsInt()
  @Min(0)
  openingFloatMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/**
 * Chiusura cassa: il conteggio dichiarato per metodo. I contanti sono
 * obbligatori (il cassetto si conta sempre); carta e altro sono facoltativi —
 * chi non riconcilia il POS a fine turno lascia il campo vuoto.
 */
export class CloseCashSessionDto {
  @IsInt()
  @Min(0)
  countedCashMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  countedCardMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  countedOtherMinor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export const CASH_MOVEMENT_TYPES = ['deposit', 'withdrawal'] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

/** Versamento/prelievo di contante: causale obbligatoria, mai silenzioso. */
export class CreateCashMovementDto {
  @IsIn(CASH_MOVEMENT_TYPES)
  type!: CashMovementType;

  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason!: string;
}

export class ListCashSessionsQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
