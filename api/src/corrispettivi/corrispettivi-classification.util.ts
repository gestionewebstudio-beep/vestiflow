import { SalesOrderSource as PrismaSource } from '@prisma/client';

/**
 * Chi entra nel Registro Corrispettivi, e come si classifica (`11` §5, `10` §3).
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
 */

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
const REGISTRO_BY_SOURCE: Readonly<Record<PrismaSource, CorrispettivoClassification | null>> = {
  [PrismaSource.shopify_online]: { ambito: 'online', canale: 'shopify' },
  [PrismaSource.shopify_pos]: { ambito: 'fisico_pos', canale: 'shopify' },
  [PrismaSource.store]: { ambito: 'fisico_pos', canale: 'vestiflow' },
  // Impegno commerciale, non vendita: vedi il commento in testa al file.
  [PrismaSource.manual]: null,
};

/** Le origini che sono corrispettivi. Il resto del Registro parte da qui. */
export const CORRISPETTIVI_SOURCES: readonly PrismaSource[] = Object.values(PrismaSource).filter(
  (source) => REGISTRO_BY_SOURCE[source] != null,
);

export function classificationOfSource(
  source: PrismaSource,
): CorrispettivoClassification | null {
  return REGISTRO_BY_SOURCE[source];
}

export function isCorrispettivoSource(source: PrismaSource): boolean {
  return REGISTRO_BY_SOURCE[source] != null;
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
export function sourcesFor(
  ambito: CorrispettiviAmbito | undefined,
  canale: CorrispettiviCanale | undefined,
): PrismaSource[] {
  const wantsAmbito = ambito != null && ambito !== 'all';
  const wantsCanale = canale != null && canale !== 'all';
  return CORRISPETTIVI_SOURCES.filter((source) => {
    const classification = REGISTRO_BY_SOURCE[source];
    if (!classification) {
      return false;
    }
    return (
      (!wantsAmbito || classification.ambito === ambito) &&
      (!wantsCanale || classification.canale === canale)
    );
  });
}

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
