/**
 * ⭐ **Il giorno dell'ATTIVITÀ, non quello del server né quello del browser.**
 *
 * ⛔ **Il difetto che questo file chiude, misurato il 06/09/2026.** La Cassa
 * scriveva `documentDate: new Date()` in una colonna `@db.Date`: Prisma ne
 * prende la parte **UTC**. Una vendita alle 00:30 del 7 settembre a Roma è
 * `2026-09-06T22:30Z`, e finiva archiviata **col 6**. Il registro non la
 * mostrava sotto «oggi» — ma il problema non era il filtro: era il DATO, e
 * nessun confine di ricerca lo avrebbe rimediato.
 *
 * ⚠️ **Difetto gemello, stesso commit**: l'anno della numerazione veniva da
 * `documentDate.getFullYear()`, che è **locale al processo**, mentre la data
 * memorizzata era UTC. A Capodanno, fra la mezzanotte di Roma e quella di
 * Greenwich, un documento prendeva la serie dell'anno nuovo con la data
 * dell'anno vecchio.
 *
 * ⛔ **Niente offset fissi.** `+01:00` è sbagliato da fine marzo a fine
 * ottobre, e `+02:00` il resto dell'anno: si chiede a `Intl` qual è
 * l'offset **in quell'istante**, che è l'unica cosa che sa dell'ora legale.
 *
 * ⛔ **E niente fuso del processo.** `getFullYear()`, `getDate()` e
 * `new Date(anno, mese, giorno)` leggono `TZ` dell'ambiente: in produzione i
 * contenitori girano in UTC, in locale no, e lo stesso codice darebbe due
 * risposte. Qui dentro non se ne usa nessuno.
 *
 * ⚠️ **Non è una preferenza per tenant**, e non lo diventa oggi: aggiungere
 * una colonna richiederebbe una migration sul database condiviso, fuori dal
 * mandato. È una costante applicativa, e il giorno in cui servirà per sede
 * questo è il punto unico da cui farla dipendere.
 */

/** Il fuso dell'attività. Perimetro italiano (decisione del 06/09/2026). */
export const BUSINESS_TIME_ZONE = 'Europe/Rome';

/**
 * ⚠️ `hourCycle: 'h23'` e non `hour12: false`: con quest'ultimo alcune versioni
 * di ICU rendono la mezzanotte come **«24»**, e `Date.UTC(..., 24, ...)` scivola
 * al giorno dopo. È il tipo di difetto che si manifesta su una macchina sola.
 */
const PARTI = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface PartiCivili {
  readonly anno: number;
  readonly mese: number;
  readonly giorno: number;
  readonly ora: number;
  readonly minuto: number;
  readonly secondo: number;
}

function partiCivili(istante: Date): PartiCivili {
  const trovate = new Map(
    PARTI.formatToParts(istante)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
  return {
    anno: trovate.get('year')!,
    mese: trovate.get('month')!,
    giorno: trovate.get('day')!,
    ora: trovate.get('hour')!,
    minuto: trovate.get('minute')!,
    secondo: trovate.get('second')!,
  };
}

/** Di quanto il fuso dell'attività è avanti su UTC, IN QUELL'ISTANTE. */
function scostamentoMs(istante: Date): number {
  const c = partiCivili(istante);
  return Date.UTC(c.anno, c.mese - 1, c.giorno, c.ora, c.minuto, c.secondo) - istante.getTime();
}

/** `AAAA-MM-GG` civile nel fuso dell'attività. */
export function giornoDiAttivita(istante: Date = new Date()): string {
  const c = partiCivili(istante);
  const mm = String(c.mese).padStart(2, '0');
  const gg = String(c.giorno).padStart(2, '0');
  return `${c.anno}-${mm}-${gg}`;
}

const GIORNO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** L'anno civile del giorno dell'attività: quello della NUMERAZIONE. */
export function annoDiAttivita(giorno: string): number {
  return Number(giorno.slice(0, 4));
}

/**
 * Il valore da scrivere in una colonna **`@db.Date`** per quel giorno civile.
 *
 * ⛔ **Qui la mezzanotte UTC è quella GIUSTA, ed è l'opposto di ciò che serve
 * per gli istanti.** Una colonna `DATE` non ha ora né fuso: Prisma serializza
 * il `Date` e PostgreSQL ne prende la **parte UTC**. Per archiviare il giorno
 * `2026-09-07` bisogna quindi passare `2026-09-07T00:00:00.000Z` — non
 * `inizioGiornoDiAttivita('2026-09-07')`, che è `2026-09-06T22:00Z` e verrebbe
 * archiviato **col 6**, cioè il difetto di partenza con un travestimento nuovo.
 *
 * ⚠️ **Non usare questo valore come istante.** Non è «mezzanotte a Roma» e non
 * è il momento in cui è successo qualcosa: è un giorno di calendario scritto
 * nella forma che il database si aspetta. Gli istanti — `createdAt` di un
 * movimento, `openedAt` di una sessione — restano `new Date()`.
 */
export function dataCivile(giorno: string): Date {
  if (!GIORNO.test(giorno)) {
    throw new RangeError(`Giorno non valido: atteso AAAA-MM-GG, ricevuto "${giorno}".`);
  }
  return new Date(`${giorno}T00:00:00.000Z`);
}

/**
 * L'istante in cui comincia quel giorno civile nel fuso dell'attività.
 *
 * ⭐ **Due passaggi, e il secondo non è pignoleria**: si stima l'istante con lo
 * scostamento della mezzanotte «finta» in UTC, poi lo si ricalcola con lo
 * scostamento valido in quell'istante. Nella notte del cambio d'ora i due
 * differiscono di un'ora, e il primo tentativo cadrebbe nel giorno sbagliato.
 *
 * ⚠️ In Italia il cambio avviene alle 02:00 locali, quindi la mezzanotte
 * civile esiste sempre e non è mai doppia. Il secondo passaggio serve
 * comunque: rende il calcolo corretto anche a ridosso del cambio.
 */
export function inizioGiornoDiAttivita(giorno: string): Date {
  const parti = GIORNO.exec(giorno);
  if (!parti) {
    throw new RangeError(`Giorno non valido: atteso AAAA-MM-GG, ricevuto "${giorno}".`);
  }
  const [, anno, mese, gg] = parti;
  const finta = Date.UTC(Number(anno), Number(mese) - 1, Number(gg));
  const primo = new Date(finta - scostamentoMs(new Date(finta)));
  return new Date(finta - scostamentoMs(primo));
}

/** Il giorno civile successivo, `AAAA-MM-GG`. */
export function giornoSuccessivo(giorno: string): string {
  const inizio = inizioGiornoDiAttivita(giorno);
  // 36 ore avanti cadono sempre dentro il giorno dopo, anche quando quel
  // giorno dura 23 o 25 ore per il cambio d'ora. Poi si torna al giorno civile.
  return giornoDiAttivita(new Date(inizio.getTime() + 36 * 3_600_000));
}

/**
 * Il filtro su un ISTANTE per un intervallo di giorni civili.
 *
 * ⭐ **Inizio incluso, inizio del giorno dopo ESCLUSO** — `[gte, lt)`.
 * ⛔ Non `lte 23:59:59.999`: quel confine perde l'ultimo millisecondo e, nel
 * giorno del cambio d'ora, un'ora intera — quel giorno dura 23 o 25 ore, non 24.
 */
export function intervalloDiGiorni(da?: string, a?: string): { gte?: Date; lt?: Date } | undefined {
  if (!da && !a) {
    return undefined;
  }
  return {
    ...(da ? { gte: inizioGiornoDiAttivita(da) } : {}),
    ...(a ? { lt: inizioGiornoDiAttivita(giornoSuccessivo(a)) } : {}),
  };
}
