import {
  IsIn,
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
