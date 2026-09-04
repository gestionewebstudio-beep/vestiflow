import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListCustomersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  /** true = solo ruoli attivi (picker documenti); default: tutti (gestione anagrafica). */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;

  /**
   * `all=1` — tutto il risultato del filtro invece di una pagina.
   *
   * ⭐ **L'anagrafica clienti non impagina più** (30/08/2026), come i prodotti:
   * un elenco mostra tutte le righe del filtro attivo.
   *
   * ⚠️ **Il parametro resta opzionale**: quattro schermate chiamano lo stesso
   * endpoint con `pageSize: 100` per riempire un elenco a tendina, e non devono
   * scaricare l'anagrafica intera.
   */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}
