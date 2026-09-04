/**
 * Helper sul denaro condivisi lato server (§sei decimali).
 *
 * L'ammontare in unità minori NON è più necessariamente intero: uno scorporo
 * IVA lascia una coda decimale (fino a 4 cifre di centesimo, 6 decimali di
 * euro) ed è quella coda a far tornare il prezzo digitato quando lo si rimostra
 * ivato. Da qui discendono due regole:
 *
 * - si arrotonda **solo all'uscita** (stampa, CSV, payload di canale);
 * - «è cambiato?» si chiede **al centesimo**: una coda decimale diversa non è
 *   una modifica per chi guarda, e non deve far scattare storici prezzi,
 *   conflitti di catalogo o propagazioni verso i canali.
 */

/** Arrotonda al centesimo. Il gesto dell'uscita, mai dei passaggi intermedi. */
export function roundToMinor(amountMinor: number): number {
  return Math.round(amountMinor);
}

/**
 * Cifre di centesimo che il CONTRATTO conserva: quattro, cioè **6 decimali di
 * euro**.
 *
 *     1,234567 EUR  =  123,4567 centesimi
 *
 * ⚠️ **Non è la capacità della colonna**, ed è la confusione che questo
 * commento induceva: `NUMERIC(16,6)` di decimali ne memorizza **sei** — sei di
 * centesimo, cioè otto di euro. Ne usiamo quattro, e le due cifre di margine
 * restano libere.
 *
 * Oltre le quattro non c'è precisione: c'è il rumore del float (`25 / 1.22` in
 * binario non finisce mai).
 */
const MINOR_TAIL_DECIMALS = 4;

/**
 * Riduce la coda decimale a quello che la colonna sa tenere: 4 cifre di
 * centesimo, cioè 6 decimali di euro. NON è l'arrotondamento d'uscita — è la
 * forma memorizzabile del valore esatto. Oltre quelle cifre non c'è precisione,
 * c'è il rumore del float (`25 / 1.22` in binario non finisce mai), e il
 * database rifiuterebbe la scala.
 *
 * Gemella di `toStorableMinor` del frontend (`core/utils/money.util.ts`): le due
 * sponde devono ridurre la coda allo stesso modo, altrimenti lo stesso importo
 * salvato dalle due parti differisce nell'ultima cifra.
 */
export function toStorableMinor(amountMinor: number): number {
  const factor = 10 ** MINOR_TAIL_DECIMALS;
  return Math.round(amountMinor * factor) / factor;
}

/** Stesso importo *per l'operatore*: confronto al centesimo. */
export function sameAmountAtCent(a: number, b: number): boolean {
  return Math.round(a) === Math.round(b);
}

/**
 * Come sopra, ma per importi che possono mancare: due assenze sono lo stesso
 * importo, un'assenza e un valore no.
 */
export function sameNullableAmountAtCent(a: number | null, b: number | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return sameAmountAtCent(a, b);
}

/**
 * **«È cambiato?» per un valore UNITARIO canonico**: si chiede alla precisione
 * del contratto — 4 cifre di centesimo, cioè 6 decimali di euro — non al
 * centesimo.
 *
 * ⛔ **Non è un doppione di `sameAmountAtCent`, ed è la distinzione che conta.**
 * Quella risponde «è lo stesso importo *per l'operatore*», e sui TOTALI è
 * giusta: una coda diversa non è una modifica che qualcuno vede. Ma un costo
 * unitario la coda la CONSERVA per contratto, e chiederglielo al centesimo
 * significa non accorgersi di un cambio reale:
 *
 *     84,0000 → 84,4262     al centesimo: «uguali»  ⛔     al contratto: diversi ✅
 *
 * Misurato il 22/08/2026: con quel metro, un Arrivo merce a 1,03 € ivati al 22%
 * avrebbe lasciato in anagrafica il vecchio 84 invece di scrivere 84,4262 —
 * cioè avrebbe vanificato la migration che serviva a conservarlo.
 *
 * ⭐ **Normalizza entrambi i valori prima di confrontarli**, con la stessa
 * funzione che li prepara alla persistenza: due valori grezzi diversi che
 * diventano identici una volta memorizzabili SONO lo stesso valore, e non
 * devono far scattare una riscrittura.
 *
 * `null` resta distinto da qualunque numero, zero compreso.
 */
export function sameUnitAmountAtContract(a: number | null, b: number | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return toStorableMinor(a) === toStorableMinor(b);
}

/**
 * Unità minori → stringa decimale (2990 → "29.90"). È la forma con cui il
 * denaro esce verso un canale esterno, quindi **è qui che si arrotonda**.
 *
 * L'arrotondamento sta sulle unità minori, non sul valore in euro: `toFixed(2)`
 * su `minor / 100` sembra equivalente e non lo è — mezzo centesimo lo perde
 * quasi sempre per come il float rappresenta `x,xx5`. Due canali che usassero
 * le due forme pubblicherebbero lo stesso prezzo con un centesimo di
 * differenza.
 */
export function minorToDecimalString(amountMinor: number, decimals = 2): string {
  const rounded = roundToMinor(amountMinor);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const factor = 10 ** decimals;
  const intPart = Math.floor(abs / factor);
  const frac = String(abs % factor).padStart(decimals, '0');
  return `${negative ? '-' : ''}${intPart}.${frac}`;
}
