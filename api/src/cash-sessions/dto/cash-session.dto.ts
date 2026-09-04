import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  Max,
  ValidateNested,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * ⛔ **Nessun DTO porta `tenantId`, `openedByName` o lo stato**: arrivano dal
 * contesto autenticato. Un campo che il chiamante sceglie non è un dato, è una
 * richiesta — e questi tre non sono negoziabili (`docs/25` §13).
 */

export class OpenCashSessionDto {
  @IsUUID()
  locationId!: string;

  /**
   * Fondo iniziale in unità minori.
   *
   * ⚠️ `@Min(0)`: zero è legittimo (si apre senza fondo), negativo no.
   */
  @IsInt()
  @Min(0)
  openingFloatMinor!: number;

  /**
   * Dispositivo fiscale operativo, o assente.
   *
   * ⭐ Una sessione **senza dispositivo** è valida: quella sede non fiscalizza.
   */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  fiscalDeviceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class CashSessionMovementDto {
  @IsIn(['deposit', 'withdrawal'])
  type!: 'deposit' | 'withdrawal';

  /** ⛔ Strettamente positivo: il verso lo dice `type`, non il segno. */
  @IsInt()
  @Min(1)
  amountMinor!: number;

  /**
   * ⛔ Obbligatoria: un versamento o un prelievo senza motivo non è
   * ricostruibile a distanza di mesi, e non si può correggere — si corregge con
   * un movimento opposto che cita questo.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason!: string;
}

export class ChangeCashSessionDeviceDto {
  /**
   * Il dispositivo nuovo, o `null` per toglierlo.
   *
   * ⛔ **Il PRECEDENTE non si manda**: lo determina il server dentro la
   * transazione. Un precedente inviato dal client è una versione del mondo
   * vecchia di un round-trip.
   */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  fiscalDeviceId!: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason!: string;
}

export class CashSessionLocationQueryDto {
  @IsUUID()
  locationId!: string;
}

// ── Checkout (tranche C4A) ─────────────────────────────────────────────────

export class CheckoutLineDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /**
   * Prezzo unitario NETTO in unità minori. ⚠️ Il server ricalcola comunque.
   *
   * ⭐ DECIMALE e non intero: la colonna è `Decimal(16,6)`, e la coda è ciò che
   * fa tornare identico un prezzo digitato ivato («unitari decimali, totali
   * interi», `regole-gestionale`).
   */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  unitPriceMinor!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  vatCodeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class CheckoutPaymentDto {
  @IsUUID()
  paymentOptionId!: string;

  /** ⛔ Strettamente positiva: il verso lo dice il tipo documento. */
  @IsInt()
  @Min(1)
  amountMinor!: number;

  /** Solo contanti: il denaro consegnato. Il resto è derivato, non si manda. */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsInt()
  @Min(0)
  tenderedMinor?: number | null;

  /**
   * Solo elettronico: l'operatore conferma l'esito letto sul terminale.
   *
   * ⛔ VestiFlow non parla col POS e non finge di averlo fatto.
   */
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}

export class CashCheckoutDto {
  @IsUUID()
  locationId!: string;

  @IsUUID()
  sessionId!: string;

  /**
   * L'identità dell'operazione, generata dal client una volta per compilazione.
   *
   * ⛔ Obbligatoria: senza, una vendita non è deduplicabile e un reinvio
   * creerebbe un secondo documento con i suoi movimenti.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  creationIntentId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentDto)
  payments!: CheckoutPaymentDto[];
}
