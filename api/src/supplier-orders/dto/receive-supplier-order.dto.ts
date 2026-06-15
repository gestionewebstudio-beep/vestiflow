import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class ReceiveSupplierOrderLineDto {
  @IsUUID()
  lineId!: string;

  /** Quantità ricevuta in questa operazione (non il totale cumulato). */
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ReceiveSupplierOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveSupplierOrderLineDto)
  lines!: ReceiveSupplierOrderLineDto[];
}
