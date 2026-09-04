import type { EntityId, Money } from '@core/models/common.model';
import type { VariantSummary } from './variant-summary.model';

/**
 * ⭐ **UN ARTICOLO fra i risultati di ricerca**, con le sue varianti sotto.
 *
 * Nasce per la **Ricerca giacenza** (02/09/2026), che il proprietario ha
 * descritto come il palmare del commesso: _«scrivo maglie, clicco cerca e mi
 * escono tutti gli articoli con nome maglie, maglietta, magliette ecc. E tutti
 * i loro dati essenziali, immagine (piccola), giacenza, disponibilità,
 * prezzi»_.
 *
 * ⛔ **I risultati sono ARTICOLI, non varianti** — decisione del proprietario:
 * «gli articoli, poi le taglie toccando». Tre modelli con quindici taglie
 * ciascuno sono **tre righe** da scorrere sul telefono, non quarantacinque.
 */
export interface ArticoloTrovato {
  readonly productId: EntityId;
  readonly productName: string;
  readonly articleCode: string;
  readonly imageUrl?: string;
  /**
   * Il prezzo da mostrare accanto all'articolo.
   *
   * ⚠️ **È quello della prima variante**, e quando le varianti hanno prezzi
   * diversi `prezzoUnico` dice di no: allora è un «da …», non IL prezzo.
   */
  readonly prezzo: Money;
  readonly prezzoUnico: boolean;
  /**
   * Giacenza e disponibilità **sommate sulle varianti**.
   *
   * ⛔ **Si sommano valori già determinati dal server**, che per ogni variante
   * ha già aggregato le sedi (`searchVariantSummaries`). È la regola di
   * `regole-gestionale`: «il riepilogo SOMMA, non ricalcola».
   *
   * ⚠️ **`null` non è zero**: una variante che non gestisce magazzino, o mai
   * movimentata, non ha giacenza. Se NESSUNA variante ne ha, l'articolo non ha
   * un numero da mostrare — e mostrare «0» direbbe «finito» invece di «non si
   * conta».
   */
  readonly giacenza: number | null;
  readonly disponibile: number | null;
  /** Le varianti dell'articolo, nell'ordine in cui il server le ha date. */
  readonly varianti: readonly VariantSummary[];
}

/**
 * Raggruppa per articolo le varianti trovate dalla ricerca.
 *
 * ⚠️ **L'ordine degli articoli è quello della PRIMA variante di ciascuno**: il
 * server ordina per nome prodotto, quindi l'ordine dei risultati si conserva
 * senza riordinare niente qui.
 */
export function raggruppaPerArticolo(
  varianti: readonly VariantSummary[],
): readonly ArticoloTrovato[] {
  const perProdotto = new Map<EntityId, VariantSummary[]>();
  for (const variante of varianti) {
    const gruppo = perProdotto.get(variante.productId);
    if (gruppo) {
      gruppo.push(variante);
    } else {
      perProdotto.set(variante.productId, [variante]);
    }
  }

  const articoli: ArticoloTrovato[] = [];
  for (const [productId, gruppo] of perProdotto) {
    const prima = gruppo[0];
    if (!prima) {
      continue;
    }
    articoli.push({
      productId,
      productName: prima.productName,
      articleCode: prima.articleCode,
      // ⚠️ La prima immagine che c'è, non per forza quella della prima variante:
      //    su un articolo a colori solo alcune varianti ne hanno una.
      imageUrl: gruppo.find((v) => v.imageUrl)?.imageUrl,
      prezzo: prima.sellingPrice,
      prezzoUnico: gruppo.every(
        (v) => v.sellingPrice.amountMinor === prima.sellingPrice.amountMinor,
      ),
      giacenza: sommaONulla(gruppo, (v) => v.stockOnHand),
      disponibile: sommaONulla(gruppo, (v) => v.stockAvailable),
      varianti: gruppo,
    });
  }
  return articoli;
}

/**
 * Somma i valori presenti; `null` se **nessuna** variante ne ha uno.
 *
 * ⚠️ Una variante senza giacenza non vale zero nella somma: vale «non
 * pervenuta». Se però almeno una variante un numero ce l'ha, l'articolo ha un
 * totale — e le altre non tolgono niente.
 */
function sommaONulla(
  varianti: readonly VariantSummary[],
  leggi: (v: VariantSummary) => number | null | undefined,
): number | null {
  let totale: number | null = null;
  for (const variante of varianti) {
    const valore = leggi(variante);
    if (valore !== null && valore !== undefined) {
      totale = (totale ?? 0) + valore;
    }
  }
  return totale;
}
