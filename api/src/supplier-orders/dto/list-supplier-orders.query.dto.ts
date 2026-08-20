import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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
   * Ordinamento: `campo:asc` separati da virgola, in ordine di priorità.
   * La whitelist la fa `parseSupplierOrderSort`, che è anche dove si traduce.
   */
  @IsOptional()
  @IsString()
  sort?: string;
}
