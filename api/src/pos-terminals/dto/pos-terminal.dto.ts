import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePosTerminalDto {
  @IsUUID()
  locationId!: string;

  /** Terminal ID assegnato dall'acquirer. */
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  terminalId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  acquirerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  /** Attivazione (o ultima variazione): determina la finestra del portale. */
  @IsISO8601()
  activatedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdatePosTerminalDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  acquirerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsISO8601()
  activatedAt?: string;

  /** true = adempimento fatto oggi sul portale; false = riaperto (da rifare). */
  @IsOptional()
  @IsBoolean()
  portalLinked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
