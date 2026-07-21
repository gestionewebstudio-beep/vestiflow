import { DocumentType } from '@core/models/document.model';
import type { DocumentAddress } from '@core/models/document.model';

/**
 * Documenti che viaggiano con la merce: DDT vendita e Fattura
 * accompagnatoria. Per questi il trasporto (causale, porto, incaricato,
 * colli, aspetto beni) e gli indirizzi sono dati operativi che accompagnano
 * fisicamente la spedizione, quindi vanno segnalati se mancanti sia al
 * salvataggio sia alla stampa.
 */
export const GOODS_TRAVEL_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.SalesDdt,
  DocumentType.InvoiceAccompanying,
] as const;

export function documentTravelsWithGoods(type: DocumentType): boolean {
  return (GOODS_TRAVEL_DOCUMENT_TYPES as readonly string[]).includes(type);
}

/**
 * Dati minimi verificati: shape comune al documento salvato (DocumentRecord)
 * e ai valori del form, così la stessa regola vale in entrambi i flussi.
 * `transportPackagesCount` accetta anche la stringa del campo form.
 */
export interface TransportCompletenessInput {
  readonly transportCausal?: string | null;
  readonly transportPort?: string | null;
  readonly transportCarrier?: string | null;
  readonly transportPackagesCount?: number | string | null;
  readonly transportGoodsAspect?: string | null;
  /** Intestatario: solo il DDT vendita lo porta come blocco separato. */
  readonly recipientAddress?: DocumentAddress | null;
  readonly destinationAddress?: DocumentAddress | null;
}

/** Titolo e testo dell'avviso, identici in salvataggio e stampa. */
export const TRANSPORT_INCOMPLETE_TITLE = 'Dati incompleti';
export const TRANSPORT_INCOMPLETE_MESSAGE =
  'Dati trasporto/indirizzi incompleti. Procedere lo stesso?';

/** Indirizzo utilizzabile per la consegna: servono nome, via e città. */
function addressIncomplete(address: DocumentAddress | null | undefined): boolean {
  return !address?.name?.trim() || !address.address?.trim() || !address.city?.trim();
}

function packagesMissing(value: number | string | null | undefined): boolean {
  if (value == null) {
    return true;
  }
  return typeof value === 'string' ? !value.trim() : false;
}

/**
 * Dati di trasporto/indirizzi incompleti per un documento che viaggia con la
 * merce. Ora/peso/codici spedizione restano facoltativi: non generano avvisi.
 *
 * L'intestatario è richiesto solo sul DDT vendita; sulla Fattura
 * accompagnatoria l'intestatario è il cliente della fattura stessa, quindi si
 * verifica la sola destinazione. Sul DDT, se la destinazione non è stata
 * differenziata, vale quella dell'intestatario.
 */
export function transportDataIncomplete(
  type: DocumentType,
  data: TransportCompletenessInput,
): boolean {
  if (!documentTravelsWithGoods(type)) {
    return false;
  }
  const transportIncomplete =
    !data.transportCausal?.trim() ||
    !data.transportPort?.trim() ||
    !data.transportCarrier?.trim() ||
    packagesMissing(data.transportPackagesCount) ||
    !data.transportGoodsAspect?.trim();
  const recipientIncomplete =
    type === DocumentType.SalesDdt && addressIncomplete(data.recipientAddress);
  const destinationIncomplete = addressIncomplete(data.destinationAddress ?? data.recipientAddress);
  return transportIncomplete || recipientIncomplete || destinationIncomplete;
}
