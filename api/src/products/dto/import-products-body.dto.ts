import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportProductsBodyDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  handles?: string[];
}
