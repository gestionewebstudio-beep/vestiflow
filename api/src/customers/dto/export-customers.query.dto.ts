import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Filtri export clienti (stessi filtri lista, senza paginazione). */
export class ExportCustomersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
