import { IsBoolean, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** Configurazione di un tipo documento (§2.2). Tutti i campi opzionali (patch). */
export class UpdateDocumentTypeSettingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  printTitle?: string;

  @IsOptional()
  @IsBoolean()
  autoNumbering?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  numberPrefix?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  defaultSeries?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultNotes?: string;
}
