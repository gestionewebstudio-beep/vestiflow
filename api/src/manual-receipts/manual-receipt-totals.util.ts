import type { Prisma } from '@prisma/client';

import { toStorableMinor } from '../common/money.util';
import { buildVatCodeSnapshot } from '../vat/vat-snapshot.util';
import type { VatCodeWithNature } from '../vat/vat-codes.service';
import {
  computeVatLineAmounts,
  entryIncludesVat,
  netFromGrossExact,
  vatInputFromVatCode,
} from '../vat/vat-line-calculation.util';

/**
 * La matematica del Corrispettivo manuale (`10` §12) — e **non è un secondo
 * motore IVA**.
 *
 * Tutto quello che serve esisteva già ed è collaudato: `computeVatLineAmounts`
 * per imponibile/imposta/totale, `netFromGrossExact` per il netto da
 * memorizzare, `toStorableMinor` per la coda che la colonna sa tenere,
 * `buildVatCodeSnapshot` per congelare il Codice IVA. Qui si compone, non si
 * calcola daccapo.
 *
 * ⚠️ **Una riga senza quantità.** Il motore condiviso ragiona per riga di
 * documento — quantità, sconto, prezzo unitario — e qui la quantità è 1 e lo
 * sconto 0 perché **non esistono**: la registrazione porta un importo e
 * un'aliquota, non un articolo (`10` §12, «Fuori perimetro: sconti»). Passare
 * `quantity: 1, discountPercent: 0` non è una semplificazione del calcolo: è la
 * traduzione fedele di una riga che quelle due dimensioni non ce l'ha.
 */

/** Una riga come arriva dalla maschera: importo NELLA MODALITÀ della testata. */
export interface ManualReceiptLineInput {
  readonly description: string;
  /**
   * L'importo digitato, in unità minori. È ivato o netto secondo
   * `pricesIncludeVat` della testata — la riga da sola non sa quale dei due sia,
   * ed è per questo che la modalità è della registrazione e non della riga.
   */
  readonly amountMinor: number;
  readonly vatCodeId: string;
}

export interface ComputedManualReceiptLine {
  readonly lineNumber: number;
  readonly description: string;
  /** Come digitato, ridotto alla coda che la colonna `NUMERIC(16,6)` tiene. */
  readonly enteredAmountMinor: number;
  /** Il netto CANONICO, con la coda: è lui a far tornare 70,00 alla riapertura. */
  readonly netAmountMinor: number;
  readonly vatCodeId: string;
  readonly vatSnapshot: Prisma.InputJsonObject;
  /** I tre esiti ARROTONDATI: si arrotonda una volta sola, qui. */
  readonly netMinor: number;
  readonly vatMinor: number;
  readonly grossMinor: number;
  /** Aliquota effettiva applicata — quella dello snapshot, per il dettaglio IVA. */
  readonly ratePercent: number;
}

export interface ManualReceiptTotals {
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
}

/**
 * Una riga è **vuota** quando non porta né una descrizione né un importo.
 *
 * Serve perché la maschera tiene sempre in fondo una riga pronta all'inserimento
 * (`10` §12: «una riga vuota pronta all'inserimento non è una riga del
 * database»), e quella riga arriva col Codice IVA già proposto: guardare il solo
 * Codice IVA la farebbe sembrare compilata.
 */
export function isEmptyManualReceiptLine(line: ManualReceiptLineInput): boolean {
  return line.description.trim() === '' && line.amountMinor === 0;
}

/**
 * Le righe da salvare, con i loro importi.
 *
 * ⚠️ **`amounts.unitNetMinor` NON è il netto da memorizzare**, ed è la trappola
 * misurata sull'Ordine fornitore: quel campo è arrotondato al centesimo, giusto
 * per ciò che si mostra e sbagliato per ciò che si conserva — 70,00 ivati al 22%
 * tornerebbero 69,99. Il canonico nasce da `netFromGrossExact`, che la coda la
 * tiene, e si riduce con `toStorableMinor` a quanto la colonna sa memorizzare.
 *
 * Imponibile, imposta e totale di riga restano invece quelli del motore
 * condiviso: quelli sono i valori d'uscita, e lì l'arrotondamento è corretto.
 */
export function computeManualReceiptLines(
  lines: readonly ManualReceiptLineInput[],
  vatCodesById: ReadonlyMap<string, VatCodeWithNature>,
  pricesIncludeVat: boolean,
): ComputedManualReceiptLine[] {
  const costEntryMode = pricesIncludeVat ? 'vat_included' : 'vat_excluded';

  return lines.map((line, index) => {
    // Non-null: la presenza del Codice IVA è già stata verificata dal service,
    // che risponde 422 con il numero di riga. Qui si calcola, non si convalida.
    const vatCode = vatCodesById.get(line.vatCodeId)!;
    const vat = vatInputFromVatCode(vatCode);
    const amounts = computeVatLineAmounts({
      enteredUnitCostMinor: line.amountMinor,
      costEntryMode,
      quantity: 1,
      discountPercent: 0,
      vat,
    });

    const netAmountMinor = entryIncludesVat(costEntryMode, vat)
      ? toStorableMinor(netFromGrossExact(line.amountMinor, vat.ratePercent))
      : toStorableMinor(line.amountMinor);

    return {
      lineNumber: index + 1,
      description: line.description.trim(),
      enteredAmountMinor: toStorableMinor(line.amountMinor),
      netAmountMinor,
      vatCodeId: vatCode.id,
      vatSnapshot: buildVatCodeSnapshot(vatCode),
      netMinor: amounts.lineNetMinor,
      vatMinor: amounts.lineVatMinor,
      grossMinor: amounts.lineGrossMinor,
      ratePercent: vat.ratePercent,
    };
  });
}

/**
 * I tre totali della testata, sommando gli esiti già arrotondati delle righe.
 *
 * Si sommano gli **arrotondati** e non gli esatti di proposito: sono i numeri
 * che il Registro consuma e che l'operatore vede riga per riga, e un totale che
 * non fosse la somma della colonna renderebbe la registrazione non verificabile
 * a occhio — che è il difetto che questa schermata ha già avuto una volta.
 */
export function computeManualReceiptTotals(
  lines: readonly ComputedManualReceiptLine[],
): ManualReceiptTotals {
  let subtotalMinor = 0;
  let taxMinor = 0;
  let totalMinor = 0;
  for (const line of lines) {
    subtotalMinor += line.netMinor;
    taxMinor += line.vatMinor;
    totalMinor += line.grossMinor;
  }
  return { subtotalMinor, taxMinor, totalMinor };
}
