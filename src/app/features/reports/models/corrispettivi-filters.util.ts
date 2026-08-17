import type { ParamMap } from '@angular/router';

import type { CorrispettiviListQuery } from './corrispettivi.model';

/**
 * I filtri del Registro Corrispettivi letti dall'indirizzo, **in un punto solo**.
 *
 * ## Perché esiste
 *
 * Perché non esisteva, e la stampa ne pagava il prezzo. La schermata passava
 * `ambito`, `canale`, `rowType` e `locationId` nell'indirizzo dell'anteprima di
 * stampa; l'anteprima leggeva il periodo e **basta**, più un `onlineOnly` che
 * nessuno mandava più e che l'API non conosce nemmeno — non un filtro
 * sbagliato: un campo inerte, che non arrivava neanche alla richiesta.
 *
 * Il risultato era una stampa che rispondeva a una domanda diversa da quella a
 * schermo: chi guardava «2° trimestre · Fisico/POS · Resi» stampava tutto il
 * trimestre, senza che niente lo segnalasse. Su un registro che va al
 * commercialista è il difetto peggiore — il foglio è plausibile, e nessuno
 * ricontrolla un totale che sembra giusto.
 *
 * ⚠️ **Due letture della stessa cosa divergono sempre**, ed è già successo qui.
 * Chi aggiunge un filtro al Registro lo aggiunge qui, e lo prendono entrambe.
 *
 * ## I filtri sono INSIEMI (`docs/10` §16)
 *
 * Origine, Tipo e Sede sono insiemi, non scelte singole. Il segnale che la
 * scelta singola non bastava era già nel codice dell'API, che calcolava un
 * `rowType` di valore `refunds_and_returns`: una congiunzione inventata come
 * stringa, perché l'enum non poteva esprimere un insieme.
 *
 * **Insieme vuoto = nessuna restrizione = «Tutti».** Uniforme fra interfaccia,
 * indirizzo, parser, API e riepilogo — e da qui discendono le due regole di
 * normalizzazione applicate sotto.
 */

/** Le origini del Registro, con l'ambito e il canale a cui appartengono. */
export interface CorrispettiviOriginDef {
  readonly id: string;
  readonly label: string;
  readonly ambito: 'online' | 'fisico_pos';
  readonly canale: 'shopify' | 'vestiflow';
}

/**
 * Specchio di `REGISTRO_BY_SOURCE` dell'API. Ambito e canale vivono **qui
 * dentro**, come attributi dell'origine, e non come due filtri paralleli: è la
 * decisione del §16 — una sola verità nel filtro, l'insieme delle origini.
 *
 * ⚠️ Il **Corrispettivo manuale sta fra le origini fisiche**, ed è una scelta
 * di dominio dichiarata: serve a recuperare corrispettivi non registrati
 * analiticamente in VestiFlow, tipicamente da una cassa esterna.
 */
export const CORRISPETTIVI_ORIGIN_DEFS: readonly CorrispettiviOriginDef[] = [
  { id: 'shopify_online', label: 'Shopify online', ambito: 'online', canale: 'shopify' },
  { id: 'shopify_pos', label: 'Shopify POS', ambito: 'fisico_pos', canale: 'shopify' },
  { id: 'store', label: 'Vendita al banco', ambito: 'fisico_pos', canale: 'vestiflow' },
  {
    id: 'manual_receipt',
    label: 'Corrispettivo manuale',
    ambito: 'fisico_pos',
    canale: 'vestiflow',
  },
];

export const CORRISPETTIVI_ORIGINI: readonly string[] = CORRISPETTIVI_ORIGIN_DEFS.map((o) => o.id);

/**
 * I tipi di evento selezionabili. Gli **annullamenti restano fuori**: non sono
 * un tipo di riga ma un fatto contato a parte nel riepilogo, perché la vendita
 * che annullano non è mai entrata nel registro (specifica `08` §4). Renderli
 * selezionabili significherebbe mostrare righe con un importo che non deve
 * entrare in nessun totale.
 */
export const CORRISPETTIVI_TIPI: readonly string[] = ['sales', 'returns', 'refunds'];

export interface CorrispettiviFilters {
  /** Origini selezionate. **Vuoto = tutte.** */
  readonly origini: readonly string[];
  /** Tipi di evento selezionati. **Vuoto = tutti.** */
  readonly tipi: readonly string[];
  /** Sedi selezionate. **Vuoto = tutte.** */
  readonly sedi: readonly string[];
  /**
   * ⚠️ **«Nessun risultato», che NON è «nessuna restrizione».**
   *
   * Sono due stati diversi e non possono condividere `[]`. Un vecchio
   * indirizzo poteva **contraddirsi** — ambito, canale e origine erano filtri
   * indipendenti — e `?ambito=online&origine=store` rendeva zero righe. Con la
   * convenzione «vuoto = tutti», tradurlo in un insieme vuoto direbbe
   * l'opposto: l'intero registro. E far vincere il vincolo più fine
   * **allargherebbe** comunque il sottoinsieme, che è ciò che la compatibilità
   * deve impedire.
   *
   * Questo booleano è la rappresentazione minima della differenza. **La UI non
   * può produrlo**: con Ambito ridotto a scorciatoia sull'insieme Origine
   * (§16), la contraddizione non è più esprimibile. Serve solo a leggere gli
   * indirizzi salvati, e con loro morirà.
   */
  readonly nessunRisultato: boolean;
}

/**
 * Le origini di un ambito — la **scorciatoia**, non un filtro (§16).
 *
 * Ambito non viaggia più come dimensione autonoma: con Origine a insieme era
 * ridondante, e soprattutto poteva **contraddirla** — «Ambito: Online +
 * Origine: Vendita al banco» è un insieme vuoto, e l'operatore vedeva zero
 * righe senza saperne il motivo. Qui è solo il comando che inizializza una
 * selezione, che poi l'operatore affina liberamente.
 */
export function originiPerAmbito(ambito: 'all' | 'online' | 'fisico_pos'): readonly string[] {
  if (ambito === 'all') return [];
  return CORRISPETTIVI_ORIGIN_DEFS.filter((o) => o.ambito === ambito).map((o) => o.id);
}

/**
 * ⚠️ **Un insieme che contiene TUTTI i valori si normalizza a vuoto.**
 *
 * Senza, `origini=a,b,c,d` e l'assenza del parametro sarebbero due scritture
 * della stessa domanda — quindi due indirizzi diversi per la stessa schermata,
 * che è come nascono le divergenze fra stampa ed elenco che questa util esiste
 * per impedire.
 */
function normalizza(valori: readonly string[], universo: readonly string[]): readonly string[] {
  const scelti = universo.filter((v) => valori.includes(v));
  return scelti.length === universo.length ? [] : scelti;
}

/**
 * Legge un parametro a lista (`a,b,c`).
 *
 * Con un `universo` noto tiene solo i valori che esistono davvero e normalizza
 * l'insieme pieno a vuoto. Senza — è il caso delle **sedi**, i cui
 * identificativi dipendono dal tenant e questa util non li conosce — si tiene
 * ciò che l'indirizzo porta: a scartare gli identificativi inesistenti è l'API,
 * che è l'unica a sapere quali siano.
 */
function leggiInsieme(
  params: ParamMap,
  nome: string,
  universo?: readonly string[],
): readonly string[] | null {
  const grezzo = params.get(nome);
  if (grezzo === null) return null;
  const valori = grezzo
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
  return universo ? normalizza(valori, universo) : [...new Set(valori)];
}

/**
 * ⚠️ **I tre parametri di origine si convertono INSIEME, non uno per uno.**
 *
 * Ambito, canale e origine si combinavano per **intersezione** — è ciò che fa
 * `sourcesFor(ambito, canale, origine)` sull'API — e tradurli separatamente per
 * poi unire i risultati darebbe un insieme **più largo** di quello che
 * l'indirizzo salvato descriveva: `?ambito=fisico_pos&canale=shopify` vale
 * `{shopify_pos}`, non i quattro elementi che la lettura ingenua metterebbe
 * insieme.
 *
 * È un difetto che nessun test avrebbe visto, perché l'indirizzo continua a
 * funzionare: risponde solo a una domanda diversa.
 */
function originiDaiVecchiParametri(params: ParamMap): {
  origini: readonly string[];
  nessunRisultato: boolean;
} {
  const ambito = params.get('ambito');
  const canale = params.get('canale');
  const origine = params.get('origine');

  const scelte = CORRISPETTIVI_ORIGIN_DEFS.filter(
    (o) =>
      (ambito === null || ambito === 'all' || o.ambito === ambito) &&
      (canale === null || canale === 'all' || o.canale === canale) &&
      (origine === null || origine === 'all' || o.id === origine),
  ).map((o) => o.id);

  /*
    ⚠️ **L'intersezione VERAMENTE vuota è «nessun risultato», non «tutti».**

    Un vincolo era presente e nessuna origine lo soddisfa: l'indirizzo rendeva
    zero righe, e deve continuare a renderne zero. Riportarlo come `[]` direbbe
    l'opposto — «nessuna restrizione» — e mostrerebbe l'intero registro.

    ⚠️ E nemmeno vale far vincere il vincolo più fine: `?ambito=online&
    origine=store` diventerebbe «tutte le Vendite al banco», cioè un
    sottoinsieme più LARGO di quello che l'indirizzo descriveva. La
    compatibilità che si sta preservando è proprio quella.
  */
  const qualcheVincolo =
    (ambito !== null && ambito !== 'all') ||
    (canale !== null && canale !== 'all') ||
    (origine !== null && origine !== 'all');

  return {
    origini: normalizza(scelte, CORRISPETTIVI_ORIGINI),
    nessunRisultato: qualcheVincolo && scelte.length === 0,
  };
}

/**
 * I tipi dai vecchi parametri. `refundsOnly` era già una congiunzione — «resi
 * **e** rimborsi» — travestita da booleano: qui diventa ciò che è sempre stato.
 */
function tipiDaiVecchiParametri(params: ParamMap): readonly string[] {
  const rowType = params.get('rowType');
  if (rowType !== null && CORRISPETTIVI_TIPI.includes(rowType)) {
    return [rowType];
  }
  if (params.get('refundsOnly') !== null) {
    return normalizza(['returns', 'refunds'], CORRISPETTIVI_TIPI);
  }
  return [];
}

function sediDaiVecchiParametri(params: ParamMap): readonly string[] {
  const legacy = params.get('locationId');
  return legacy !== null && legacy !== 'all' ? [legacy] : [];
}

/** I filtri correnti: prima il plurale, poi i vecchi parametri come ripiego. */
export function parseCorrispettiviFilters(params: ParamMap): CorrispettiviFilters {
  const plurale = leggiInsieme(params, 'origini', CORRISPETTIVI_ORIGINI);
  // Il plurale non può contraddirsi: è un insieme, non due vincoli incrociati.
  const daVecchi = plurale === null ? originiDaiVecchiParametri(params) : null;

  return {
    origini: plurale ?? daVecchi!.origini,
    tipi: leggiInsieme(params, 'tipi', CORRISPETTIVI_TIPI) ?? tipiDaiVecchiParametri(params),
    sedi: leggiInsieme(params, 'sedi') ?? sediDaiVecchiParametri(params),
    nessunRisultato: daVecchi?.nessunRisultato ?? false,
  };
}

/**
 * Gli stessi filtri nella forma che il service manda all'API.
 *
 * ⚠️ **Codice con una SCADENZA.** L'API oggi conosce solo i parametri singolari,
 * quindi qui gli insiemi si traducono all'indietro. Funziona perché in questo
 * passo tutti gli insiemi raggiungibili sono ancora esprimibili: la UI è a
 * scelta singola, e l'unico insieme a due elementi che può arrivare —
 * `{returns, refunds}`, dal vecchio `refundsOnly` — si riscrive esattamente
 * come `refundsOnly`.
 *
 * **Nel momento in cui la UI diventa a spunte questa traduzione deve essere già
 * sparita**, sostituita dai parametri plurali sull'API — e non è una cautela
 * generica: la traduzione è **esatta solo per gli insiemi che i vecchi
 * parametri sapevano descrivere**, cioè quelli che condividono un ambito o un
 * canale. `{shopify_pos, store}` no: i due canali differiscono, il canale
 * uscirebbe `all` e l'API renderebbe anche il Corrispettivo manuale. Oggi
 * quell'insieme non è raggiungibile; il giorno delle spunte lo è, e il filtro
 * degraderebbe in silenzio — lo stesso difetto di `onlineOnly` che ha reso
 * necessaria questa util.
 *
 * ⚠️ **Insieme vuoto = filtro OMESSO**, mai passato vuoto. Su un `in: []` di
 * Prisma «vuoto» non significa «tutti»: significa **niente**, ed è il modo più
 * facile di trasformare «Tutti» in «nessuna riga».
 */
export function corrispettiviFiltersToQuery(
  filters: CorrispettiviFilters,
): Pick<CorrispettiviListQuery, 'ambito' | 'canale' | 'origine' | 'rowType' | 'locationId'> {
  /*
    ⚠️ **La contraddizione si RIPRODUCE, non si risolve.**

    Zero righe è ciò che quell'indirizzo rendeva, e ciò che deve continuare a
    rendere: si rimandano all'API due vincoli che si negano, e l'intersezione
    che già calcola resta vuota. Non è un espediente — è esattamente il
    percorso di prima, lasciato intatto.

    ⚠️ **Quando l'API parlerà il plurale, questo NON diventa un `origini`
    vuoto.** Sarebbe caricare l'array vuoto di due significati opposti — «tutti»
    e «niente» — cioè ricreare sul filo esattamente l'ambiguità che questo
    booleano esiste per sciogliere, e nel punto in cui è più difficile
    accorgersene. La regola resta una sola, ovunque:

        insieme vuoto o parametro assente  →  nessuna restrizione  →  TUTTI
        nessunRisultato                    →  contraddizione       →  ZERO

    Il flag sopravvive quindi fino a dove il dataset si può interrompere: o un
    parametro esplicito suo sull'API, o un corto circuito nel service prima
    della richiesta. Mai travestito da insieme.
  */
  if (filters.nessunRisultato) {
    return {
      ambito: 'online',
      canale: 'all',
      origine: 'store',
      rowType: undefined,
      locationId: undefined,
    };
  }

  return {
    ambito: ambitoEsprimibile(filters.origini),
    canale: canaleEsprimibile(filters.origini),
    origine: filters.origini.length === 1 ? filters.origini[0] : undefined,
    rowType: filters.tipi.length === 1 ? filters.tipi[0] : undefined,
    locationId: filters.sedi.length === 1 ? filters.sedi[0] : undefined,
  };
}

/**
 * Il solo valore di un insieme, se ne ha esattamente uno.
 *
 * Serve finché i menu sono a scelta singola: un insieme di uno è ciò che un
 * menu sa mostrare, tutto il resto è «Tutti». Sparisce con le spunte, insieme
 * alla traduzione all'indietro.
 */
export function soloValore(insieme: readonly string[]): string | undefined {
  return insieme.length === 1 ? insieme[0] : undefined;
}

/** L'ambito che descrive esattamente l'insieme, se ce n'è uno. */
export function ambitoEsprimibile(origini: readonly string[]): 'all' | 'online' | 'fisico_pos' {
  if (origini.length === 0) return 'all';
  const ambiti = new Set(origini.map((id) => defOf(id)?.ambito));
  return ambiti.size === 1 ? [...ambiti][0]! : 'all';
}

/** Il canale che descrive esattamente l'insieme, se ce n'è uno. */
export function canaleEsprimibile(origini: readonly string[]): 'all' | 'shopify' | 'vestiflow' {
  if (origini.length === 0) return 'all';
  const canali = new Set(origini.map((id) => defOf(id)?.canale));
  return canali.size === 1 ? [...canali][0]! : 'all';
}

function defOf(id: string): CorrispettiviOriginDef | undefined {
  return CORRISPETTIVI_ORIGIN_DEFS.find((o) => o.id === id);
}
