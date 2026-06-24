import { IsEnum, IsString, IsUUID, MaxLength } from 'class-validator';

/** Azione al banco: vendita (scarico) o storno/reso (carico). */
export enum RetailScanAction {
  Sale = 'sale',
  Return = 'return',
}

export class RegisterRetailScanDto {
  /** SKU o barcode letto da pistola/tastiera. */
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsUUID()
  locationId!: string;

  @IsEnum(RetailScanAction)
  action!: RetailScanAction;
}
