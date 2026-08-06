import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportInventoryBodyDto {
  /** Chiavi riga `sku|location` da applicare; se assente importa tutte le righe pronte. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  keys?: string[];
}
