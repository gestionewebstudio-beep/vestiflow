import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** Dati registrazione esterna (fattura fornitore / commercialista) — §4, §9.2. */
export class RegisterExternalDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

  @IsOptional()
  @IsISO8601()
  externalDocDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
