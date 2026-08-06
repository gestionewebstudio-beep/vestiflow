import { CorrispettivoStatus } from '@prisma/client';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { CORRISPETTIVO_STATUS_VALUES } from './list-corrispettivo-entries.query.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aggiornamento voce registro Corrispettivi (fase 2 §4–§5): stato, data
 * fiscale (distinta e modificabile dagli utenti autorizzati), esclusione dal
 * riepilogo con motivo, nota di rettifica. I totali NON sono modificabili:
 * sono lo snapshot della Vendita online.
 */
export class UpdateCorrispettivoEntryDto {
  @IsOptional()
  @IsIn(CORRISPETTIVO_STATUS_VALUES)
  status?: CorrispettivoStatus;

  @IsOptional()
  @Matches(ISO_DATE)
  fiscalDate?: string;

  @IsOptional()
  @IsBoolean()
  invoiceIssued?: boolean;

  @IsOptional()
  @IsBoolean()
  excludedFromSummary?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  exclusionReason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustmentNote?: string | null;
}
