import { IsArray, IsOptional, IsString } from 'class-validator';

export class ImportInventoryBodyDto {
  /** Chiavi riga `sku|location` da applicare; se assente importa tutte le righe pronte. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keys?: string[];
}
