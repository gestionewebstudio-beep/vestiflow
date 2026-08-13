import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { TAX_REGIME_CODES } from '../../common/company/tax-regime.constants';
import { CompanyFieldsDto } from '../../common/dto/company-fields.dto';

/** I campi anagrafici, così come escono dall'API (null = non compilato). */
export interface CompanyProfileFieldsDto {
  readonly legalName: string | null;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly website: string | null;
  readonly pec: string | null;
  readonly sdiCode: string | null;
  /** IBAN di incasso: precompila i dati pagamento in fattura. */
  readonly iban: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly province: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  /** Regime fiscale FatturaPA; null = RF01 (ordinario). */
  readonly taxRegime: string | null;
  readonly reaOffice: string | null;
  readonly reaNumber: string | null;
  /** Capitale sociale in centesimi. */
  readonly shareCapitalMinor: number | null;
  /** null = non dichiarato, true = socio unico, false = più soci. */
  readonly soleShareholder: boolean | null;
  readonly inLiquidation: boolean;
}

/** Anagrafica dell'azienda gestita: la legge e la scrive solo il titolare. */
export interface CompanyProfileDto {
  /**
   * `null` finché il titolare non ha mai salvato. È uno stato reale — «non
   * ancora compilata» — e non va confuso con un'anagrafica salvata vuota:
   * la maschera mostra due cose diverse nei due casi.
   */
  readonly profile: CompanyProfileFieldsDto | null;
  /**
   * I dati di attivazione del cliente, offerti come precompilazione. Arrivano
   * col GET perché il pulsante «Precompila» riempie il form e basta: è il
   * titolare a rileggerli e salvare, nessun travaso avviene da solo.
   */
  readonly activationDefaults: CompanyProfileFieldsDto;
}

function trimToUndefined({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Semantica di sostituzione: quello che il body non porta viene azzerato.
 * La maschera invia sempre tutti i campi, e con la semantica di merge
 * svuotare un campo sarebbe impossibile.
 *
 * I campi qui sotto stanno solo sull'azienda gestita, non sui dati di
 * attivazione: sono quelli che servono a intestare un documento fiscale.
 */
export class UpdateCompanyProfileDto extends CompanyFieldsDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  @Transform(trimToUndefined)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trimToUndefined)
  website?: string;

  @IsOptional()
  @IsIn(TAX_REGIME_CODES)
  @Transform(trimToUndefined)
  taxRegime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @Transform(trimToUndefined)
  reaOffice?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trimToUndefined)
  reaNumber?: string;

  /** Centesimi: un capitale di 10.000 € arriva come 1000000. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999_999_999)
  shareCapitalMinor?: number;

  @IsOptional()
  @IsBoolean()
  soleShareholder?: boolean;

  @IsOptional()
  @IsBoolean()
  inLiquidation?: boolean;
}
