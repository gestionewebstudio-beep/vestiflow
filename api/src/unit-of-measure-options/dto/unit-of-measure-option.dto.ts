import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUnitOfMeasureOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name!: string;
}

export class UpdateUnitOfMeasureOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
