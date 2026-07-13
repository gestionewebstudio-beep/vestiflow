import { IsString, IsUUID, Length } from 'class-validator';

export class LookupStoreSaleItemQueryDto {
  /** Barcode, SKU o testo di ricerca prodotto. */
  @IsString()
  @Length(1, 100)
  code!: string;

  @IsUUID()
  locationId!: string;
}
