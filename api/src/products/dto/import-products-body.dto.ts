import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

import { parseImportHandles } from './parse-import-handles.util';

export class ImportProductsBodyDto {
  @IsOptional()
  @Transform(({ value }) => parseImportHandles(value))
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  handles?: string[];
}
