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
  /**
   * Id della riga quando si RISALVA un reso esistente. Assente = riga nuova.
   * E' l'identita' su cui si regge la riconciliazione per differenza: senza,
   * ogni salvataggio accoderebbe un movimento invece di aggiornare quello che
   * c'e' (`regole-gestionale`, «un movimento per riga, aggiornato in posto»).
   */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /**
   * Spunta «Carica giacenze» della riga: attiva → la conclusione genera il
   * movimento positivo; disattiva → nessun movimento per quella riga.
   *
   * ⛔ Non e' una classificazione «vendibile / non vendibile» (`11` A11-ter):
   * quella nel Reso non esiste, e merce danneggiata o da scartare appartiene a
   * un altro processo. E' la normale logica documentale di riga.
   */
  @IsBoolean()
  restockable!: boolean;

  /**
   * Prezzo unitario reso, in unità minori. Netto, e con la coda decimale
   * ammessa (§sei decimali).
   *
   * ⛔ Non viene MAI da una vendita precedente (`11` A11): quel riferimento non
   * esiste nel contratto. Alla selezione dell'articolo la fonte è l'anagrafica,
   * secondo il contratto prezzi comune; poi resta modificabile.
   */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  unitPriceMinor?: number;
}

/**
 * ⛔ Il Reso al banco NON ha documento origine (`11` A11), e non e' una scelta
 * di comodo: la vendita reale puo' essere stata battuta su una cassa esterna e
 * non essere mai esistita in VestiFlow. Un contratto che la presuppone non
 * regge, quindi non esiste ne' un collegamento obbligatorio ne' uno facoltativo.
 */
export class CreateStoreReturnDto {
  /** Id del reso da RISALVARE. Assente = reso nuovo. */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  locationId!: string;

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
