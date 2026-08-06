import { IsInt, Min } from 'class-validator';

export class UpdateInventoryLevelDto {
  @IsInt()
  @Min(0)
  minThreshold!: number;
}
