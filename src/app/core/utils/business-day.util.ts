/**
 * ⭐ **Il giorno dell'ATTIVITÀ, lato interfaccia.**
 *
 * ⛔ **«Oggi» non è il giorno del browser.** Un portatile lasciato su un altro
 * fuso — o semplicemente un operatore che lavora da un'altra nazione — vedrebbe
 * un «Oggi» diverso da quello con cui l'API archivia i documenti, e i due non
 * tornerebbero mai. Il giorno lo decide il fuso dell'**attività**, che è lo
 * stesso che l'API usa per scrivere `documentDate` (`api/src/common/
 * business-time.util.ts`).
 *
 * ⛔ **Niente offset fissi**: `+01:00` è sbagliato metà anno. Si chiede a `Intl`
 * qual è il giorno civile **in quell'istante**, che è l'unica cosa che sa
 * dell'ora legale.
 *
 * ⚠️ **Il valore deve coincidere con quello dell'API**, e il modo in cui lo
 * fanno è che entrambi nominano lo stesso fuso: qui e là la costante è
 * `Europe/Rome`. Il giorno in cui diventerà una preferenza per sede, questi
 * sono i due punti da cambiare — e sono due, non venti.
 */

/** Il fuso dell'attività. Perimetro italiano (decisione del 06/09/2026). */
export const FUSO_ATTIVITA = 'Europe/Rome';

/**
 * ⛔ **Il valore si COMPONE dai campi, non si legge dal testo della locale.**
 *
 * Qui c'era `new Intl.DateTimeFormat('en-CA', …).format()`, che oggi rende
 * `2026-09-07` e sembra perfetto. Ma `AAAA-MM-GG` è il **contratto tecnico**
 * verso l'API, e affidarlo alla resa testuale di una locale significa
 * dipendere da una scelta di formattazione: l'ordine dei campi, i separatori e
 * perfino i segni di direzionalità che alcune versioni di ICU inseriscono non
 * sono garantiti da nessuna specifica. Cambierebbero senza rompere niente in
 * compilazione, e il difetto arriverebbe fino al parametro `from`.
 *
 * ⭐ `formatToParts` restituisce i **campi**, e da quelli il formato lo
 * componiamo noi. È la stessa forma usata dall'API in
 * `api/src/common/business-time.util.ts`, e le due devono concordare.
 */
const PARTI = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_ATTIVITA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `AAAA-MM-GG` nel fuso dell'attività. */
export function giornoDiAttivita(istante: Date = new Date()): string {
  const campi = new Map(
    PARTI.formatToParts(istante)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return `${campi.get('year')!}-${campi.get('month')!}-${campi.get('day')!}`;
}

/**
 * Il giorno dell'attività spostato di `giorni`.
 *
 * ⭐ **Si sposta di ORE, non di giorni civili**, e poi si rilegge il giorno: è
 * ciò che rende il calcolo giusto anche a cavallo del cambio d'ora, quando un
 * giorno dura 23 o 25 ore. Aggiungere `n` a `getDate()` userebbe il fuso del
 * browser, che è esattamente ciò da cui questo file esiste per staccarsi.
 *
 * ⚠️ **Mezzogiorno come àncora**: spostandosi da mezzogiorno, uno scarto di
 * un'ora non fa mai scavalcare la mezzanotte. Partendo dall'istante corrente,
 * alle 00:30 un giorno di 23 ore porterebbe al giorno sbagliato.
 */
export function giornoDiAttivitaSpostato(giorni: number, istante: Date = new Date()): string {
  const oggi = giornoDiAttivita(istante);
  const mezzogiorno = new Date(`${oggi}T12:00:00.000Z`);
  return giornoDiAttivita(new Date(mezzogiorno.getTime() + giorni * 86_400_000));
}
