import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** Emissione fattura esterna su bozza fattura (§9.2, B6). */
export class MarkExternallyIssuedDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

  @IsOptional()
  @IsISO8601()
  externalDocDate?: string;
}
