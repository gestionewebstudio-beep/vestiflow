import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InventoryTrackingMode, ProductKind, ProductStatus } from '@prisma/client';

import { MoneyDto } from './money.dto';
import { ProductOptionDto } from './create-product.dto';
import { ShopifyCategoryMetafieldDto } from './shopify-category-metafield.dto';
import { UpdateVariantDto } from './update-variant.dto';

/** Aggiornamento prodotto: dati generali + sync opzionale del set varianti. */
export class UpdateProductDto {
  /**
   * Codice articolo interno (§Codice articolo): modificabile in qualsiasi
   * momento ma MAI vuoto (undefined = non toccare; stringa vuota = 422
   * "Il codice articolo è obbligatorio." dal service, che valida anche
   * formato e unicita' con messaggi chiari).
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  articleCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  // ── Prezzi/costo a livello articolo (undefined = non toccare) ──
  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  sellingPrice?: MoneyDto;

  /**
   * Prezzo Shopify dell'articolo (§B, valore proprio). Con Shopify attivo il
   * form lo invia e il service lo persiste così com'è. Con Shopify spento il
   * campo non esiste in UI: il valore inviato viene ignorato e il prezzo Shopify
   * segue il prezzo articolo solo quando questo cambia (regola nel service).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  shopifyPrice?: MoneyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  compareAtPrice?: MoneyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  purchasePrice?: MoneyDto;

  // ── Listini aggiuntivi (§B): sempre netti (forma canonica). Gating per campo:
  // assente = non toccare, `null` esplicito = azzera (campo svuotato in UI).
  // La modalità netto/ivato con cui l'operatore li compila non è un dato
  // dell'articolo e non viaggia qui: è la sua preferenza personale, ricordata
  // alla creazione (vedi CreateProductDto.listinoPricesIncludeVat).
  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  listino1Price?: MoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  listino2Price?: MoneyDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoneyDto)
  listino3Price?: MoneyDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /** Sottocategoria VestiFlow collegata alla categoria (testo, come category). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  /** Note interne gestionale: mai sincronizzate con i canali. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  shopifyTaxonomyCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shopifyTaxonomyCategoryFullName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShopifyCategoryMetafieldDto)
  shopifyCategoryMetafields?: ShopifyCategoryMetafieldDto[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tiktokCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  season?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  /**
   * Sincronizzazione con Shopify per questo prodotto. false→true: al salvataggio
   * scatta un push iniziale di allineamento. true→false: nessun cleanup, il
   * prodotto già presente su Shopify resta ma non riceve più aggiornamenti.
   */
  @IsOptional()
  @IsBoolean()
  shopifySyncEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unitOfMeasure?: string;

  /** Codice IVA ordinario dell'articolo (§8). Null = predefinito aziendale. */
  @IsOptional()
  @IsUUID()
  defaultVatCodeId?: string | null;

  @IsOptional()
  @IsEnum(InventoryTrackingMode)
  inventoryTracking?: InventoryTrackingMode;

  @IsOptional()
  @IsBoolean()
  managesStock?: boolean;

  /**
   * Tipo prodotto Articolo/Servizio: proprietà interna VestiFlow, mai
   * mappata su Shopify; le sync non lo toccano e il valore persiste.
   */
  @IsOptional()
  @IsEnum(ProductKind)
  kind?: ProductKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ProductOptionDto)
  options?: ProductOptionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantDto)
  variants?: UpdateVariantDto[];
}
