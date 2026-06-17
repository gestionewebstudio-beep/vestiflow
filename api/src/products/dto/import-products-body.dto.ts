import { IsArray, IsOptional, IsString } from 'class-validator';

export class ImportProductsBodyDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  handles?: string[];
}
