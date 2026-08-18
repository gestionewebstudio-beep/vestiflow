import { SalesOrderSource as PrismaSource } from '@prisma/client';

import { sourceDisplayLabel } from '../sales-orders/sales-order.enum-mapper';

/**
 * Chi entra nel Registro Corrispettivi, e come si classifica (`11` A9, `10` §3).
 *
 * **Due domande in quest'ordine, e non una sola.**
 *
 * 1. *questo evento è un corrispettivo?* — non tutte le origini lo sono;
 * 2. solo per quelle che lo sono: *che ambito e che canale?*
 *
 * ⚠️ **Invertirle produce un errore concettuale, e c'è già cascato uno.** Il
 * 16/08 avevo classificato `manual` come Fisico/POS ragionando «non è online,
 * quindi è fisico». È falso: **Fisico/POS non significa «tutto ciò che non è
 * online», significa una vendita fisica effettiva.** Un Ordine cliente manuale
 * è un **impegno commerciale** — si prende al telefono, in ufficio, per email —
 * e non dice niente su come avverrà la vendita: si concluderà con un DDT, una
 * fattura, o niente. Non è una Vendita al banco, non è una vendita online, e
 * **non è un corrispettivo**.
 *
 * L'effetto economico di un Ordine cliente arriva dal **documento che lo
 * conclude**, secondo le relazioni documentali previste — non dalla sua origine.
 *
 * | Origine          | Corrispettivo? | Ambito     | Canale    |
 * | ---------------- | -------------- | ---------- | --------- |
 * | `shopify_online` | ✅             | Online     | Shopify   |
 * | `shopify_pos`    | ✅             | Fisico/POS | Shopify   |
 * | `store`          | ✅             | Fisico/POS | VestiFlow |
 * | `manual`         | ⛔ **no**      | —          | —         |
 *
 * **Nessuna colonna persistente**: tutto si deriva dall'**origine**, che è un
 * fatto scritto alla creazione.
 *
 * ## La quarta origine non è un `SalesOrderSource` _(17/08/2026, `10` §13)_
 *
 * Il **Corrispettivo manuale** entra nel Registro come quarta sorgente, ma non
 * nasce da un ordine: vive in `manual_receipts`. Si allarga quindi **il tipo
 * dell'origine della riga**, non l'enum del database — mettere in
 * `sales_orders.source` un valore che quella tabella non avrà **mai** sarebbe
 * scrivere una cosa falsa per comodità di tipizzazione.
 *
 * ⚠️ **E non si riusa `store`.** La classificazione (Fisico/POS · VestiFlow) è
 * la stessa della Vendita al banco, ed è giusto che lo sia: sono entrambe
 * vendite fisiche registrate da VestiFlow, e chi filtra quella coppia le vuole
 * tutte e due. Ma l'**origine** deve restare distinta, o nel Registro e
 * nell'export le due cose diventerebbero indistinguibili — una registrazione
 * digitata a mano comparirebbe come una vendita battuta al banco.
 */

/** L'origine di una riga del Registro: quella dell'ordine, o la quarta. */
export const MANUAL_RECEIPT_ORIGIN = 'manual_receipt' as const;

/**
 * ⚠️ Il `Record` sotto è esaustivo su **questa** unione: aggiungere un valore a
 * `SalesOrderSource` — o una quinta origine qui — non compila finché qualcuno
 * non dichiara se entra nel Registro e con quale classificazione.
 */
export type CorrispettivoOrigin = PrismaSource | typeof MANUAL_RECEIPT_ORIGIN;

export const CORRISPETTIVI_AMBITO = ['all', 'online', 'fisico_pos'] as const;
export type CorrispettiviAmbito = (typeof CORRISPETTIVI_AMBITO)[number];

export const CORRISPETTIVI_CANALE = ['all', 'shopify', 'vestiflow'] as const;
export type CorrispettiviCanale = (typeof CORRISPETTIVI_CANALE)[number];

/** Come una riga ammessa si classifica nelle due dimensioni del Registro. */
export interface CorrispettivoClassification {
  readonly ambito: Exclude<CorrispettiviAmbito, 'all'>;
  readonly canale: Exclude<CorrispettiviCanale, 'all'>;
}

/**
 * `null` = **questa origine non è una sorgente di corrispettivi**, e la sua
 * assenza dal Registro è una decisione, non una dimenticanza.
 *
 * ⚠️ Il `Record` è **esaustivo di proposito**: un'origine nuova non compila
 * finché qualcuno non dichiara se entra — e con quale classificazione — oppure
 * se non è pertinente. È l'unico punto in cui quella scelta si può prendere,
 * ed è il motivo per cui questo file esiste separato dalle query.
 */
const REGISTRO_BY_SOURCE: Readonly<Record<CorrispettivoOrigin, CorrispettivoClassification | null>> =
  {
    [PrismaSource.shopify_online]: { ambito: 'online', canale: 'shopify' },
    [PrismaSource.shopify_pos]: { ambito: 'fisico_pos', canale: 'shopify' },
    [PrismaSource.store]: { ambito: 'fisico_pos', canale: 'vestiflow' },
    // Impegno commerciale, non vendita: vedi il commento in testa al file.
    [PrismaSource.manual]: null,
    // Registrazione economica digitata dall'operatore (`10` §12): vendita
    // fisica, registrata in VestiFlow. Stessa coppia della Vendita al banco,
    // origine distinta — vedi la nota in testa.
    [MANUAL_RECEIPT_ORIGIN]: { ambito: 'fisico_pos', canale: 'vestiflow' },
  };

/** Vero se l'origine è una di quelle che vivono in `sales_orders.source`. */
function isSalesOrderSource(origin: CorrispettivoOrigin): origin is PrismaSource {
  return origin !== MANUAL_RECEIPT_ORIGIN;
}

/** Tutte le origini che sono corrispettivi, la quarta inclusa. */
export const CORRISPETTIVI_ORIGINS: readonly CorrispettivoOrigin[] = (
  Object.keys(REGISTRO_BY_SOURCE) as CorrispettivoOrigin[]
).filter((origin) => REGISTRO_BY_SOURCE[origin] != null);

/**
 * Le sole origini che sono `SalesOrderSource`. Serve ai filtri Prisma su
 * `sales_orders`: passare lì dentro `manual_receipt` non compilerebbe, ed è
 * esattamente la separazione che si vuole.
 */
export const CORRISPETTIVI_SOURCES: readonly PrismaSource[] =
  CORRISPETTIVI_ORIGINS.filter(isSalesOrderSource);

export function classificationOfSource(
  source: CorrispettivoOrigin,
): CorrispettivoClassification | null {
  return REGISTRO_BY_SOURCE[source];
}

export function isCorrispettivoSource(source: CorrispettivoOrigin): boolean {
  return REGISTRO_BY_SOURCE[source] != null;
}

/**
 * Come si chiama l'origine di una riga, con le stesse parole della schermata.
 *
 * ⚠️ Uno `switch` **senza ramo predefinito**, come `sourceDisplayLabel` da cui
 * deriva: un'origine nuova non compila finché non ha un nome. Un ramo
 * predefinito se la prenderebbe in silenzio, e in un file che va al
 * commercialista un'etichetta sbagliata non la vede nessuno.
 */
export function originDisplayLabel(origin: CorrispettivoOrigin): string {
  switch (origin) {
    case MANUAL_RECEIPT_ORIGIN:
      return 'Corrispettivo manuale';
    case PrismaSource.manual:
    case PrismaSource.shopify_online:
    case PrismaSource.shopify_pos:
    case PrismaSource.store:
      return sourceDisplayLabel(origin);
  }
}

/**
 * Le origini che sopravvivono a una coppia ambito+canale.
 *
 * **Restituisce sempre un elenco, mai `undefined`.** Anche «tutti + tutti»
 * filtra: filtra via ciò che non è un corrispettivo. Prima tornava `undefined`
 * per «non restringere», e con quella forma un Ordine cliente manuale entrava
 * nel Registro — **misurato: due ordini per 229,36 €**.
 *
 * Un insieme **vuoto** resta un risultato legittimo (es. Online + VestiFlow,
 * che oggi non esiste): la lista resta vuota, non mostra tutto.
 */
export function originsFor(
  ambito: CorrispettiviAmbito | undefined,
  canale: CorrispettiviCanale | undefined,
  origine?: string,
): CorrispettivoOrigin[] {
  const wantsAmbito = ambito != null && ambito !== 'all';
  const wantsCanale = canale != null && canale !== 'all';
  const wantsOrigine = origine != null && origine !== 'all' && origine !== '';
  return CORRISPETTIVI_ORIGINS.filter((origin) => {
    const classification = REGISTRO_BY_SOURCE[origin];
    if (!classification) {
      return false;
    }
    return (
      (!wantsAmbito || classification.ambito === ambito) &&
      (!wantsCanale || classification.canale === canale) &&
      (!wantsOrigine || origin === origine)
    );
  });
}

/** Come sopra, ristretto alle origini interrogabili su `sales_orders`. */
export function sourcesFor(
  ambito: CorrispettiviAmbito | undefined,
  canale: CorrispettiviCanale | undefined,
  origine?: string,
): PrismaSource[] {
  return originsFor(ambito, canale, origine).filter(isSalesOrderSource);
}

/** Un filtro che porta un insieme di origini, o i vecchi vincoli singoli. */
export interface OriginSelection {
  readonly origini?: readonly string[];
  readonly ambito?: CorrispettiviAmbito;
  readonly canale?: CorrispettiviCanale;
  readonly origine?: string;
  /** Contraddizione di un vecchio indirizzo: zero righe, non «tutte». */
  readonly nessunRisultato?: boolean;
}

/**
 * Le origini che una richiesta seleziona davvero (`docs/10` §16).
 *
 * ⚠️ **Insieme assente o vuoto = nessuna restrizione = TUTTE.** Non è una
 * comodità: è la regola uniforme fra interfaccia, indirizzo, parser, API e
 * riepilogo, e qui è il punto in cui potrebbe rompersi per distrazione —
 * restituire l'insieme vuoto significherebbe «nessuna origine», cioè nessuna
 * riga, dove l'utente non ha chiesto niente.
 *
 * Il **plurale vince** sui vecchi vincoli: chi lo manda ha già la forma
 * definitiva, e i singolari restano solo per gli indirizzi salvati.
 */
export function effectiveOrigins(selection: OriginSelection): CorrispettivoOrigin[] {
  /*
    ⚠️ **Qui l'insieme vuoto è la risposta GIUSTA, ed è l'unico punto.**

    Le due letture opposte dell'insieme vuoto convivono in tutto il sistema
    solo perché non si incontrano mai: sul filo e nei filtri «vuoto» significa
    «nessuna restrizione», e a dire «niente» è `nessunRisultato`, che ha un
    campo suo. Qui, all'ultimo passo prima di Prisma, quel campo si traduce
    nell'unica forma che il database capisce come «nessuna riga»: un `in` senza
    valori.

    È la traduzione, non l'ambiguità: chi legge una riga sopra sa ancora quale
    dei due significati aveva in mano.
  */
  if (selection.nessunRisultato) {
    return [];
  }

  const insieme = selection.origini;
  if (insieme && insieme.length > 0) {
    return CORRISPETTIVI_ORIGINS.filter((origin) => insieme.includes(origin));
  }
  return originsFor(selection.ambito, selection.canale, selection.origine);
}

/** Le sole origini interrogabili su `sales_orders`. */
export function salesOrderSourcesOf(origins: readonly CorrispettivoOrigin[]): PrismaSource[] {
  return origins.filter(isSalesOrderSource);
}

/** La quarta sorgente sopravvive ai filtri di classificazione? */
export function includesManualReceipts(
  ambito: CorrispettiviAmbito | undefined,
  canale: CorrispettiviCanale | undefined,
  origine?: string,
): boolean {
  return originsFor(ambito, canale, origine).includes(MANUAL_RECEIPT_ORIGIN);
}

/**
 * I valori ammessi dal filtro **Origine**, `all` compreso.
 *
 * ⚠️ **È la terza dimensione, e non è un sinonimo delle prime due.** Ambito dice
 * *come* è arrivata la vendita, Canale *chi* l'ha raccolta, Origine *da cosa*
 * nasce la riga. Fino al 17/08/2026 le prime due non bastavano a isolare il
 * Corrispettivo manuale: condivide con la Vendita al banco la coppia
 * Fisico/POS · VestiFlow, quindi chiedendo quella coppia si ottenevano
 * entrambe.
 *
 * I valori sono **quelli che esistono davvero** — derivati da
 * `CORRISPETTIVI_ORIGINS`, non un elenco scritto a mano che può divergere.
 */
export const CORRISPETTIVI_ORIGINE_VALUES: readonly string[] = [
  'all',
  ...CORRISPETTIVI_ORIGINS,
];

export function toAmbito(value?: string): CorrispettiviAmbito | undefined {
  return (CORRISPETTIVI_AMBITO as readonly string[]).includes(value ?? '')
    ? (value as CorrispettiviAmbito)
    : undefined;
}

export function toCanale(value?: string): CorrispettiviCanale | undefined {
  return (CORRISPETTIVI_CANALE as readonly string[]).includes(value ?? '')
    ? (value as CorrispettiviCanale)
    : undefined;
}
