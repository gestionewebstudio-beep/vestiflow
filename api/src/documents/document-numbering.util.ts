// `Prisma` serve come VALORE, non solo come tipo: `Prisma.sql` compone i
// frammenti della query del §2 mantenendoli parametrizzati.
import { DocumentType, Prisma } from '@prisma/client';

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

/**
 * «Senza serie» arriva in quattro forme — assente, `null`, stringa vuota,
 * spazi — e sono la stessa cosa: il contatore senza serie, che nel database
 * è `series IS NULL`. Chi confronta la forma sbagliata non trova niente, e
 * **non trovare niente non somiglia a un errore**: somiglia a «va tutto bene».
 *
 * È il modo in cui il controllo cronologico (§4) è nato cieco proprio sulla
 * partizione più usata: la maschera manda `series=''`, la query chiedeva
 * `series = ''`, e nessun documento senza serie è mai stato guardato. Il
 * salvataggio la regola ce l'aveva — scritta a mano, `(series ?? '').trim()
 * || null`, in dodici punti diversi.
 */
export function serieCanonica(series: string | null | undefined): string | null {
  return (series ?? '').trim() || null;
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
  /**
   * Data del documento che si sta creando: il perno della regola del §2 (la
   * proposta è il primo libero **dopo i documenti di data anteriore**).
   *
   * ⚠️ **Oggi arriva fin qui e non viene ancora usata.** L'implementazione della
   * regola è ferma al bivio descritto nel §2 della specifica: la query per data
   * non è esprimibile in Prisma e come SQL grezzo la suite attuale non sa
   * verificarla — i doppioni di prova osservano `document.aggregate`. Il campo
   * resta perché i chiamanti lo passano già: quando il bivio è sciolto, la
   * regola si accende in un punto solo.
   */
  readonly documentDate?: Date;
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
  // Filtro per data della regola del §2: entrano nel massimo solo i documenti
  // di un giorno PRECEDENTE.
  //
  // Senza data si usa **oggi**, non «tutti»: serve alla colonna «prossimo
  // numero» dei Numeratori, dove una data del documento non esiste e non può
  // esistere, e mostrando il primo libero a partire da oggi coincide con quello
  // che l'operatore vedrà aprendo un documento due secondi dopo.
  const primaDi = inizioGiornoUtc(input.documentDate ?? new Date());

  if (source === 'sales_order') {
    // Solo gli ordini manuali sono numerati internamente (i canali portano il
    // proprio numero e restano con `number` NULL).
    const result = await tx.salesOrder.aggregate({
      _max: { number: true },
      where: {
        tenantId,
        source: 'manual',
        series,
        placedAt: { lt: primaDi },
      },
    });
    return result._max?.number ?? 0;
  }

  if (source === 'supplier_order') {
    const result = await tx.supplierOrder.aggregate({
      _max: { number: true },
      where: { tenantId, series, orderDate: { lt: primaDi } },
    });
    return result._max?.number ?? 0;
  }

  const result = await tx.document.aggregate({
    _max: { number: true },
    // `in` e non uguaglianza: la colonna porta il tipo GREZZO, e i tipi che
    // condividono il numeratore vanno letti tutti insieme — altrimenti il
    // massimo vede metà partizione e propone un numero che l'indice unico,
    // partizionato sul numeratore, poi rifiuta.
    where: {
      tenantId,
      type: { in: [...documentNumberingTypes(input.type)] },
      series,
      documentDate: { lt: primaDi },
    },
  });
  return result._max?.number ?? 0;
}

/**
 * La regola confronta i GIORNI, non gli istanti: «data strettamente anteriore»
 * significa «di un giorno precedente». Le date della testata arrivano già come
 * mezzanotte UTC del giorno scelto; qui ci si riporta anche il valore
 * predefinito (`new Date()`), che altrimenti farebbe rientrare in **m** i
 * documenti di oggi e proporrebbe un numero diverso da quello che la testata
 * mostrerà due secondi dopo.
 */
function inizioGiornoUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/**
 * **Il primo numero libero maggiore di `m`** — il secondo passo della regola del
 * §2, e l'unico che Prisma non sa esprimere.
 *
 * Non è «m + 1»: se `m + 1` è già occupato — tipicamente da un documento datato
 * avanti — si scavalca la corsa dei numeri contigui e si prende il primo buco
 * dopo di essa. È così che il riempimento dei buchi smette di essere un caso
 * speciale: è questa stessa regola vista da un'altra angolazione.
 *
 * **Perché in SQL grezzo, e perché una query sola.** Gira DENTRO l'advisory
 * lock, dove gli operatori si aspettano a vicenda: l'elenco dei numeri non si
 * materializza mai — né qui né in JavaScript — e la ricerca si ferma alla prima
 * riga utile (`ORDER BY … LIMIT 1`), sotto l'indice `*_numbering_date_idx`
 * (migration `20260813120000`).
 */
async function primoNumeroLibero(input: NextNumberInput, m: number): Promise<number> {
  const { tx, tenantId, series, source } = input;

  /** La tabella che possiede il numero, con l'alias del punto in cui serve. */
  const tabella = (alias: string): Prisma.Sql =>
    source === 'sales_order'
      ? Prisma.raw(`sales_orders ${alias}`)
      : source === 'supplier_order'
        ? Prisma.raw(`supplier_orders ${alias}`)
        : Prisma.raw(`documents ${alias}`);

  /**
   * La partizione del contatore. `series` null è un VALORE — la serie vuota, che
   * è la maggioranza delle righe — non «qualunque»: scritto come uguaglianza non
   * aggancerebbe mai quelle righe.
   */
  const partizione = (alias: string): Prisma.Sql => {
    const a = Prisma.raw(alias);
    const serie =
      series === null ? Prisma.sql`${a}.series IS NULL` : Prisma.sql`${a}.series = ${series}`;
    const tipi =
      source === 'document'
        ? Prisma.sql`AND ${a}.type = ANY(${[
            ...documentNumberingTypes(input.type),
          ]}::"DocumentType"[])`
        : Prisma.empty;
    const manuali = source === 'sales_order' ? Prisma.sql`AND ${a}.source = 'manual'` : Prisma.empty;
    return Prisma.sql`${a}.tenant_id = ${tenantId}::uuid ${tipi} ${manuali} AND ${serie} AND ${a}.number IS NOT NULL`;
  };

  const righe = await tx.$queryRaw<{ libero: number | bigint | null }[]>`
    SELECT CASE
      -- Il numero dopo m è libero: è quello, e non si scorre niente.
      WHEN NOT EXISTS (
        SELECT 1 FROM ${tabella('a')} WHERE ${partizione('a')} AND a.number = ${m} + 1
      ) THEN ${m} + 1
      -- Occupato: si scavalca la corsa dei numeri contigui e si prende il primo
      -- buco dopo di essa. ORDER BY + LIMIT 1 si ferma alla prima riga utile.
      ELSE COALESCE((
        SELECT d.number + 1 FROM ${tabella('d')}
        WHERE ${partizione('d')} AND d.number > ${m}
          AND NOT EXISTS (
            SELECT 1 FROM ${tabella('x')}
            WHERE ${partizione('x')} AND x.number = d.number + 1
          )
        ORDER BY d.number
        LIMIT 1
      ), ${m} + 1)
    END AS libero
  `;
  return Number(righe[0]?.libero ?? m + 1);
}

/**
 * Serie assegnata quando la testata non ne sceglie una (null = senza serie).
 * Usa il tipo che possiede il numeratore (Fattura accompagnatoria → Fattura).
 *
 * **La sede vale anche qui, non solo nella tendina** (specifica numerazione
 * §1-bis). Un contatore legato a una sede è usabile SOLO lì; uno senza sede
 * ovunque. Fino al 13/08/2026 questa funzione cercava il predefinito senza
 * guardare la sede, e non la accettava nemmeno come parametro: con NAP legato a
 * Napoli e marcato predefinito, un operatore di Milano — a cui la tendina NAP
 * non l'aveva nemmeno mostrata — salvava un documento con serie NAP. La tendina
 * diceva il vero, il salvataggio no.
 *
 * Quando il predefinito non è compatibile con la sede vale la regola già
 * stabilita per la proposta: **un solo contatore disponibile → quello; più
 * d'uno → nessuna serie**, e la sceglie l'operatore.
 *
 * `locationId` assente o `null` significa «documento senza sede»: restano
 * disponibili i soli contatori senza sede. È il caso della Registrazione
 * fattura fornitore, che il campo Sede non ce l'ha per decisione — la fattura è
 * intestata all'azienda, non alla sede.
 */
export async function defaultCounterSeries(
  tx: Prisma.TransactionClient,
  tenantId: string,
  type: DocumentType,
  locationId?: string | null,
): Promise<string | null> {
  // Stesso filtro della tendina (`document-counters.service.ts`): quella sede
  // più quelle senza sede. Uguaglianza esatta, nessuna gerarchia.
  const available = await tx.documentCounter.findMany({
    where: {
      tenantId,
      type: documentNumberingType(type),
      OR: [{ locationId: null }, ...(locationId ? [{ locationId }] : [])],
    },
    select: { series: true, isDefault: true },
  });

  const preferred = available.find((counter) => counter.isDefault);
  if (preferred) {
    return preferred.series ?? null;
  }
  // Il predefinito esiste ma è di un'altra sede: non si applica. Con un solo
  // contatore disponibile la scelta è obbligata, con più d'uno non è nostra.
  if (available.length === 1) {
    return available[0]?.series ?? null;
  }
  return null;
}

/**
 * **Il prossimo numero da proporre.**
 *
 * ⚠️ **Oggi è ancora «massimo + 1»**, non la regola del §2, che dice:
 *
 * > Sia **m** il numero più alto fra i documenti dello stesso contatore con
 * > data **strettamente anteriore** a quella del documento che sto creando.
 * > Si propone il **primo numero libero maggiore di m**.
 *
 * Una formulazione sola, e il riempimento dei buchi non è un caso speciale: è
 * questa stessa regola vista da un'altra angolazione.
 *
 * **Perché non basta «l'ultimo più uno».** Ultimo preventivo 10; ne prepari uno
 * datato la settimana prossima e gli dai il 15; oggi ne apri un altro. Con
 * `max+1` la proposta è 16 — il documento futuro ha bruciato cinque numeri, e
 * da lì tutta la numerazione corrente parte da dopo di lui. Con questa regola è
 * 11: i documenti datati avanti non spostano la proposta di oggi.
 *
 * **Anteriore, non «uguale o anteriore».** I documenti dello STESSO giorno non
 * entrano in m: è ciò che permette di tappare un buco fra due documenti di pari
 * data senza creare un'anomalia cronologica.
 *
 * **m è il numero più ALTO fra gli anteriori, non l'ultimo per data.** Una serie
 * può contenere un documento fuori posto (il §4 avvisa, non blocca): partendo
 * dall'ultimo per data si proporrebbe un numero che nasce già in violazione.
 *
 * **Libero rispetto a TUTTA la partizione**, non solo agli anteriori: un numero
 * occupato da un documento datato avanti fa da tetto finché non ci si arriva
 * con la data, e quando lo spazio sotto si esaurisce la proposta **scavalca e
 * prosegue** — l'anomalia l'ha creata chi ha datato avanti, non il sistema.
 *
 * **Senza data si usa oggi.** Serve alla colonna «prossimo numero» dei
 * Numeratori, una schermata di configurazione dove una data del documento non
 * esiste e non può esistere: mostrando il primo libero a partire da oggi
 * coincide con quello che l'operatore vedrà aprendo un documento due secondi
 * dopo.
 *
 * **Due passi, e sono divisi apposta.** Il massimo resta su `lastAssignedNumber`
 * — aggregato Prisma, col filtro per data — perché è la parte che i test sanno
 * osservare: continuano a vedere la partizione e ora anche la data. Solo il
 * «primo libero > m» va in SQL grezzo, dove Prisma non arriva.
 *
 * Il §0 chiedeva «una query sola», ma la ragione che dava è **mai materializzare
 * l'elenco dei numeri**: due letture sotto indice la rispettano, e mantengono
 * verificabile ciò che oggi è verificato invece di trasformare i test in
 * guardie di stringhe SQL (scelta del 13/08/2026).
 */
export async function nextDocumentNumber(input: NextNumberInput): Promise<number> {
  const m = await lastAssignedNumber(input);
  return primoNumeroLibero(input, m);
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
/**
 * I modelli che portano un numero documento, e le cui violazioni di unicità
 * sono quindi conflitti di numerazione. Sono i nomi Prisma, non quelli SQL.
 */
const MODELLI_NUMERATI = ['Document', 'SalesOrder', 'SupplierOrder'] as const;

export function isDocumentNumberConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown; modelName?: unknown };
  };
  if (candidate.code !== 'P2002') {
    return false;
  }
  // Si riconosce dal MODELLO, non dalle colonne — e l'11/08/2026 questa
  // differenza è costata il meccanismo del §3 su ogni tipo documento.
  //
  // ⚠️ Perché il nome delle colonne non è utilizzabile. Fino al 13/08 qui si
  // cercava la stringa «number» dentro `meta.target`. Funzionava finché
  // l'indice unico era a colonne semplici; poi la migration `20260811090000`
  // l'ha reso un indice di ESPRESSIONE — `(tenant_id, CASE(type), series,
  // number)`, per far condividere il numeratore a Fattura e Accompagnatoria —
  // e Prisma, che un'espressione non sa nominarla, ha smesso di elencare le
  // colonne: `meta.target` diventa `["tenant_id,"]`, con la virgola orfana al
  // posto dell'espressione. La parola «number» non compare più, il conflitto
  // non veniva riconosciuto, e all'operatore arrivava un **500** invece
  // dell'avviso con il primo numero libero. Misurato in browser il 13/08.
  //
  // Il modello, invece, non dipende da come è scritto l'indice: regge la
  // prossima migration di espressione senza sapere che esiste.
  //
  // **Perché basta il modello, senza guardare quale vincolo è saltato.**
  // Verificato sul database (`pg_indexes`) quali unicità esistono su queste
  // tre tabelle, oltre alla chiave primaria:
  //
  //   documents        → SOLO `documents_number_unique`. Nessun altro candidato.
  //   sales_orders     → numero, più `(tenant_id, shopify_order_id)`. Il secondo
  //                      non può scattare sugli ordini numerati: quelli manuali
  //                      hanno `shopify_order_id` NULL, e in un indice unico
  //                      ordinario i NULL non collidono fra loro.
  //   supplier_orders  → numero, più `(tenant_id, reference)`. Il secondo È il
  //                      conflitto di numero visto da un'altra angolazione: il
  //                      riferimento si compone da prefisso, serie e numero,
  //                      quindi collide esattamente quando collide il numero.
  //
  // Il filtro sul modello serve proprio a tenere fuori il resto: il salvataggio
  // di un Arrivo merce può creare articoli nella stessa transazione, e uno SKU
  // duplicato è un P2002 su `ProductVariant` — che qui **non** deve diventare
  // «numero già assegnato».
  const modelName = candidate.meta?.modelName;
  return typeof modelName === 'string' && MODELLI_NUMERATI.includes(modelName as never);
}
