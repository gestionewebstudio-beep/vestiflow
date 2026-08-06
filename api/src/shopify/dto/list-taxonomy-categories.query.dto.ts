import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListTaxonomyCategoriesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** GID TaxonomyCategory padre per elencare le sottocategorie. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  childrenOf?: string;
}
