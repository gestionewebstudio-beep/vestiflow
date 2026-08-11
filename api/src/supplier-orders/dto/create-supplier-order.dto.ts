import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseCostEntryMode } from '@prisma/client';

export class CreateSupplierOrderLineDto {
  @IsUUID()
  variantId!: string;

  /** Snapshot descrizione articolo; se assente il server usa il nome prodotto. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(1)
  orderedQuantity!: number;

  /**
   * Costo unitario digitato in unità minori, interpretato netto o ivato secondo
   * costEntryMode di testata. NON è necessariamente intero: quando nasce da uno
   * scorporo IVA porta una coda decimale — fino a 4 cifre di centesimo, quante
   * ne tiene la colonna — ed è quella a far tornare il costo ivato digitato
   * quando lo si rimostra ivato (§sei decimali).
   */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  enteredUnitCostMinor!: number;

  /**
   * Sconto riga a cascata già risolto in percentuale effettiva: «4+10%» arriva
   * qui come 13,6, non come 14. I decimali non sono un vezzo — arrotondarli
   * farebbe valere l'ordine registrato meno di quello che l'operatore ha letto.
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsUUID()
  vatCodeId?: string;

  /**
   * Unità di misura della riga, fotografata all'inserimento. Testo libero: la
   * tabella delle unità suggerisce, non obbliga (specifica §4.3-ter).
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;
}

export class CreateSupplierOrderDto {
  @IsUUID()
  supplierId!: string;

  /** Data ordine (testata); default: oggi. */
  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  /**
   * Serie del numeratore. Assente = la serie predefinita del tipo.
   *
   * Fino al 12/08/2026 il client non poteva sceglierla: il server prendeva
   * sempre la predefinita, e l'Ordine fornitore era l'unico documento di
   * Categoria A senza serie in testata (specifica numerazione §5).
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /**
   * Numero imposto dalla testata. Assente = lo assegna il server, primo libero
   * della serie. Se è già occupato risponde 409 col conflitto, come gli altri
   * documenti: chi salva sceglie fra numero nuovo e numero attuale.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string;

  /** "Rif. ordine fornitore": riferimento libero comunicato dal fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  // ── Documento della controparte: la conferma d'ordine del fornitore ──
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

  @IsOptional()
  @IsISO8601()
  externalDocDate?: string;

  @IsOptional()
  @IsUUID()
  externalDocumentTypeId?: string;

  /**
   * Sconto extra di chiusura sull'intero ordine (percentuale, fino a 4
   * decimali). Stessa forma di `documentDiscountPercent` su arrivo merce e
   * ordine cliente: il calcolo è già condiviso, qui arriva solo il numero.
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  documentDiscountPercent?: number;

  /** Switch costi netto/ivato (come Arrivo merce). Default: netti. */
  @IsOptional()
  @IsEnum(PurchaseCostEntryMode)
  costEntryMode?: PurchaseCostEntryMode;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierOrderLineDto)
  lines!: CreateSupplierOrderLineDto[];
}
