import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Registrazione fattura fornitore (prompt §5-6): documento contabile che NON
 * movimenta il magazzino. Gli arrivi merce inclusi generano una riga
 * riepilogativa ciascuno e il collegamento documentale.
 */
export class SavePurchaseInvoiceDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  supplierId!: string;

  @IsISO8601()
  documentDate!: string;

  /** Numero della fattura ricevuta dal fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

  /** Data della fattura ricevuta dal fornitore. */
  @IsOptional()
  @IsISO8601()
  externalDocDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalComment?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /** Totale fattura registrata (unità minori) inserito dall'utente. */
  @IsInt()
  @Min(0)
  totalMinor!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  subtotalMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  /** Arrivi merce inclusi ("Includi documento", §5.1). */
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMaxSize(200)
  goodsReceiptIds?: string[];
}
