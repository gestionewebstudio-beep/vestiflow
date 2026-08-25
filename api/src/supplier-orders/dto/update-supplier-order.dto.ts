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

import { CreateSupplierOrderLineDto } from './create-supplier-order.dto';

export class UpdateSupplierOrderDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** Serie del numeratore. Assente = quella che l'ordine ha gia'. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /**
   * Sede di destinazione della merce (§1-bis). `null` la toglie; assente non la
   * tocca — la testata si riscrive per intero, quindi la distinzione conta.
   */
  @IsOptional()
  @IsUUID()
  destinationLocationId?: string | null;

  /**
   * Numero in testata. Assente = quello che l'ordine ha gia'. Cambiarlo
   * ricalcola il riferimento e passa dal vincolo unico: se il numero e' preso,
   * risponde 409 col conflitto, come gli altri documenti.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  @IsOptional()
  @IsISO8601()
  orderDate?: string;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string | null;

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

  @IsOptional()
  @IsEnum(PurchaseCostEntryMode)
  costEntryMode?: PurchaseCostEntryMode;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsArray()
  // ⛔ Qui c'era `@ArrayMinSize(1)`: l'ordine fornitore rifiutava un documento
  // senza righe. Tolto il 25/08/2026, decisione del proprietario applicata a
  // TUTTI i tipi — «devo avere la possibilita' di crearlo vuoto e avro' un
  // documento vuoto con numero, eventuale serie e data».
  //
  // ⚠️ Era rimasto indietro, ed e' un buco del perimetro: il rifiuto generale
  // era stato tolto da `confirmDocumentTx`, che copre i `Document`. L'ordine
  // fornitore e' un `SupplierOrder`, con un DTO tutto suo — quindi la maschera
  // mandava un documento vuoto e il server rispondeva «I dati inviati non sono
  // validi», senza dire quale.
  //
  // ⭐ L'ha trovato il collaudo a schermo, non i test.
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateSupplierOrderLineDto)
  lines!: CreateSupplierOrderLineDto[];
  // ⚠️ Qui stavano i tre campi del «documento della controparte»
  // (`externalDocNumber`, `externalDocDate`, `externalDocumentTypeId`).
  // Tolti il 12/08/2026 insieme al blocco in testata: questo documento non ne
  // ha uno da citare. Chiudere anche l'ingresso serve — finché il DTO li
  // accetta, un client può scriverli e le colonne tornano a riempirsi di dati
  // che nessuna maschera mostra. Le colonne restano: toglierle è distruttivo su
  // database condiviso e aspetta la finestra concordata.
}
