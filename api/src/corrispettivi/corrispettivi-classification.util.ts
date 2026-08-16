import { SalesOrderSource as PrismaSource } from '@prisma/client';

/**
 * Le due dimensioni del Registro Corrispettivi (`11` §5, `10` §3).
 *
 * **Ambito e Canale sono cose diverse e non si mescolano.** Fino al 16/08/2026
 * c'era un filtro solo che li confondeva, con due etichette che dicevano il
 * falso: «Shopify» comprendeva le sole vendite online — anche il POS è Shopify
 * — e «Negozio» indicava lo **Shopify POS**, non la cassa di VestiFlow.
 *
 * | Vendita             | Ambito     | Canale    |
 * | ------------------- | ---------- | --------- |
 * | Vendita al banco    | Fisico/POS | VestiFlow |
 * | Shopify POS         | Fisico/POS | Shopify   |
 * | Shopify ecommerce   | Online     | Shopify   |
 *
 * ⚠️ **Nessuna colonna persistente**: entrambe si derivano dall'**origine**
 * della vendita, che è un fatto scritto alla creazione. Aggiungere due colonne
 * significherebbe due dati da tenere allineati a uno che c'è già.
 */

export const CORRISPETTIVI_AMBITO = ['all', 'online', 'fisico_pos'] as const;
export type CorrispettiviAmbito = (typeof CORRISPETTIVI_AMBITO)[number];

export const CORRISPETTIVI_CANALE = ['all', 'shopify', 'vestiflow'] as const;
export type CorrispettiviCanale = (typeof CORRISPETTIVI_CANALE)[number];

/**
 * **Ambito = come è arrivata la vendita: da un canale online, oppure no.**
 *
 * È la lettura che rende l'asse **totale**, e serve: senza, «Tutti» non
 * sarebbe «Online + Fisico/POS» e una riga sparirebbe da entrambi i filtri
 * restando nel totale — il tipo di incoerenza che un registro non può avere.
 *
 * ⚠️ `manual` è il caso che obbliga a scegliere, e la specifica non lo nomina:
 * è un Ordine cliente digitato a mano, quindi **non online**. Sta con le
 * vendite fisiche perché l'asse separa online da non-online, non «al banco» da
 * «non al banco». Se un giorno servisse distinguerlo, è **questa riga** da
 * cambiare, non la struttura.
 */
const AMBITO_BY_SOURCE: Readonly<Record<PrismaSource, Exclude<CorrispettiviAmbito, 'all'>>> = {
  [PrismaSource.shopify_online]: 'online',
  [PrismaSource.shopify_pos]: 'fisico_pos',
  [PrismaSource.store]: 'fisico_pos',
  [PrismaSource.manual]: 'fisico_pos',
};

/** **Canale = chi ha raccolto la vendita.** Anche qui: un fatto, non uno stato. */
const CANALE_BY_SOURCE: Readonly<Record<PrismaSource, Exclude<CorrispettiviCanale, 'all'>>> = {
  [PrismaSource.shopify_online]: 'shopify',
  [PrismaSource.shopify_pos]: 'shopify',
  [PrismaSource.store]: 'vestiflow',
  [PrismaSource.manual]: 'vestiflow',
};

export function ambitoOfSource(source: PrismaSource): Exclude<CorrispettiviAmbito, 'all'> {
  return AMBITO_BY_SOURCE[source];
}

export function canaleOfSource(source: PrismaSource): Exclude<CorrispettiviCanale, 'all'> {
  return CANALE_BY_SOURCE[source];
}

/**
 * Le origini che sopravvivono a una coppia ambito+canale.
 *
 * Restituisce `undefined` quando entrambi sono «tutti»: chi chiama non deve
 * aggiungere un filtro `source` che non restringe niente — e soprattutto non
 * deve **escludere** origini future non ancora mappate.
 *
 * Un insieme **vuoto** è invece un risultato legittimo (es. Online + VestiFlow,
 * che oggi non esiste): la lista deve restare vuota, non mostrare tutto.
 */
export function sourcesFor(
  ambito: CorrispettiviAmbito | undefined,
  canale: CorrispettiviCanale | undefined,
): PrismaSource[] | undefined {
  const wantsAmbito = ambito != null && ambito !== 'all';
  const wantsCanale = canale != null && canale !== 'all';
  if (!wantsAmbito && !wantsCanale) {
    return undefined;
  }
  return Object.values(PrismaSource).filter(
    (source) =>
      (!wantsAmbito || ambitoOfSource(source) === ambito) &&
      (!wantsCanale || canaleOfSource(source) === canale),
  );
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
