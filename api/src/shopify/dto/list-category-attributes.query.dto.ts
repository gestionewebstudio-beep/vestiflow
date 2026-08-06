import { IsString, MaxLength } from 'class-validator';

export class ListCategoryAttributesQueryDto {
  @IsString()
  @MaxLength(200)
  categoryId!: string;
}
