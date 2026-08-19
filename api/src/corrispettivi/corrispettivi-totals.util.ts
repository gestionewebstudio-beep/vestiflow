import type { SalesOrderFinancialStatus } from '@prisma/client';

import { isRefundFinancialStatus } from './corrispettivi-fiscal.enum-mapper';

/**
 * L'accumulatore del Registro Corrispettivi: **una sola matematica**.
 *
 * ## Perché è stato estratto (`docs/10` §16, passo 3 del blocco A)
 *
 * Perché serve due volte. Il riepilogo del periodo esiste da sempre; i
 * **subtotali giornalieri** che arrivano col blocco B sono lo stesso calcolo su
 * un sottoinsieme, e riscriverlo accanto produrrebbe due formule che si
 * assomigliano finché qualcuno non tocca una delle due.
 *
 * ⚠️ **Non è un riordino estetico: è la precondizione della riconciliazione.**
 * La proprietà che il Registro deve garantire è
 *
 *     somma dei sottoinsiemi = riepilogo del periodo
 *
 * e vale solo se i due numeri escono **dalla stessa funzione**. Con due
 * implementazioni, «si assomigliano» è tutto ciò che si può promettere.
 *
 * ## Additivo per costruzione
 *
 * Qui dentro ci sono **solo somme e differenze**, e questo non è un dettaglio
 * di stile:
 *
 * ```text
 * Σ(totale − imposta)         =  Σtotale − Σimposta          ✅ distribuisce
 * Σ max(0, totale − imposta)  ≠  max(0, Σtotale − Σimposta)  ❌ non distribuisce
 * ```
 *
 * Il `Math.max(0, …)` che oggi protegge `taxableMinor` e `netTaxableMinor`
 * **resta fuori da qui**, applicato da chi compone la risposta: così il
 * comportamento visibile non cambia di un centesimo in questo passo, e nel
 * passo 4 si toglie in **un punto solo** invece di rincorrerlo dentro la
 * matematica.
 *
 * ## Le regole per sorgente, che NON sono uguali fra loro
 *
 * È l'altra ragione per cui una seconda implementazione divergerebbe: ogni
 * sorgente porta il proprio imponibile in un modo diverso, e le differenze sono
 * tutte motivate.
 */

/** Un ordine di canale: porta i suoi importi già scomposti. */
export interface OrdineAccumulabile {
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly financialStatus: SalesOrderFinancialStatus | null;
}

/** Una Vendita al banco: è un documento, e l'imponibile si ricava. */
export interface VenditaBancoAccumulabile {
  readonly taxMinor: number;
  readonly totalMinor: number;
}

/** Un Corrispettivo manuale: l'imponibile lo SA, sommato per aliquota. */
export interface CorrispettivoManualeAccumulabile {
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly totalMinor: number;
}

/** Una rettifica: totale e imposta, col segno che ha in tabella. */
export interface RettificaAccumulabile {
  readonly totalMinor: number;
  readonly taxMinor: number;
}

export interface RigheDaSommare {
  readonly ordini: readonly OrdineAccumulabile[];
  readonly venditeBanco: readonly VenditaBancoAccumulabile[];
  readonly corrispettiviManuali: readonly CorrispettivoManualeAccumulabile[];
  readonly rettifiche: readonly RettificaAccumulabile[];
  readonly annullamenti: readonly { readonly totalMinor: number }[];
}

/**
 * I totali grezzi di un insieme di righe. **Nessun arrotondamento, nessun
 * troncamento, nessun clamp**: solo ciò che distribuisce sulla somma.
 */
export interface TotaliCorrispettivi {
  readonly orderCount: number;
  readonly refundsCount: number;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly shippingMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  /** Differenza pura: **può essere negativo**, e in quel caso è un fatto. */
  readonly taxableMinor: number;
  readonly refundCount: number;
  readonly refundTotalMinor: number;
  readonly refundTaxMinor: number;
  readonly cancellationCount: number;
  readonly cancellationTotalMinor: number;
  readonly netTotalMinor: number;
  readonly netTaxMinor: number;
  /** Differenza pura anche questa. */
  readonly netTaxableMinor: number;
}

export function accumulaCorrispettivi(righe: RigheDaSommare): TotaliCorrispettivi {
  let refundsCount = 0;
  let subtotalMinor = 0;
  let taxMinor = 0;
  let shippingMinor = 0;
  let discountMinor = 0;
  let totalMinor = 0;

  for (const ordine of righe.ordini) {
    subtotalMinor += ordine.subtotalMinor;
    taxMinor += ordine.taxMinor;
    shippingMinor += ordine.shippingMinor;
    discountMinor += ordine.discountMinor;
    totalMinor += ordine.totalMinor;
    if (ordine.financialStatus != null && isRefundFinancialStatus(ordine.financialStatus)) {
      refundsCount += 1;
    }
  }

  // Le Vendite al banco entrano come le altre vendite. Lo `shipping` non le
  // riguarda — al banco non si spedisce — e lo sconto è già dentro il totale
  // del documento: sommarlo conterebbe due volte lo stesso sconto.
  for (const vendita of righe.venditeBanco) {
    subtotalMinor += vendita.totalMinor - vendita.taxMinor;
    taxMinor += vendita.taxMinor;
    totalMinor += vendita.totalMinor;
  }

  // I Corrispettivi manuali: l'imponibile è **letto**, non ricavato per
  // differenza. La registrazione lo conserva già, sommato dalle sue righe per
  // aliquota — è l'unica sorgente che sa dirlo.
  for (const corrispettivo of righe.corrispettiviManuali) {
    subtotalMinor += corrispettivo.subtotalMinor;
    taxMinor += corrispettivo.taxMinor;
    totalMinor += corrispettivo.totalMinor;
  }

  const refundTotalMinor = righe.rettifiche.reduce((somma, r) => somma + r.totalMinor, 0);
  const refundTaxMinor = righe.rettifiche.reduce((somma, r) => somma + r.taxMinor, 0);
  const cancellationTotalMinor = righe.annullamenti.reduce((somma, a) => somma + a.totalMinor, 0);

  const netTotalMinor = totalMinor - refundTotalMinor;
  const netTaxMinor = taxMinor - refundTaxMinor;

  return {
    orderCount:
      righe.ordini.length + righe.venditeBanco.length + righe.corrispettiviManuali.length,
    refundsCount,
    subtotalMinor,
    taxMinor,
    shippingMinor,
    discountMinor,
    totalMinor,
    // ⚠️ `subtotalMinor` arriva dal canale GIÀ al netto degli sconti di riga
    // (misurato: righe 120,00 − sconti 16,00 = subtotale 104,00). Sottrarli di
    // nuovo produceva un imponibile che non esiste — 88,00 su quell'ordine.
    taxableMinor: totalMinor - taxMinor,
    refundCount: righe.rettifiche.length,
    refundTotalMinor,
    refundTaxMinor,
    // Gli annullamenti si CONTANO e non si sottraggono: la vendita che
    // annullano non è mai entrata nel registro (specifica `08` §4).
    cancellationCount: righe.annullamenti.length,
    cancellationTotalMinor,
    netTotalMinor,
    netTaxMinor,
    netTaxableMinor: netTotalMinor - netTaxMinor,
  };
}

/**
 * Somma due insiemi di totali già calcolati.
 *
 * È la prova operativa dell'additività — `accumula(a ∪ b) === somma(accumula a,
 * accumula b)` — e nel blocco B è ciò che permetterà di ricavare il riepilogo
 * del periodo dai subtotali giornalieri senza interrogare di nuovo il database.
 */
export function sommaTotali(
  a: TotaliCorrispettivi,
  b: TotaliCorrispettivi,
): TotaliCorrispettivi {
  return {
    orderCount: a.orderCount + b.orderCount,
    refundsCount: a.refundsCount + b.refundsCount,
    subtotalMinor: a.subtotalMinor + b.subtotalMinor,
    taxMinor: a.taxMinor + b.taxMinor,
    shippingMinor: a.shippingMinor + b.shippingMinor,
    discountMinor: a.discountMinor + b.discountMinor,
    totalMinor: a.totalMinor + b.totalMinor,
    taxableMinor: a.taxableMinor + b.taxableMinor,
    refundCount: a.refundCount + b.refundCount,
    refundTotalMinor: a.refundTotalMinor + b.refundTotalMinor,
    refundTaxMinor: a.refundTaxMinor + b.refundTaxMinor,
    cancellationCount: a.cancellationCount + b.cancellationCount,
    cancellationTotalMinor: a.cancellationTotalMinor + b.cancellationTotalMinor,
    netTotalMinor: a.netTotalMinor + b.netTotalMinor,
    netTaxMinor: a.netTaxMinor + b.netTaxMinor,
    netTaxableMinor: a.netTaxableMinor + b.netTaxableMinor,
  };
}

/**
 * Il **giorno economico** di una data, in forma ISO (`AAAA-MM-GG`).
 *
 * ⚠️ Deve essere la STESSA definizione che usano l'ordinamento
 * (`corrispettivi-sort.util.ts`) e i filtri di periodo: due letture di «giorno»
 * produrrebbero un raggruppamento che non combacia con l'ordine delle righe —
 * una giornata spezzata in due blocchi, o una riga sotto l'intestazione
 * sbagliata. Sono entrambe UTC, e restano tali.
 */
export function giornoEconomico(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** Una riga qualsiasi, con la data con cui entra nel registro. */
interface ConGiorno {
  readonly occurredAt: Date;
}

function perGiorno<T extends ConGiorno>(righe: readonly T[]): Map<string, T[]> {
  const gruppi = new Map<string, T[]>();
  for (const riga of righe) {
    const giorno = giornoEconomico(riga.occurredAt);
    const gruppo = gruppi.get(giorno);
    if (gruppo) gruppo.push(riga);
    else gruppi.set(giorno, [riga]);
  }
  return gruppi;
}

export interface TotaliGiornata {
  readonly giorno: string;
  readonly totali: TotaliCorrispettivi;
}

/** Le stesse righe dell'accumulatore, ognuna con la sua data economica. */
export interface RigheDaSommarePerGiorno {
  readonly ordini: readonly (OrdineAccumulabile & ConGiorno)[];
  readonly venditeBanco: readonly (VenditaBancoAccumulabile & ConGiorno)[];
  readonly corrispettiviManuali: readonly (CorrispettivoManualeAccumulabile & ConGiorno)[];
  readonly rettifiche: readonly (RettificaAccumulabile & ConGiorno)[];
  readonly annullamenti: readonly ({ readonly totalMinor: number } & ConGiorno)[];
}

/**
 * I totali **giorno per giorno**, in ordine decrescente.
 *
 * ⚠️ **Non è una seconda matematica**: ogni giornata passa dallo stesso
 * `accumulaCorrispettivi` del periodo. È la condizione perché valga
 *
 *     somma dei giorni = totale del periodo
 *
 * e con `totaleDaiGiorni` sotto quell'uguaglianza smette di essere una
 * proprietà da verificare a mano: il totale del periodo **è** la somma dei
 * giorni, per costruzione.
 *
 * L'ordine è giorno economico DESC, lo stesso delle righe: il raggruppamento
 * è una piegatura di un elenco già ordinato, non un secondo criterio che
 * potrebbe divergere dal primo.
 */
export function accumulaPerGiorno(righe: RigheDaSommarePerGiorno): TotaliGiornata[] {
  const ordini = perGiorno(righe.ordini);
  const banco = perGiorno(righe.venditeBanco);
  const manuali = perGiorno(righe.corrispettiviManuali);
  const rettifiche = perGiorno(righe.rettifiche);
  const annullamenti = perGiorno(righe.annullamenti);

  const giorni = new Set<string>([
    ...ordini.keys(),
    ...banco.keys(),
    ...manuali.keys(),
    ...rettifiche.keys(),
    ...annullamenti.keys(),
  ]);

  return [...giorni]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((giorno) => ({
      giorno,
      totali: accumulaCorrispettivi({
        ordini: ordini.get(giorno) ?? [],
        venditeBanco: banco.get(giorno) ?? [],
        corrispettiviManuali: manuali.get(giorno) ?? [],
        rettifiche: rettifiche.get(giorno) ?? [],
        annullamenti: annullamenti.get(giorno) ?? [],
      }),
    }));
}

/** Il totale del periodo come somma delle giornate: riconciliato per costruzione. */
export function totaleDaiGiorni(giorni: readonly TotaliGiornata[]): TotaliCorrispettivi {
  return giorni
    .map((g) => g.totali)
    .reduce(sommaTotali, accumulaCorrispettivi({
      ordini: [],
      venditeBanco: [],
      corrispettiviManuali: [],
      rettifiche: [],
      annullamenti: [],
    }));
}
