import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { DocumentType } from '@prisma/client';

/**
 * Operatori da proporre nel filtro di una pagina elenco: ristretti ai tipi
 * documento che quella pagina mostra, così la tendina non elenca chi non ha
 * mai toccato quei documenti.
 */
export class ListDocumentOperatorsQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }
    const raw = Array.isArray(value) ? value : String(value).split(',');
    return raw.map((entry) => String(entry).trim()).filter(Boolean);
  })
  @IsEnum(DocumentType, { each: true })
  types?: DocumentType[];
}
