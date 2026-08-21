import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Riga Reso al banco (fase 3 §9). */
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
   * Sconto di riga, **come sulla Vendita**.
   *
   * ⛔ Qui non c'era, e il servizio forzava `discountPercent: 0` in due punti.
   * `11` A11 dice invece che il Reso ha lo sconto **identico alla Vendita**: chi
   * ha venduto un capo scontato del 20% e lo riprende deve poter rendere quello
   * che ha incassato, non il prezzo pieno.
   *
   * Stesso contratto della Vendita, alla lettera: facoltativo, intero, 0-100.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  /**
   * Descrizione della riga, quando l'operatore la cambia.
   *
   * ⚠️ **Assente = non modificata**, e il servizio conserva quella persistita
   * (o la fotografa dall'articolo se la riga è nuova). È lo stesso contratto
   * binario del Codice IVA, e per la stessa ragione: la descrizione è la
   * **fotografia** dell'operazione, e rileggerla dall'anagrafica a ogni
   * salvataggio riscriverebbe un documento di marzo con il nome di oggi.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Prezzo unitario reso, in unità minori. Netto, e con la coda decimale
   * ammessa (§sei decimali).
   *
   * ⛔ Non viene MAI da una vendita precedente (`11` A11): quel riferimento non
   * esiste nel contratto. Alla selezione dell'articolo la fonte è l'anagrafica,
   * secondo il contratto prezzi comune; poi resta modificabile.
   *
   * ⛔ **OBBLIGATORIO, come sulla Vendita** (T4). Era facoltativo e il servizio
   * faceva `?? 0`: un prezzo mancante diventava **zero in silenzio**, e un reso
   * senza importo si registrava come se la merce fosse stata regalata.
   *
   * ⚠️ **Zero esplicito resta validissimo** — `@Min(0)`, non `@Min(1)`: c'è chi
   * rende un omaggio. È «assente» a non essere più rappresentabile, e con essa
   * l'ambiguità fra «non lo so» e «vale zero»: senza il campo la richiesta viene
   * **rifiutata**, rumorosamente, invece di produrre un documento sbagliato.
   *
   * ⛔ **Nessun ripiego sul prezzo corrente dell'articolo**, né qui né sul
   * server: sarebbe la rifotografia dall'anagrafica che `regole-gestionale`
   * vieta. Il prezzo appartiene al gruppo dei campi che **il client manda
   * sempre** — quello che manda è già il valore del DOCUMENTO, letto
   * all'apertura — quindi non serve nemmeno il contratto binario dello
   * snapshot: per un campo di quel gruppo sarebbe inutile.
   */
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0)
  unitPriceMinor!: number;

  /**
   * Codice IVA della riga. Se assente, risolto da articolo/predefinito
   * aziendale — **identico alla Vendita** (`StoreSaleLineInputDto.vatCodeId`).
   *
   * ⚠️ **Contratto binario, e su una riga ESISTENTE l'assenza ha un secondo
   * significato**: «non modificata», e il servizio conserva `vatCodeId` e
   * `vatSnapshot` persistiti invece di rifotografarli. Se domani cambia
   * l'aliquota di un Codice IVA, risalvare un reso di marzo non lo ri-prezza.
   *
   * ⛔ Qui il campo non c'era affatto, e il servizio passava `undefined`
   * cablato: lo snapshot si conservava — per caso, non per contratto — ma
   * l'operatore non poteva **mai** cambiare l'IVA di una riga di reso.
   *
   * ⚠️ La vecchia maschera pos non ha una colonna IVA e non manda questo campo:
   * il contratto è completo per la maschera nuova, non per quella (T3).
   */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;
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

  /**
   * Identità dell'**intento di creazione** (T15B), identica alla Vendita —
   * vedi `CreateStoreSaleDto.creationIntentId`. **Obbligatoria in creazione**,
   * non richiesta in modifica.
   */
  @ValidateIf((o: CreateStoreReturnDto) => !o.id)
  @IsString()
  @Length(8, 128)
  creationIntentId?: string;

  @IsUUID()
  locationId!: string;

  /**
   * Cliente, **facoltativo come sulla Vendita**.
   *
   * ⛔ Qui non c'era, e la sua assenza non era una decisione: `11` A13 mette
   * «Cliente (facoltativo)» nella testata **senza distinguere Vendita e Reso**.
   * Era un gap tecnico del contratto, e leggerlo come «il Reso non ha cliente»
   * avrebbe promosso un buco a regola.
   *
   * ⚠️ Non riapre il documento origine (`11` A11): il Reso resta autonomo — chi
   * rende la merce può essere noto, la vendita di partenza no.
   */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /**
   * Serie del contatore, **identica alla Vendita e a ogni altro documento**
   * (T8A): assente = «decidi tu»; stringa vuota = «Senza serie», che è una
   * scelta e scavalca il predefinito; valore = quella serie.
   *
   * ⚠️ Il Reso ha un contatore PROPRIO (`store_return` non condivide il
   * numeratore con nessuno), ma le regole di scelta della serie sono le stesse.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  /**
   * Numero imposto dalla testata: assente = primo libero della serie. Stessa
   * semantica della Vendita — vedi `CreateStoreSaleDto.number`.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  /** Causale del reso (obbligatoria: nessun carico silenzioso). */
  /**
   * ⚠️ Il campo è rimasto per compatibilità di chiamata ma **non è più
   * obbligatorio** (`11` A11: la causale del Reso è facoltativa). La sua casa
   * è ora `causalText` sul documento — vedi `causale` qui sotto.
   *
   * @deprecated usa `causale`.
   */
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;

  /**
   * La causale del reso, **facoltativa**.
   *
   * ⛔ Vive in `documents.causalText`, che è la colonna generica del documento
   * per «perché questo documento esiste» — la stessa che l'Arrivo merce usa per
   * «DDT 145 del 08/05/2026», con `causalGenerationMode` a dire se è generata o
   * digitata.
   *
   * ⚠️ Prima finiva in `internalComment` col prefisso `Causale reso: `, e
   * rileggerla voleva dire **analizzare una stringa**. Un prefisso testuale non
   * è un contratto: il primo che scrive «Causale reso: causale reso» lo rompe,
   * e nessuno se ne accorge.
   *
   * ⛔ Il REGISTRO dei modelli (`GoodsReceiptCausal`) resta fuori: è legato ai
   * tipi documento del FORNITORE, e adottarlo qui sarebbe forzarlo.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  causale?: string;

  /**
   * La data economica del reso, scelta da chi registra.
   *
   * ⚠️ **Stesso contratto della Vendita al banco**, e non un campo con regole
   * proprie: facoltativo, ISO 8601, letto **solo alla creazione**. In modifica
   * il servizio tiene quella persistita — il Registro Corrispettivi filtra e
   * raggruppa su di essa, e correggere un reso di marzo ad agosto cambierebbe
   * due periodi invece di correggerne uno.
   *
   * Senza questo campo un Reso nasceva sempre con la data di oggi, e un rientro
   * di ieri registrato stamattina finiva nel giorno sbagliato.
   */
  @IsOptional()
  @IsISO8601()
  documentDate?: string;

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
