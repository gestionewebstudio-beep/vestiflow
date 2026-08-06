import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const FISCAL_OUTCOMES = ['emitted', 'failed'] as const;
export type FiscalOutcome = (typeof FISCAL_OUTCOMES)[number];

/**
 * Esito dell'emissione riportato dalla cassa: è il browser in negozio a
 * parlare con la stampante, il server ne registra il risultato.
 */
export class ReportFiscalOutcomeDto {
  @IsIn(FISCAL_OUTCOMES)
  outcome!: FiscalOutcome;

  /** Progressivo del documento commerciale assegnato dalla stampante. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fiscalNumber?: string;

  /** Matricola letta dalla risposta della stampante (se disponibile). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  errorMessage?: string;
}
