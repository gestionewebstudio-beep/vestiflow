import type { Prisma } from '@prisma/client';

import { buildUnmatchedRateSnapshot } from '../vat/vat-snapshot.util';
import { shopifyDecimalToMinor } from './shopify-money.util';

/** IVA di una riga come la dichiara il canale. */
export interface ShopifyLineVat {
  /** Imposta della riga in unità minori. `0` se il canale non la dichiara. */
  readonly taxMinor: number;
  /**
   * Snapshot dell'aliquota osservata, `null` quando il canale non la porta.
   *
   * **Non contiene un Codice IVA**, ed è deliberato: la corrispondenza fra
   * l'aliquota del canale e i Codici IVA del tenant è una decisione della
   * procedura di prima sincronizzazione, e non esiste ancora. I due problemi
   * sono distinti — il dato storico di Shopify si conserva oggi, la
   * corrispondenza aspetta. Tenerli insieme rimanderebbe anche la parte che
   * si può fare subito.
   */
  readonly snapshot: Prisma.InputJsonObject | null;
}

const NO_VAT: ShopifyLineVat = { taxMinor: 0, snapshot: null };

/**
 * Legge l'IVA di una riga d'ordine Shopify da `tax_lines`.
 *
 * ⚠️ **Il canale il dettaglio lo fornisce**, e per molto tempo si è creduto di
 * no: l'imposta dell'ordine veniva ripartita sulle righe in proporzione al
 * loro valore. Su un ordine a una sola aliquota la ripartizione coincide col
 * vero e nessuno se ne accorge; con due aliquote ogni riga risulta sbagliata,
 * mentre il totale continua a tornare — ed è il totale che torna a rendere il
 * difetto invisibile.
 *
 * _Misurato il 14/08/2026 su `#1009`_ (prodotto al 4%, maglietta e spedizione
 * al 22%): sulla riga da 60,00 € l'imposta vera è **2,31 €**, la ripartizione
 * proporzionale ne scriveva **6,22 €**. Registro difetti 3.12.
 *
 * Una riga con più `tax_lines` somma le imposte e tiene la **prima** aliquota:
 * fuori dai casi italiani ordinari, e inventare una ripartizione sarebbe
 * ricadere nell'errore da cui questa funzione nasce.
 */
export function mapShopifyLineVat(line: Record<string, unknown>): ShopifyLineVat {
  const taxLines = (line.tax_lines as Record<string, unknown>[] | undefined) ?? [];
  if (taxLines.length === 0) {
    return NO_VAT;
  }

  let taxMinor = 0;
  let ratePercent: number | null = null;
  for (const taxLine of taxLines) {
    taxMinor += shopifyDecimalToMinor(String(taxLine.price ?? '0'));
    if (ratePercent === null) {
      const rate = Number(taxLine.rate);
      if (Number.isFinite(rate)) {
        ratePercent = Math.round(rate * 10_000) / 100;
      }
    }
  }

  return {
    taxMinor,
    snapshot: ratePercent === null ? null : buildUnmatchedRateSnapshot(ratePercent),
  };
}
