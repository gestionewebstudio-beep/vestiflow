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
 * ## Perché non tutte le colonne sono qui
 *
 * ⛔ **Si ordina solo ciò che il database ordina ESATTAMENTE come si legge a
 * schermo.** Tre colonne dell'elenco restano fuori, e ognuna per una ragione
 * sua:
 *
 * | Colonna          | Perché no                                                                                                  |
 * | ---------------- | ---------------------------------------------------------------------------------------------------------- |
 * | **Tipo**         | in tabella c'è «Arrivo merce», nel database `goods_receipt`: ordinare per enum darebbe l'ordine alfabetico INGLESE, che a schermo non si spiega |
 * | **Stato**        | idem, e in più l'ordine utile sarebbe quello del ciclo di vita (bozza → confermato → annullato), non l'alfabetico |
 * | **Controparte**  | non è UN campo: è `customerName` sui documenti di vendita e `supplierName` su quelli di acquisto           |
 *
 * ⭐ **E non è che manchi la decisione: è che il server non può applicarla.** Sui
 * Movimenti la scelta è già presa e dichiarata (`14` §H13): Tipo, Origine e
 * Location si ordinano **per etichetta**, cioè per quello che l'operatore
 * legge. Quel registro può farlo perché carica tutto e ordina in memoria, dove
 * l'etichetta esiste.
 *
 * ⛔ Lato database l'etichetta **non c'è**: vive in `document-labels.util` nel
 * frontend. Riprodurla qui con un `CASE` in SQL sarebbe tecnicamente possibile
 * e sarebbe la fonte di verità sdoppiata — due elenchi di etichette italiane da
 * tenere allineati, e il giorno che divergono l'ordine smette di corrispondere
 * ai nomi senza che nessun test se ne accorga.
 *
 * Per queste colonne la strada resta aperta e va decisa a parte: o l'etichetta
 * entra nel database, o l'ordinamento di quelle colonne resta client-side dove
 * l'elenco non pagina.
 *
 * Il client dichiara quelle colonne `sortable: false`, così l'intestazione non
 * promette un ordinamento che non arriva.
 */
export type DocumentListSortField = 'documentDate' | 'reference' | 'lineCount' | 'total';

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
  lineCount: (direction) => [{ lines: { _count: direction } }],
  total: (direction) => [{ totalMinor: direction }],
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
