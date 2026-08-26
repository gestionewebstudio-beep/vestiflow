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

  /**
   * Predefinita del tenant: `true` la sceglie, `false` la toglie.
   *
   * ⚠️ «Nessuna predefinita» è uno stato VALIDO e voluto: chi ha articoli misti
   * non deve cambiarla ogni volta. Mandare `false` sulla voce corrente è il
   * modo di tornarci.
   */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
