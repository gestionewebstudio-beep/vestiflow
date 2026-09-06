import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import type { PaymentOptionKind, PaymentTenderKind } from '@prisma/client';

export class CreatePaymentOptionDto {
  @IsIn(['method', 'terms'])
  kind!: PaymentOptionKind;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class UpdatePaymentOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  /**
   * Modalità normativa FatturaPA da associare al Tipo pagamento, o `null` per
   * scollegarlo (`docs/25` §7).
   *
   * ⚠️ `null` e "campo assente" sono DUE cose diverse, ed è la ragione di
   * `@ValidateIf`: assente significa «non toccare», `null` significa
   * «scollega». Con un `@IsOptional()` nudo il `null` verrebbe scartato dalla
   * validazione e l'operatore non potrebbe più togliere una modalità.
   *
   * ⛔ Ammesso solo su `kind = 'method'`: il servizio rifiuta le condizioni.
   */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsUUID()
  methodCodeId?: string | null;

  /**
   * Come il Tipo si incassa al banco, o `null` per «non utilizzabile nella
   * Cassa» (`docs/25` §7).
   *
   * ⚠️ Stessa disciplina di `methodCodeId`: assente significa «non toccare»,
   * `null` significa «togli la classificazione». Con un `@IsOptional()` nudo
   * il `null` verrebbe scartato dalla validazione e non si potrebbe più
   * riportare un Tipo a «non utilizzabile».
   *
   * ⛔ Ammesso solo su `kind = 'method'`: il servizio rifiuta le condizioni.
   */
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsIn(['cash', 'electronic', 'voucher'])
  tenderKind?: PaymentTenderKind | null;
}
