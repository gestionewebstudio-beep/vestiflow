import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * L'ordinamento dell'elenco documenti, **sull'intero risultato filtrato**
 * (`14` §H15).
 *
 * ## ⛔ Il formato NON è nuovo: è il descrittore del motore, su una riga
 *
 * `sort=documentDate:desc,total:asc` è la forma testuale di ciò che il motore
 * tabella già tiene in mano — `DataTableSort[]`: stessi id di colonna, stesso
 * ordine di priorità. La traduzione nei due versi sta in **una funzione sola**
 * lato client (`serializeDataTableSort` / `parseDataTableSort` in
 * `data-table.model`), così il prossimo elenco paginato non inventa
 * `sortBy`+`sortDir` e un altro `order=-data`.
 *
 * ⚠️ Quello che qui è nuovo è solo la **whitelist**: quali di quegli id il
 * database sappia ordinare, e in che `orderBy` si traducano. È informazione che
 * appartiene al server e non può stare altrove.
 *
 * ## Perché passa dal database e non dal client
 *
 * L'elenco è paginato lato server: ciò che il client ha in mano è UNA pagina.
 * Riordinarla darebbe la prima pagina rimescolata e la chiamerebbe «la più
 * recente» — un ordinamento bugiardo, che è peggio di nessun ordinamento
 * perché sembra funzionare.
 *
 * ## ⛔ Una mia affermazione era FALSA, ed escludeva colonne per niente
 *
 * Qui c'era scritto che ordinare per `type` o `status` avrebbe dato «l'ordine
 * alfabetico INGLESE». **Non è vero**: Postgres ordina un `ENUM` per **ordine di
 * dichiarazione del tipo**, non per il testo del valore. E in questo schema gli
 * enum sono dichiarati per ciclo di vita e per famiglia:
 *
 * ```text
 * DocumentStatus   draft → confirmed → printed → sent → cancelled
 * DocumentType     acquisto → magazzino → vendita → fiscali
 * ```
 *
 * ⭐ È un ordine **di dominio**, deciso nello schema, e per uno stato è più utile
 * dell'alfabetico dell'etichetta: «Bozza, Confermato, Annullato» dice qualcosa,
 * «Annullato, Bozza, Confermato» no.
 *
 * ⚠️ **Resta però una scelta funzionale da confermare**, perché non coincide con
 * la decisione presa sui Movimenti — là si ordina per l'etichetta che l'operatore
 * legge (`14` §H13). Le due risposte divergono, e questa è dichiarata: ordine
 * dell'enum. Volendo l'ordine per etichetta servirebbe altro (vedi sotto).
 *
 * ## Che cosa resta davvero fuori, e perché
 *
 * | Colonna         | Categoria                          | Che cosa manca                                                                 |
 * | --------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
 * | **Controparte** | ordinabile, **da completare**      | non è un campo: `customerName` sulle vendite, `supplierName` sugli acquisti     |
 *
 * ⛔ **Per la controparte non si usa un `CASE` SQL né una copia dell'etichetta**:
 * sarebbero due fonti di verità. La strada pulita è una **colonna generata** in
 * Postgres — `GENERATED ALWAYS AS (COALESCE(customer_name, supplier_name)) STORED` —
 * che è derivata dal database stesso e resta allineata per costruzione. Richiede
 * una migration, quindi è lavoro dichiarato e non una scorciatoia.
 */
export type DocumentListSortField = 'documentDate' | 'reference' | 'total' | 'type' | 'status';

export type SortDirection = 'asc' | 'desc';

/**
 * ⭐ **Il tie-break non è un dettaglio: senza, la paginazione perde righe.**
 *
 * Con un ordinamento non totale il database è libero di disporre come vuole le
 * righe che pareggiano — e fra una pagina e l'altra può disporle diversamente.
 * Il risultato è una riga che compare due volte e un'altra che non compare mai,
 * senza che nulla segnali l'errore.
 *
 * È la stessa lezione di `corrispettivi-sort.util.ts`, che l'aveva imparata su
 * un elenco in memoria: lì l'ordine tornava diverso a ogni ricarica.
 */
const TIE_BREAK: Prisma.DocumentOrderByWithRelationInput = { id: 'asc' };

/** L'ordine di sempre, quando nessuno chiede niente. */
export const DEFAULT_DOCUMENT_ORDER: Prisma.DocumentOrderByWithRelationInput[] = [
  { documentDate: 'desc' },
  { createdAt: 'desc' },
  TIE_BREAK,
];

/**
 * Da id di colonna a `orderBy` Prisma.
 *
 * ⚠️ **«Numero» ordina per `year` + `number`, non per `reference`.** La colonna
 * mostra il progressivo, e il progressivo è quella coppia: `reference` è una
 * stringa che comincia col prefisso del tipo, e ordinarla alfabeticamente
 * raggrupperebbe per tipo invece che per numero — nell'elenco generico, dove
 * convivono DDT e fatture, è visibilmente un altro ordine.
 *
 * ⚠️ I documenti **senza numero** (le bozze) hanno `number` a `null`: Postgres
 * li mette in fondo in `asc` e in testa in `desc`. È prevedibile e non si
 * forza: `nulls` non è dichiarato apposta, così il comportamento resta quello
 * del database e non una terza regola da ricordare.
 */
const ORDER_BY: Record<
  DocumentListSortField,
  (direction: SortDirection) => Prisma.DocumentOrderByWithRelationInput[]
> = {
  documentDate: (direction) => [{ documentDate: direction }],
  reference: (direction) => [{ year: direction }, { number: direction }],
  /*
    ⛔ **Qui c'era `lineCount`**, tolto il 01/09/2026 insieme alla colonna
    «Righe» — «non serve a nulla, può essere rimossa ovunque». Ordinava con
    `{ lines: { _count: direction } }`, cioè un conteggio della relazione: la
    query più cara delle sei, per una colonna che nessuno guardava.

    ⚠️ **Le due liste devono restare identiche** (`check:sort-columns`): il
    client è lo specchio di questa mappa, e una capacità che l'API offre e il
    client non usa è codice che nessuno esercita.
  */
  total: (direction) => [{ totalMinor: direction }],
  // ⭐ Ordine dell'ENUM, cioè quello dichiarato nello schema: per il tipo è la
  // famiglia (acquisto → magazzino → vendita → fiscali), per lo stato il ciclo
  // di vita. Non è l'alfabetico di niente, né inglese né italiano.
  type: (direction) => [{ type: direction }],
  status: (direction) => [{ status: direction }],
};

const SORTABLE_FIELDS = Object.keys(ORDER_BY) as DocumentListSortField[];

/**
 * Traduce `sort=documentDate:desc,total:asc` in un `orderBy` Prisma.
 *
 * ⛔ **Whitelist, non passaggio diretto**: un id di colonna sconosciuto è un
 * `400`, non un ordinamento silenziosamente ignorato. Ignorarlo darebbe
 * all'operatore una tabella che non ha obbedito al clic senza dire perché — e
 * a chi sviluppa un contratto che sembra funzionare finché non lo si guarda.
 */
export function parseDocumentListSort(
  raw: string | undefined,
): Prisma.DocumentOrderByWithRelationInput[] {
  if (!raw?.trim()) {
    return DEFAULT_DOCUMENT_ORDER;
  }

  const chiavi = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  const orderBy: Prisma.DocumentOrderByWithRelationInput[] = [];
  const viste = new Set<string>();

  for (const chiave of chiavi) {
    const [campo, direzione = 'asc'] = chiave.split(':').map((parte) => parte.trim());

    if (!isSortableField(campo)) {
      throw new BadRequestException(
        `Ordinamento non supportato per «${campo}». Colonne ordinabili: ${SORTABLE_FIELDS.join(', ')}.`,
      );
    }
    if (direzione !== 'asc' && direzione !== 'desc') {
      throw new BadRequestException(
        `Direzione di ordinamento non valida: «${direzione}». Usare asc o desc.`,
      );
    }
    // La stessa colonna due volte non è un errore da rifiutare: è un comando
    // ripetuto, e la prima occorrenza è quella che l'operatore ha scelto per
    // prima. Le successive non aggiungono nulla all'ordine.
    if (viste.has(campo)) {
      continue;
    }
    viste.add(campo);
    orderBy.push(...ORDER_BY[campo](direzione));
  }

  return orderBy.length > 0 ? [...orderBy, TIE_BREAK] : DEFAULT_DOCUMENT_ORDER;
}

function isSortableField(campo: string | undefined): campo is DocumentListSortField {
  return campo != null && (SORTABLE_FIELDS as string[]).includes(campo);
}
