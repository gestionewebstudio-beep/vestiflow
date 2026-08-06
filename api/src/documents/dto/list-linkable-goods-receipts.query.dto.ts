import { IsOptional, IsUUID } from 'class-validator';

export class ListLinkableGoodsReceiptsQueryDto {
  @IsUUID()
  supplierId!: string;

  /** In modifica fattura: i suoi arrivi già collegati restano includibili. */
  @IsOptional()
  @IsUUID()
  excludeInvoiceId?: string;
}
