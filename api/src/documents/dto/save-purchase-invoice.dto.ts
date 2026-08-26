import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
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

import { DocumentAddressDto } from './document-transport.dto';

/**
 * ⭐ **La riga economica della registrazione. Una sola specie.**
 *
 * ⛔ Si chiamava «riga manuale» e la sua intestazione diceva «voci non legate ad
 * arrivi merce», perche' le righe che nascevano da un arrivo erano un'altra
 * cosa: il server le RICALCOLAVA a ogni salvataggio da
 * `buildPurchaseInvoiceVatSummary(receipts)`, e il client le scartava alla
 * rilettura per ri-derivarle.
 *
 * ⚠️ Quel modello violava una regola del progetto: «la riga di un documento e'
 * una fotografia, e non si riscatta da sola». Una riga ricalcolata non e' una
 * fotografia — e infatti non si poteva modificare, perche' la modifica sarebbe
 * stata sovrascritta al salvataggio dopo.
 *
 * ⭐ Ora e' una lista sola e tutte si modificano. Includere un arrivo
 * MATERIALIZZA le sue righe una volta; da li' sono righe del documento.
 */
export class PurchaseInvoiceLineDto {
  /**
   * L'id della riga gia' salvata, se questa riga esiste gia'. Assente = riga
   * nuova.
   *
   * ⭐ **E' cio' che fa sopravvivere l'identita' al risalvataggio.** Senza,
   * ogni Salva cancellava tutte le righe e le riscriveva da zero: l'id cambiava
   * anche per la riga che nessuno aveva toccato.
   *
   * ⚠️ Non e' una pignoleria: e' il prerequisito del Codice IVA. Il contratto
   * «assente = non modificato» che conserva lo snapshot IVA persistito e'
   * chiavato sull'id della riga.
   *
   * ⛔ Un id che non appartiene a QUESTO documento viene ignorato e la riga si
   * crea nuova: il filtro sta lato server su `existingLineIds`, non qui.
   */
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  // ⚠️ NON `@IsInt()`: in modalità ivata il client manda il netto SCORPORATO,
  //   con la coda che il contratto del denaro PRESCRIVE. Arrotondarlo nel
  //   client farebbe ballare il valore al giro successivo (test in
  //   `purchase-invoice-form.component.spec.ts`). Arrotonda il SERVIZIO, e
  //   solo sulle due colonne intere di destinazione.
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  netMinor!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  vatRatePercent!: number;

  @IsInt()
  vatMinor!: number;

  /**
   * Il Codice IVA della riga.
   *
   * ⭐ **Contratto binario, e vale solo per le righe ESISTENTI:**
   *
   * ```text
   * riga esistente + assente   → l'IVA non e' stata modificata: si conservano
   *                              `vatCodeId` e `vatSnapshot` persistiti
   * riga esistente + presente  → assegnazione cambiata: si rigenera lo snapshot
   * riga nuova                 → risoluzione normale
   * ```
   *
   * ⚠️ Se il client rimandasse sempre il codice letto all'apertura, il server lo
   * rifotograferebbe a ogni salvataggio — e riaprire una fattura vecchia per
   * correggere una nota la ri-prezzerebbe il giorno in cui quell'aliquota
   * cambia. E' la regola «la riga di un documento e' una fotografia».
   */
  @IsOptional()
  @IsUUID()
  vatCodeId?: string;

  /**
   * L'arrivo merce da cui questa riga e' nata, se ne viene da uno.
   *
   * ⭐ La colonna `linked_goods_receipt_id` esiste su `document_lines` da
   * luglio, con chiave esterna e indice — e finora NESSUN percorso dell'API la
   * scriveva: era sempre `null`. Non serve una migration, serve usarla.
   *
   * ⚠️ E' una PROVENIENZA, non un legame vivo: la riga resta anche se l'arrivo
   * viene tolto dagli inclusi, perche' una volta nel documento e' del documento.
   */
  @IsOptional()
  @IsUUID()
  linkedGoodsReceiptId?: string;
}


/** Scadenza di pagamento: data, importo, saldato e data saldo. */
export class PurchaseInvoiceInstallmentDto {
  @IsISO8601()
  dueDate!: string;

  @IsInt()
  @Min(0)
  amountMinor!: number;

  @IsOptional()
  @IsBoolean()
  settled?: boolean;

  @IsOptional()
  @IsISO8601()
  settledAt?: string;
}

/**
 * Registrazione fattura fornitore (prompt §5-6): documento contabile che NON
 * movimenta il magazzino. Gli arrivi merce inclusi generano righe raggruppate
 * per aliquota IVA; le righe manuali coprono voci non legate ad arrivi.
 */
export class SavePurchaseInvoiceDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  supplierId!: string;

  /** Numero interno imposto dalla testata; assente = primo libero della serie. */
  @IsOptional()
  @IsInt()
  @Min(1)
  number?: number;

  /** Serie del protocollo; assente = serie predefinita del tipo. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  series?: string;

  /** Data documento: la data della fattura ricevuta dal fornitore. */
  @IsISO8601()
  documentDate!: string;

  /** Data registrazione interna (default oggi, modificabile). */
  @IsOptional()
  @IsISO8601()
  registrationDate?: string;

  /** Numero della fattura ricevuta dal fornitore. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalDocNumber?: string;

  /** Data della fattura ricevuta dal fornitore (legacy: ora coincide con documentDate). */
  @IsOptional()
  @IsISO8601()
  externalDocDate?: string;

  /**
   * Tipo del documento ricevuto dal fornitore: l'etichetta viene fotografata in
   * testata. Assente ≠ vuoto — vedi `savePurchaseInvoice`.
   */
  @IsOptional()
  @IsUUID()
  externalDocumentTypeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalComment?: string;

  /**
   * Modalità importi della registrazione: netti o ivati.
   *
   * ⭐ Il selettore vive nell'INTESTAZIONE DELLA COLONNA come su ogni altro
   * documento (deciso il 25/08/2026), e un documento NUOVO parte netto — e' un
   * documento di COSTO, e per un'azienda che detrae l'IVA il costo E' il netto.
   * L'ivato resta una comodita' del singolo documento.
   *
   * ⚠️ Su una registrazione esistente, assente significa «quella di prima»: un
   * documento e' un fatto e conserva la modalita' con cui e' stato compilato.
   */
  @IsOptional()
  @IsIn(['vat_excluded', 'vat_included'])
  purchaseCostEntryMode?: 'vat_excluded' | 'vat_included';

  /** Tipo pagamento (auto-compilato dall'anagrafica fornitore, modificabile). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentMethod?: string;

  /** Indirizzi: snapshot anagrafica fornitore, modificabile per eccezioni. */
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentAddressDto)
  recipientAddress?: DocumentAddressDto;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /**
   * Totali legacy: usati SOLO se la registrazione non ha né arrivi inclusi né
   * righe manuali (compatibilità con vecchi client). Altrimenti i totali sono
   * sempre ricalcolati dalle righe.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  totalMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  subtotalMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  // ⛔ Qui c'era `goodsReceiptIds`: l'elenco degli arrivi inclusi, tenuto a
  // parte dalle righe. Tolto il 25/08/2026 — gli arrivi collegati si leggono
  // dal `linkedGoodsReceiptId` delle righe, che e' l'unica fonte. Due campi
  // che dicono la stessa cosa prima o poi dicono il contrario.

  /**
   * ⭐ **Tutte le righe economiche della registrazione**, in una lista sola.
   *
   * ⛔ Si chiamava `manualLines` e portava le sole voci libere: le righe da
   * arrivo le ricalcolava il server. Ora arrivano tutte da qui, e il server
   * scrive quello che riceve.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceLineDto)
  @ArrayMaxSize(200)
  lines?: PurchaseInvoiceLineDto[];

  /** Scadenze di pagamento (lista sostituita integralmente a ogni salvataggio). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceInstallmentDto)
  @ArrayMaxSize(60)
  installments?: PurchaseInvoiceInstallmentDto[];
}
