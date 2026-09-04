import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListSuppliersQueryDto extends PaginationQueryDto {
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
   * ⭐ **Gli elenchi non impaginano** (30/08/2026): un elenco mostra tutte le
   * righe del filtro attivo, altrimenti il costo di un elenco lungo non si
   * manifesta mai e non lo si può misurare.
   *
   * ⚠️ **Resta opzionale**: chi chiama questo endpoint per riempire un elenco a
   * tendina continua a chiedere una pagina.
   */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}
