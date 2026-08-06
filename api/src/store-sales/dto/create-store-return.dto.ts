import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Riga Reso vendita negozio (fase 3 §9). */
export class StoreReturnLineInputDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /**
   * Merce vendibile: rientra realmente tra le quantità disponibili
   * (movimento positivo). Merce non vendibile: nessun carico.
   */
  @IsBoolean()
  restockable!: boolean;

  /**
   * Prezzo unitario rimborsato in unità minori, opzionale per registro. È il
   * netto della vendita originale, quindi può portarne la coda decimale
   * (§sei decimali): il reso rende esattamente quello che la vendita ha preso.
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  unitPriceMinor?: number;
}

export class CreateStoreReturnDto {
  @IsUUID()
  locationId!: string;

  /** Vendita in negozio origine, quando individuabile (§9). */
  @IsOptional()
  @IsUUID()
  saleDocumentId?: string;

  /** Causale del reso (obbligatoria: nessun carico silenzioso). */
  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StoreReturnLineInputDto)
  lines!: StoreReturnLineInputDto[];
}
