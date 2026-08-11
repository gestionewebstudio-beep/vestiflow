import { DocumentType } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { documentNumberingType, documentNumberingTypes } from './document-type.util';
import { formatDocumentReference } from './document-totals.util';

/**
 * Assegnazione dei numeri progressivi.
 *
 * Il prossimo numero è «il massimo esistente per quella serie/anno + 1», non
 * un contatore autonomo: eliminando i documenti in coda il progressivo scende
 * da solo e il numero liberato viene riusato, mentre i buchi in mezzo restano
 * tali (nessuno li riempie). Il contatore `DocumentSequence` non partecipa più
 * all'assegnazione — restava alto anche dopo le cancellazioni.
 *
 * Le tre fonti hanno tracciati diversi: i documenti di registro hanno una
 * colonna numerica, ordini fornitore e ordini cliente conservano solo il
 * riferimento testuale (es. «OF-2026-0042»), da cui il numero va estratto.
 */
export type DocumentNumberSource = 'document' | 'supplier_order' | 'sales_order';

/** Tabella che possiede il numero del tipo: ordini a parte, il resto documenti. */
export function numberSourceForType(type: DocumentType): DocumentNumberSource {
  if (type === DocumentType.customer_order) {
    return 'sales_order';
  }
  if (type === DocumentType.supplier_order) {
    return 'supplier_order';
  }
  return 'document';
}

export interface NextNumberInput {
  readonly tx: Prisma.TransactionClient;
  readonly tenantId: string;
  /** Tipo documento; internamente si usa quello che possiede il numeratore. */
  readonly type: DocumentType;
  /** null = senza serie. */
  readonly series: string | null;
  readonly source: DocumentNumberSource;
  /** Prefisso del riferimento (`PREFISSO[-SERIE]-NUMERO`). */
  readonly prefix?: string;
}

/**
 * Numero più alto già assegnato al contatore (tipo + serie), 0 se vuoto. La
 * partizione è (tenant, tipo, serie): niente anno (il reset annuale si fa con
 * una serie nuova) né sede (attributo di disponibilità, non del progressivo).
 * Ordini cliente e fornitore hanno colonne numeriche dedicate: il massimo si
 * legge dall'aggregato, non più dal parsing del testo.
 */
export async function lastAssignedNumber(input: NextNumberInput): Promise<number> {
  const { tx, tenantId, series, source } = input;

  if (source === 'sales_order') {
    // Solo gli ordini manuali sono numerati internamente (i canali portano il
    // proprio numero e restano con `number` NULL).
    const result = await tx.salesOrder.aggregate({
      _max: { number: true },
      where: { tenantId, source: 'manual', series },
    });
    return result._max?.number ?? 0;
  }

  if (source === 'supplier_order') {
    const result = await tx.supplierOrder.aggregate({
      _max: { number: true },
      where: { tenantId, series },
    });
    return result._max?.number ?? 0;
  }

  const result = await tx.document.aggregate({
    _max: { number: true },
    // `in` e non uguaglianza: la colonna porta il tipo GREZZO, e i tipi che
    // condividono il numeratore vanno letti tutti insieme — altrimenti il
    // massimo vede metà partizione e propone un numero che l'indice unico,
    // partizionato sul numeratore, poi rifiuta.
    where: { tenantId, type: { in: [...documentNumberingTypes(input.type)] }, series },
  });
  return result._max?.number ?? 0;
}

/**
 * Serie del contatore predefinito del tipo (null = senza serie). È la serie
 * assegnata quando la testata non ne sceglie una. Nessun contatore predefinito
 * → senza serie. Usa il tipo che possiede il numeratore (Fattura
 * accompagnatoria → Fattura).
 */
export async function defaultCounterSeries(
  tx: Prisma.TransactionClient,
  tenantId: string,
  type: DocumentType,
): Promise<string | null> {
  const counter = await tx.documentCounter.findFirst({
    where: { tenantId, type: documentNumberingType(type), isDefault: true },
    select: { series: true },
  });
  return counter?.series ?? null;
}

/** Prossimo numero libero del contatore (massimo esistente + 1). */
export async function nextDocumentNumber(input: NextNumberInput): Promise<number> {
  return (await lastAssignedNumber(input)) + 1;
}

/**
 * Serializza l'assegnazione del numero fra operatori concorrenti.
 *
 * «Massimo + 1» letto e scritto da due transazioni contemporanee dà lo stesso
 * numero a entrambe: PostgreSQL in READ COMMITTED non fa vedere all'una la riga
 * non ancora confermata dell'altra. L'indice unico poi ne boccia una — il numero
 * doppio non passa — ma il secondo operatore si ritrova un errore dopo aver
 * finito il lavoro, per una collisione che il sistema poteva evitare da solo.
 *
 * Con questo lock la seconda transazione aspetta qualche millisecondo, poi legge
 * un massimo aggiornato e prende il numero successivo. Il lock è
 * **transazionale**: si rilascia da sé al commit o al rollback, quindi un
 * salvataggio che fallisce non lascia né numeri bruciati né lock appesi — è la
 * stessa ragione per cui non esiste una «prenotazione» del numero, che sarebbe
 * proprio ciò che crea i buchi.
 *
 * La chiave è il singolo contatore (tenant + tipo + serie): due operatori su
 * tipi diversi, o su serie diverse, non si aspettano a vicenda.
 *
 * Va chiamato DENTRO la transazione e PRIMA di leggere il massimo. Stesso
 * meccanismo già usato dal progressivo del codice articolo
 * (`products/article-code.util.ts`).
 */
export async function lockDocumentCounter(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; type: DocumentType; series: string | null },
): Promise<void> {
  // La partizione del numero è (tenant, tipo-che-possiede-il-numeratore, serie):
  // la chiave del lock deve coincidere con quella, o due tipi che condividono il
  // numeratore (Fattura accompagnatoria → Fattura) non si serializzerebbero.
  const key = `${input.tenantId}:${documentNumberingType(input.type)}:${input.series ?? ''}`;
  // Cast ::text obbligatorio: pg_advisory_xact_lock ritorna `void`, che Prisma
  // non sa deserializzare (500 «Failed to deserialize column of type 'void'»).
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('document_number'), hashtext(${key}))::text`;
}

/**
 * Numero e riferimento da assegnare, dato l'eventuale numero scelto a mano
 * dall'operatore. Un numero imposto NON sposta il progressivo della serie: i
 * documenti successivi ripartono dal massimo esistente + 1.
 */
export async function resolveDocumentNumber(
  input: NextNumberInput & { readonly requestedNumber?: number | null },
): Promise<{ number: number; reference: string }> {
  const number =
    input.requestedNumber && input.requestedNumber > 0
      ? input.requestedNumber
      : await nextDocumentNumber(input);
  return {
    number,
    reference: formatDocumentReference(
      (input.prefix ?? 'DOC').trim() || 'DOC',
      input.series,
      number,
    ),
  };
}

/**
 * Errore di numero già preso, con il primo libero da proporre. Il vincolo
 * unico del database resta l'unica verità: due operatori che salvano lo stesso
 * numero nello stesso istante non possono duplicarlo, uno dei due riceve
 * questo conflitto e sceglie se prendere il numero proposto.
 */
export interface DocumentNumberConflict {
  readonly code: 'document_number_taken';
  /**
   * Numero RIFIUTATO: quello che il salvataggio ha tentato di scrivere. È il
   * numero che l'operatore vede in testata, e l'unico che ha senso nominargli.
   */
  readonly number: number;
  readonly nextAvailable: number;
  /** null = senza serie. */
  readonly series: string | null;
}

/**
 * Conflitto da restituire al client: il numero rifiutato e il primo libero
 * della serie. Unico punto in cui si compone il payload, così i flussi
 * (registro, arrivo merce, trasferimento/rettifica) rispondono tutti allo
 * stesso modo.
 *
 * `requestedNumber` è il numero che il salvataggio ha tentato di scrivere, e va
 * passato SEMPRE che lo si conosca. Prima non c'era e il payload dichiarava
 * `nextAvailable - 1`: per un numero assegnato d'ufficio i due coincidono — il
 * server aveva preso «massimo + 1», qualcuno lo ha bruciato, quindi ora quel
 * numero è il massimo — ma per un numero DIGITATO dall'operatore no. Chi digita
 * un numero lo fa per tappare un buco in mezzo alla serie: rispondergli con
 * l'ultimo numero occupato significa nominargli un numero che non ha mai
 * scritto (serie fino a 43, digita il 7, il messaggio parlava del 43).
 *
 * Il fallback resta `nextAvailable - 1` proprio per il caso «numero assegnato
 * d'ufficio», dove è la risposta giusta e il chiamante non ha nulla da passare.
 */
export async function buildDocumentNumberConflict(
  input: NextNumberInput & { readonly requestedNumber?: number | null },
): Promise<DocumentNumberConflict> {
  const nextAvailable = await nextDocumentNumber(input);
  const requested = input.requestedNumber;
  return {
    code: 'document_number_taken',
    number: requested != null && requested > 0 ? requested : nextAvailable - 1,
    nextAvailable,
    series: input.series,
  };
}

/** True se l'errore Prisma è la violazione del vincolo unico sul numero. */
export function isDocumentNumberConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== 'P2002') {
    return false;
  }
  const target = candidate.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((field) => field.includes('number'));
}
