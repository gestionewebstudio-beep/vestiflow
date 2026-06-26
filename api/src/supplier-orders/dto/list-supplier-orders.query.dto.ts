import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SupplierOrderStatus } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListSupplierOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SupplierOrderStatus)
  status?: SupplierOrderStatus;
}
