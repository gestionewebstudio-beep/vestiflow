/**
 * L'ordine canonico del Registro Corrispettivi.
 *
 * ## Perché esiste un file per un `sort`
 *
 * Il Registro fonde **cinque sorgenti** in memoria, e fino al 17/08/2026 le
 * ordinava per la sola data economica. Sembrava sufficiente e non lo era:
 *
 * | Sorgente             | Data economica          | Tipo        |
 * | -------------------- | ----------------------- | ----------- |
 * | Vendita canale       | `fulfilledAt`/`placedAt` | `DateTime` |
 * | Rettifica            | `occurredAt`            | `DateTime` |
 * | Vendita al banco     | `documentDate`          | **`DATE`** |
 * | Corrispettivo manuale | `documentDate`         | **`DATE`** |
 *
 * ⚠️ **Due sorgenti portano un istante, due un giorno** — e un giorno, letto
 * come `DateTime`, è **mezzanotte UTC**. Due Corrispettivi manuali dello stesso
 * giorno avevano quindi la stessa chiave: il confronto dava `0`, `Array.sort`
 * lasciava l'ordine in cui si trovavano, e quell'ordine era quello di
 * concatenazione delle quattro `findMany` — che senza `orderBy` **il database
 * non garantisce**.
 *
 * Non era solo poco leggibile: **non era stabile**. Lo stesso periodo,
 * ricaricato, poteva tornare in un ordine diverso.
 *
 * ## La regola, in tre livelli
 *
 * 1. **Giorno economico**, decrescente.
 * 2. **Istante reale** dell'evento o della registrazione, decrescente.
 * 3. **`rowId`**, crescente — il tie-break che chiude ogni pareggio residuo.
 *
 * ⚠️ **Il primo livello è il GIORNO, non l'istante**, ed è una decisione di
 * prodotto: le righe dello stesso giorno devono restare **contigue**. Serve a
 * come si legge un registro di corrispettivi — per giornata — e apre la strada
 * ai subtotali giornalieri in stampa senza cambiare la semantica temporale.
 *
 * Ordinando per istante grezzo, invece, le due sorgenti a data-giorno sarebbero
 * finite **sempre in fondo al loro giorno**, sotto ogni riga del canale: un
 * corrispettivo salvato alle 18:10 sarebbe comparso sotto una vendita delle
 * 14:32 solo perché la sua data è una mezzanotte. Un artefatto del tipo di
 * colonna, presentato come ordine dei fatti.
 *
 * ## Perché il tie-break non è una priorità fra tipi o sorgenti
 *
 * `createdAt` esiste su **tutte e quattro** le tabelle: è «quando questa riga è
 * entrata in VestiFlow». Usarlo non stabilisce che una Vendita valga più di un
 * Reso, né che Shopify preceda il banco — sono i fatti a mettersi in fila da
 * sé. Una gerarchia fra tipi sarebbe stata inventata; questa è misurata.
 *
 * L'ultimo livello, `rowId`, non porta significato ed è lì solo per garantire
 * la **stabilità**: a parità dei primi due — possibile su righe importate dalla
 * stessa sync nello stesso istante — l'ordine deve comunque essere sempre lo
 * stesso, e una stringa lo garantisce senza inventare niente.
 *
 * ## Il fuso
 *
 * Il giorno si tronca in **UTC**, coerentemente con `buildPlacedAtFilter`, che
 * seleziona il periodo fra `T00:00:00.000Z` e `T23:59:59.999Z`. Raggruppare su
 * un fuso diverso da quello che ha scelto le righe metterebbe una riga in un
 * giorno che il filtro non le ha attribuito.
 */

/** Cosa serve per ordinare una riga: niente di più. */
export interface CorrispettivoSortable {
  /** Data economica: quella con cui la riga entra nel periodo. */
  readonly occurredAt: Date;
  /**
   * Istante reale dell'evento o della registrazione. Coincide con `occurredAt`
   * dove la sorgente porta già un istante (canale, rettifiche); è `createdAt`
   * dove la data economica è un giorno (banco, corrispettivo manuale).
   */
  readonly eventAt: Date;
  readonly rowId: string;
}

/** Mezzanotte UTC del giorno: la chiave che rende contigue le righe di una giornata. */
function giornoUtc(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Il comparatore canonico, **decrescente**: il più recente per primo.
 *
 * Lo usano l'elenco e l'export — quest'ultimo invertendolo, perché un registro
 * si legge dal primo giorno. Un comparatore solo: schermo e file non possono
 * divergere.
 */
export function compareCorrispettiviRowsDesc(
  a: CorrispettivoSortable,
  b: CorrispettivoSortable,
): number {
  const perGiorno = giornoUtc(b.occurredAt) - giornoUtc(a.occurredAt);
  if (perGiorno !== 0) {
    return perGiorno;
  }
  const perIstante = b.eventAt.getTime() - a.eventAt.getTime();
  if (perIstante !== 0) {
    return perIstante;
  }
  // Ultimo livello: nessun significato, solo stabilità.
  return a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0;
}

/**
 * Crescente: il primo giorno per primo, e **dentro il giorno l'ordine dei
 * fatti**, non il suo inverso.
 *
 * ⚠️ Non è `compareCorrispettiviRowsDesc` con il segno cambiato su tutto: il
 * `rowId` resta crescente in entrambi i versi, perché non è un dato — è la
 * garanzia che due caricamenti diano la stessa sequenza.
 */
export function compareCorrispettiviRowsAsc(
  a: CorrispettivoSortable,
  b: CorrispettivoSortable,
): number {
  const perGiorno = giornoUtc(a.occurredAt) - giornoUtc(b.occurredAt);
  if (perGiorno !== 0) {
    return perGiorno;
  }
  const perIstante = a.eventAt.getTime() - b.eventAt.getTime();
  if (perIstante !== 0) {
    return perIstante;
  }
  return a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0;
}
