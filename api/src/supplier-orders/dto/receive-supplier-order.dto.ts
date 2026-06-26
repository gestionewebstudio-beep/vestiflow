import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

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
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReceiveSupplierOrderLineDto)
  lines!: ReceiveSupplierOrderLineDto[];
}
