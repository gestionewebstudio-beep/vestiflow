import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateInventoryCountDto {
  @IsUUID()
  locationId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
