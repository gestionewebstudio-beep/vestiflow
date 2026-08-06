import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { InventoryCountStatus } from '@prisma/client';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListInventoryCountsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsEnum(InventoryCountStatus)
  status?: InventoryCountStatus;
}
