import { IsOptional, IsUUID } from 'class-validator';

import { CreateVariantDto } from './create-product.dto';

/** Variante in sync: `id` presente = update, assente = create. */
export class UpdateVariantDto extends CreateVariantDto {
  @IsOptional()
  @IsUUID()
  id?: string;
}
