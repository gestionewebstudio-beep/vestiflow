import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TenantFeatureSettingsDto {
  lotsEnabled!: boolean;
  serialsEnabled!: boolean;
  variantsEnabled!: boolean;
  barcodeScannerEnabled!: boolean;
  supplierOrdersEnabled!: boolean;
  goodsReceiptEnabled!: boolean;
  warehouseValuationEnabled!: boolean;
  allowNegativeInventory!: boolean;
  warnNegativeInventory!: boolean;
  blockNegativeInventory!: boolean;
  manualUnloadEnabled!: boolean;
  defaultVatCodeId!: string | null;
  /** Convenzione aziendale sui prezzi di vendita: `true` = ivati. */
  salesPricesIncludeVat!: boolean;
  // ── Listini aggiuntivi (§B): tre posizioni fisse, rinominabili e attivabili.
  // Il nome null significa "usa l'etichetta di default" (Listino 1/2/3): così
  // un tenant che non li ha mai configurati vede comunque nomi sensati.
  listino1Name!: string | null;
  listino1Active!: boolean;
  listino2Name!: string | null;
  listino2Active!: boolean;
  listino3Name!: string | null;
  listino3Active!: boolean;
}

export class UpdateTenantFeatureSettingsDto {
  @IsOptional()
  @IsBoolean()
  lotsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  serialsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  variantsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  barcodeScannerEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  supplierOrdersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  goodsReceiptEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  warehouseValuationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  allowNegativeInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  warnNegativeInventory?: boolean;

  @IsOptional()
  @IsBoolean()
  blockNegativeInventory?: boolean;

  /**
   * ⚠️ Senza questa dichiarazione il `ValidationPipe` globale
   * (`forbidNonWhitelisted: true`) RIFIUTA il PATCH invece di ignorare il
   * campo: il difetto si presenta come un salvataggio che fallisce, non come
   * un interruttore che non si muove.
   */
  @IsOptional()
  @IsBoolean()
  manualUnloadEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(16)

  @IsOptional()
  @IsUUID()
  defaultVatCodeId?: string;

  /**
   * Convenzione aziendale sui prezzi di vendita: `true` = ivati.
   *
   * ⚠️ Cambiarla AZZERA le memorie netto/ivato degli operatori sui tipi di
   * vendita: senza, il titolare imposterebbe «netto» e ognuno continuerebbe
   * a creare ivato per una memoria precedente — l'impostazione sembrerebbe
   * rotta. Vedi `TenantFeatureSettingsService.update`.
   */
  @IsOptional()
  @IsBoolean()
  salesPricesIncludeVat?: boolean;

  // ── Listini aggiuntivi (§B) ───────────────────────────────────────────────
  // Tre posizioni fisse, rinominabili. Il nome `null` non è un nome vuoto: è
  // «usa l'etichetta di default» (Listino 1/2/3), e serve a distinguerlo dal
  // campo assente, che invece significa «non toccare».
  @IsOptional()
  @IsString()
  @MaxLength(40)
  listino1Name?: string | null;

  @IsOptional()
  @IsBoolean()
  listino1Active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  listino2Name?: string | null;

  @IsOptional()
  @IsBoolean()
  listino2Active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  listino3Name?: string | null;

  @IsOptional()
  @IsBoolean()
  listino3Active?: boolean;
}
