import { formatMoney } from '@core/utils/money.util';
import type { VariantSummary } from '@domain/products/models/variant-summary.model';

import type { DocumentLineSuggestionItem } from './document-line-suggestions.model';

/**
 * Compone la voce del pannello suggerimenti a partire da una variante.
 *
 * ⭐ **Sta qui e non nelle celle** perché la usano in due — «Nome prodotto» e
 * «Codice» — e la componevano ognuna a modo suo. Il difetto che ne è uscito è
 * scritto sotto, su `disponibile`.
 *
 * ⚠️ **Riceve una variante e restituisce testo già pronto**: il pannello non
 * conosce il dominio, e non deve — restituisce l'indice della voce scelta, non
 * un id.
 */
export function voceSuggerimento(
  variant: VariantSummary,
  opzioni: { readonly conCosto?: boolean } = {},
): DocumentLineSuggestionItem {
  const codici: string[] = [];
  if (variant.sku) {
    codici.push(variant.sku);
  }
  if (variant.barcode) {
    codici.push(`EAN ${variant.barcode}`);
  }
  if (variant.category) {
    codici.push(variant.category);
  }

  /*
    ⭐ **LA DISPONIBILITÀ SI MOSTRA SEMPRE, anche a zero** — proprietario,
    02/09/2026: «manca solo visualizzare sempre la disponibilità, anche quella 0».

    ⛔ **Qui prima si taceva quando il valore era `null`**, sulla premessa che
    `null` volesse dire «non si conta». Verificato sull'API: è falso.
    `products.service` lo dice testualmente — «null solo se la variante non ha
    alcuna riga giacenza (mai movimentata)». Una variante mai movimentata ha
    **zero pezzi davvero**: tacere la faceva sembrare non conteggiabile, e in un
    elenco dove le vicine dicono «Disp. 13» l'assenza si legge come un dato che
    manca, non come uno zero.

    ⚠️ **Un caso in cui `null` significa davvero «non si conta» esiste, ed è
    l'unico**: `managesStock === false` — un servizio, o un articolo fuori
    magazzino. Lì la riga tace, perché scrivere «Disp. 0» direbbe «finito» su
    qualcosa che non finisce mai.
  */
  const gestisceMagazzino = variant.managesStock !== false;
  const disponibile = gestisceMagazzino ? (variant.stockAvailable ?? 0) : null;

  return {
    // ⚠️ Il NOME, non `title`: quello porta già la variante attaccata con un
    //    trattino, ed è proprio la forma che rendeva illeggibile l'elenco.
    title: variant.productName || variant.title,
    variante: variant.variantLabel || undefined,
    detail: codici.length > 0 ? codici.join(' · ') : undefined,
    imageUrl: variant.imageUrl,
    /*
      ⛔ **È `stockAvailable`, non `stockOnHand`** — corretto il 02/09/2026.

      La cella «Nome prodotto» scriveva «Disp. N» leggendo la GIACENZA. In tutto
      il resto dell'app «Disp.» è il disponibile — giacenza meno impegnata:
      `inventory.util`, la card di riga, Giacenze e Situazione usano tutte
      `available`.

      ⚠️ **Su un ordine cliente la differenza è operativa**: la merce si impegna,
      quindi «Disp. 18» poteva significare diciotto in magazzino e tre vendibili.
    */
    disponibile: disponibile != null ? `Disp. ${disponibile}` : undefined,
    tonoDisponibile: tonoDi(disponibile),
    prezzo: variant.sellingPrice.amountMinor > 0 ? formatMoney(variant.sellingPrice) : undefined,
    costo:
      opzioni.conCosto && variant.purchasePrice && variant.purchasePrice.amountMinor > 0
        ? `Acq. ${formatMoney(variant.purchasePrice)}`
        : undefined,
  };
}

/**
 * ⚠️ **`null` non è zero**: una variante che non gestisce magazzino non ha
 * disponibilità, e non deve prendere il colore di «finito».
 */
function tonoDi(disponibile: number | null | undefined): 'ok' | 'zero' | 'negativa' | undefined {
  if (disponibile == null) {
    return undefined;
  }
  if (disponibile < 0) {
    return 'negativa';
  }
  return disponibile === 0 ? 'zero' : 'ok';
}
