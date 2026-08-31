import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProductStatus } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListProductsQueryDto extends PaginationQueryDto {
  /** Ricerca libera su nome, brand e SKU variante. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  season?: string;

  /** Include varianti (e immagini) nel payload: default false per la lista catalogo. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeVariants?: boolean;

  /**
   * `all=1` — tutto il risultato del filtro invece di una pagina.
   *
   * ⭐ **L'elenco prodotti non impagina più** (deciso il 30/08/2026): «se non
   * togli l'impaginazione non possiamo ottimizzarla». Con dieci righe a pagina il
   * costo di un elenco lungo non si manifesta mai, quindi non lo si può né
   * misurare né tarare — e la virtualizzazione resterebbe una scelta al buio.
   *
   * ⚠️ **Il parametro resta opzionale e la paginazione continua a funzionare**:
   * l'export e le chiamate di servizio la usano ancora, e toglierla dal contratto
   * sarebbe una rottura che nessuno ha chiesto.
   */
  @IsOptional()
  @Transform(({ value }) => value === '1' || value === 'true' || value === true)
  @IsBoolean()
  all?: boolean;
}
