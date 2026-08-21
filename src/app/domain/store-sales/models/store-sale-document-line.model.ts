import type { EntityId } from '@core/models/common.model';
import type { DocumentLine } from '@core/models/document.model';
import { vatCodeIdForLinePayload } from '@domain/documents/utils/document-line-vat-payload.util';

import type { StoreReturnLineInput, StoreSaleLineInput } from './store-sale.model';

/**
 * La riga documento del banco. **Una sola**, per Vendita e per Reso.
 *
 * ⭐ Non è una semplificazione: `DocumentLine` è già la stessa tabella per i due
 * tipi, e nessun campo esiste per l'uno e non per l'altro. Quello che il Reso
 * chiama `restockable` atterra su `loadsStock`, che è un campo comune di ogni
 * riga documento — la Vendita lo tiene a `true` e non lo espone
 * (`MAPPA-RIUSO` §7.2).
 *
 * ⛔ **Sostituisce le due forme parallele** della maschera legacy
 * (`DocumentLineDraft` e `ReturnLine`), che restano dove sono finché quella
 * maschera esiste.
 */
export interface StoreSaleDocumentLine {
  /**
   * Identità della riga **dentro la maschera**: serve a `track`, al fuoco e ai
   * comandi di riga. Non esce mai nel payload.
   */
  readonly uiId: string;
  /**
   * Id persistito di `DocumentLine`. `null` = riga non ancora salvata.
   *
   * ⛔ **È l'unico id che viaggia al server** (T1/T2): il movimento è collegato
   * alla riga via `sourceLineId`, e senza identità stabile ogni salvataggio ne
   * accoderebbe uno nuovo invece di aggiornare quello che c'è
   * (`regole-gestionale`, «un movimento per riga, aggiornato in posto»).
   */
  readonly serverLineId: EntityId | null;
  readonly variantId: EntityId;
  readonly sku: string;
  readonly description: string;
  /**
   * La descrizione **com'era all'apertura del documento**: è il termine di
   * paragone che dice al payload se l'operatore l'ha cambiata. `null` su una
   * riga nuova, dove non c'è niente da conservare.
   *
   * ⛔ Stesso contratto binario del Codice IVA, e per la stessa ragione: la
   * descrizione è la **fotografia** dell'operazione, e rimandarla sempre
   * significherebbe riscriverla a ogni salvataggio (`regole-gestionale`, «la
   * riga di un documento è una fotografia»).
   */
  readonly persistedDescription: string | null;
  readonly quantity: number;
  /**
   * Prezzo unitario **NETTO**, in unità minori: è il dato, ed è quello che
   * viaggia verso il server.
   *
   * ⚠️ Porta la coda decimale fino a 4 cifre di centesimo — quante ne tiene la
   * colonna — e su una riga esistente si rimanda **tale e quale**: è il valore
   * del documento, non il prezzo corrente dell'articolo.
   */
  readonly unitPriceMinor: number;
  readonly discountPercent: number;
  /** Codice IVA della riga: risolto dall'articolo, sempre sovrascrivibile. */
  readonly vatCodeId: EntityId | null;
  /**
   * Il Codice IVA **com'era quando il documento è stato aperto** (T3).
   *
   * ⛔ **Si scrive una volta sola, al caricamento, e non si tocca più** per
   * tutta la sessione: se si riallineasse a ogni modifica locale, due cambi di
   * fila si annullerebbero e il secondo non partirebbe.
   */
  readonly persistedVatCodeId: EntityId | null;
  /** Aliquota dello snapshot persistito: dato di sola lettura, per il display. */
  readonly vatRatePercent: number | null;
  /**
   * «Carica giacenze» della riga. Sul **Reso** è la spunta che decide il
   * movimento (`11` A11-ter); sulla **Vendita** vale sempre `true` e non si
   * mostra — è la stessa colonna comune, non due campi diversi.
   */
  readonly loadsStock: boolean;
  /** Disponibilità alla sede: dato **vivo**, non documentale. Zero se non letto. */
  readonly onHand: number;
  readonly committed: number;
  readonly available: number;
}

/**
 * Identità di una riga NUOVA, generata dal client.
 *
 * ⚠️ Il prefisso la distingue a colpo d'occhio da un id del server, che è un
 * UUID: se finisse nel payload il server la rifiuterebbe, ed è meglio leggerlo
 * che indovinarlo. Il payload comunque non la legge — vede `serverLineId`.
 */
let contatoreRighe = 0;
export function newStoreSaleLineUiId(): string {
  contatoreRighe += 1;
  return `nuova-${contatoreRighe}`;
}

/**
 * La riga di un documento salvato diventa riga di maschera.
 *
 * ⛔ I valori si prendono dal **documento**, non dall'anagrafica: prezzo,
 * descrizione, sconto e IVA sono la fotografia dell'operazione. Solo la
 * disponibilità è un dato vivo, e resta a zero finché qualcuno non la rilegge —
 * al banco non serve a decidere, serve ad avvisare.
 */
export function storeSaleLineFromDocumentLine(line: DocumentLine): StoreSaleDocumentLine {
  return {
    // uiId e serverLineId partono dallo stesso valore ma NON sono la stessa
    // cosa: il primo resta dentro la maschera, il secondo è ciò che fa
    // aggiornare la riga sul server invece di duplicarla.
    uiId: line.id,
    serverLineId: line.id,
    variantId: line.variantId ?? '',
    sku: line.sku ?? '',
    description: line.description,
    persistedDescription: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPrice.amountMinor,
    discountPercent: line.discountPercent,
    vatCodeId: line.vatCodeId ?? null,
    persistedVatCodeId: line.vatCodeId ?? null,
    vatRatePercent: line.vatSnapshot?.ratePercent ?? null,
    loadsStock: line.loadsStock,
    onHand: 0,
    committed: 0,
    available: 0,
  };
}

/**
 * La descrizione da mandare, o `undefined` se non è stata modificata.
 *
 * Gemella di `vatCodeIdForLinePayload`, e con lo stesso contratto: su una riga
 * esistente l'**assenza della chiave è il messaggio** «non toccata», e il
 * server conserva quella persistita.
 */
function descriptionForLinePayload(line: StoreSaleDocumentLine): string | undefined {
  if (line.serverLineId === null) {
    // Riga nuova: niente da conservare. Il server la fotografa dall'articolo se
    // non gliela si dà, quindi si manda solo se c'è davvero un testo.
    return line.description.trim() || undefined;
  }
  return line.description === line.persistedDescription ? undefined : line.description;
}

/** Codice IVA da mandare, o `undefined` se non è stato modificato (T3). */
function vatForLinePayload(line: StoreSaleDocumentLine): string | undefined {
  return vatCodeIdForLinePayload({
    currentVatCodeId: line.vatCodeId,
    persistedVatCodeId: line.persistedVatCodeId,
    // Riga esistente = riga che ha un id sul server. È lo stesso campo che
    // porta l'identità nel payload, quindi le due nozioni non possono divergere.
    isExistingLine: line.serverLineId !== null,
  });
}

/** La riga come la vuole `POST /store-sales`. */
export function storeSaleLinePayload(line: StoreSaleDocumentLine): StoreSaleLineInput {
  return {
    id: line.serverLineId ?? undefined,
    variantId: line.variantId,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    discountPercent: line.discountPercent || undefined,
    description: descriptionForLinePayload(line),
    vatCodeId: vatForLinePayload(line),
  };
}

/**
 * La riga come la vuole `POST /store-sales/returns`.
 *
 * ⛔ **Qui, e solo qui, «Carica giacenze» prende il nome del confine.** Il
 * concetto del dominio è uno solo — `loadsStock`, la spunta di riga comune a
 * ogni documento (`11` A11-ter) —: `restockable` è come si chiama nel DTO, e
 * non deve risalire dentro il modello. Un secondo nome per la stessa cosa è il
 * modo in cui un concetto si sdoppia senza che nessuno se ne accorga.
 */
export function storeReturnLinePayload(line: StoreSaleDocumentLine): StoreReturnLineInput {
  return {
    id: line.serverLineId ?? undefined,
    variantId: line.variantId,
    quantity: line.quantity,
    // ← nome del confine, concetto `loadsStock`
    restockable: line.loadsStock,
    // ⛔ Nessun `?? 0`: un prezzo mancante non deve mai diventare zero (T4). Il
    // valore è già quello del documento, coda decimale compresa.
    unitPriceMinor: line.unitPriceMinor,
    discountPercent: line.discountPercent || undefined,
    description: descriptionForLinePayload(line),
    vatCodeId: vatForLinePayload(line),
  };
}
