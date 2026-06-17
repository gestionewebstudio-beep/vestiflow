import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCountLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity!: number;
}
