import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import {
  API_SOURCE_ONLINE,
  API_SOURCE_POS,
} from '../../sales-orders/sales-order.enum-mapper';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListOnlineSalesQueryDto extends PaginationQueryDto {
  /** Ricerca su riferimento, numero ordine, cliente, id ordine esterno. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn([API_SOURCE_ONLINE, API_SOURCE_POS])
  channel?: string;

  /** Filtro su data evasione (inclusivo). */
  @IsOptional()
  @Matches(ISO_DATE)
  fulfilledFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  fulfilledTo?: string;

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
