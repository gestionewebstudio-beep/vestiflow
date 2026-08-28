import { DocumentType } from '@core/models/document.model';
import type { DocumentType as DocumentTypeValue } from '@core/models/document.model';
import type { Money } from '@core/models/money.model';

/** Direzione economica di un tipo documento in un riepilogo. */
export type DocumentEconomicSign = 1 | -1;

/**
 * ⛔ **I tipi che convivono in un registro ECONOMICAMENTE MISTO** — cioè in un
 * elenco dove documenti di verso opposto si sommano fra loro (`15c` §3, §4.1).
 *
 * Sono due registri e cinque tipi:
 *
 * ```text
 * Fatture          invoice · invoice_accompanying · credit_note
 * Vendite al banco store_sale · store_return
 * ```
 *
 * ⚠️ **L'unione è chiusa apposta.** Aggiungere qui un sesto tipo obbliga a
 * dichiararne la direzione nella mappa sotto, o **non compila**.
 */
export type MixedRegisterDocumentType =
  | typeof DocumentType.Invoice
  | typeof DocumentType.InvoiceAccompanying
  | typeof DocumentType.CreditNote
  | typeof DocumentType.StoreSale
  | typeof DocumentType.StoreReturn;

/**
 * ⛔ **La direzione economica dei tipi misti. Unica autorità** (`15c` §3 e §5).
 *
 * I valori del documento restano persistiti **positivi**: una Nota di credito da
 * 30 € vale 30, non −30. È il TIPO a dare il verso, e lo dichiara già l'enum del
 * database — _«Quantità e importi restano POSITIVI: il verso economico negativo
 * lo dà il tipo, mai il segno nella quantità»_.
 *
 * ⚠️ **Il difetto che questa mappa chiude, misurato il 28/08/2026.** Chi
 * aggregava i due registri misti sommava importi grezzi: una Fattura da 100 e
 * una Nota di credito da 30 davano **130** nel totale della selezione, nel CSV e
 * nella stampa.
 *
 * ⛔ **La mappa copre i CINQUE tipi misti, non tutti e diciotto.** Qui c'era un
 * `Record` esaustivo su `DocumentType`, e assegnava `+1` a Trasferimento,
 * Rettifica, Inventario, Ordine fornitore: una **direzione economica dedotta**
 * per tipi che in un registro misto non ci sono mai stati. Dichiarare per
 * deduzione è la stessa generalizzazione che questo progetto ha già disfatto
 * sugli stati documentali.
 */
export const MIXED_REGISTER_ECONOMIC_SIGN: Readonly<
  Record<MixedRegisterDocumentType, DocumentEconomicSign>
> = {
  [DocumentType.Invoice]: 1,
  [DocumentType.InvoiceAccompanying]: 1,
  [DocumentType.CreditNote]: -1,
  [DocumentType.StoreSale]: 1,
  [DocumentType.StoreReturn]: -1,
};

/** Se il tipo ha una direzione economica DICHIARATA (registro misto). */
export function hasDeclaredEconomicSign(
  type: DocumentTypeValue,
): type is MixedRegisterDocumentType {
  return type in MIXED_REGISTER_ECONOMIC_SIGN;
}

/**
 * La direzione economica di un tipo MISTO: `+1` aggiunge, `-1` sottrae.
 *
 * ⛔ **Il parametro è ristretto ai soli tipi dichiarati**, e non è pignoleria:
 * qui c’era `(type: DocumentTypeValue)` con un `: 1` di ripiego per tutti gli
 * altri. Quel `1` era una **direzione economica attribuita per fallback** a
 * Trasferimento, Rettifica, Inventario, Ordine fornitore — proprio ciò che
 * `15c` §3 e §12.1 vietano. Ora chiamarla su un tipo non dichiarato **non
 * compila**: il chiamante deve passare da `hasDeclaredEconomicSign`.
 *
 * ⚠️ **Non legge righe, prezzi, IVA o sconti, e non arrotonda** (`15c` §5): non
 * è un motore economico, è una tabella. Il valore da moltiplicare è quello già
 * persistito e già arrotondato dal documento.
 */
export function documentEconomicSign(type: MixedRegisterDocumentType): DocumentEconomicSign {
  return MIXED_REGISTER_ECONOMIC_SIGN[type];
}

/**
 * Il **contributo firmato** di uno snapshot monetario a un’aggregazione
 * (`15c` §2.3).
 *
 * ⭐ **Per un tipo fuori dal perimetro misto lo snapshot torna INVARIATO**, e
 * non moltiplicato per uno: la differenza non è nel numero, è in ciò che si
 * dichiara. In un elenco a verso unico non esiste una direzione da applicare,
 * e attribuirne una — foss’anche `+1` — sarebbe una decisione economica che
 * nessuno ha preso.
 *
 * ⚠️ **Si applica a OGNI grandezza separatamente** — imponibile, IVA, totale —
 * e mai ricomponendo `totale = imponibile + IVA` (`15c` §6.3): quei valori sono
 * già salvati, e sommarli qui rifarebbe un calcolo che il documento ha già
 * chiuso.
 */
export function signedDocumentMoney(type: DocumentTypeValue, money: Money): Money {
  if (!hasDeclaredEconomicSign(type)) {
    return money;
  }
  return { ...money, amountMinor: documentEconomicSign(type) * money.amountMinor };
}
