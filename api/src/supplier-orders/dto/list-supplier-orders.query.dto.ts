import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { SupplierOrderStatus } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListSupplierOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SupplierOrderStatus)
  status?: SupplierOrderStatus;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /**
   * Periodo sulla **data ordine**, estremi inclusivi (`YYYY-MM-DD`).
   *
   * ⭐ Arriva con la rimozione delle pagine (`14` §H14-bis): un riepilogo che
   * non impagina ha bisogno di un contenimento, e il contenimento è il periodo.
   * Senza, «niente pagine» vorrebbe dire «tutta la storia del tenant, sempre».
   */
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  /**
   * Ordinamento: `campo:asc` separati da virgola, in ordine di priorità.
   * La whitelist la fa `parseSupplierOrderSort`, che è anche dove si traduce.
   */
  @IsOptional()
  @IsString()
  sort?: string;

  /**
   * `all=1` — tutto il risultato del filtro invece di una pagina
   * (`14` §H14-bis: i riepiloghi non impaginano). Il tetto e il troncamento
   * dichiarato stanno in `common/dto/unpaged.util`.
   */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}
