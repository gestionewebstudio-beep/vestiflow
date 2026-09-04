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

import type { PaymentOptionKind } from '@prisma/client';

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
}
