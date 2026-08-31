import type { TableColumnDef, TableColumnFilterKind } from './table-column.model';

/**
 * ⭐ **Il catalogo delle colonne di elenco** — deciso il 30/08/2026.
 *
 * Undici elenchi dichiaravano **162 colonne** a mano, e trentacinque
 * identificatori comparivano in più di un elenco. Dieci di questi portavano
 * **etichette diverse per lo stesso concetto** — misurato il 30/08/2026:
 *
 * ```text
 * «location»     ×5   Location / Sede / Negozio / Magazzino
 * «total»       ×10   Totale / Tot. documento
 * «reference»    ×8   Riferimento / Numero / N.
 * «counterparty» ×6   Controparte / Cliente / Fornitore / Soggetto
 * ```
 *
 * ⚠️ **Non sono tutte difetti, e questa è la distinzione che il catalogo fa.**
 * «Cliente» su un elenco di vendita e «Fornitore» su uno di acquisto sono la
 * stessa colonna e due parole GIUSTE: la controparte di una vendita è il
 * cliente. «Location» e «Sede» invece sono la stessa cosa detta in due modi.
 *
 * Quindi il catalogo ha due categorie, e la differenza è imposta dai TIPI:
 *
 * | | |
 * | --- | --- |
 * | **`fisso: true`** | l'etichetta è quella e basta. `colonna('location', { label: … })` **non compila** |
 * | _senza `fisso`_ | l'etichetta del catalogo è il valore di serie, e l'elenco può dichiararne un'altra |
 *
 * ⛔ **La guardia da sola non bastava.** Un controllo che confronta stringhe
 * trova la divergenza dopo che è stata scritta; un tipo che la rifiuta la
 * impedisce mentre si scrive, ed è la stessa scelta fatta per il catalogo dei
 * comandi (`list-action-catalog.ts`).
 *
 * ⚠️ **Le colonne di RIGA DOCUMENTO non stanno qui**: sono celle di una
 * maschera di inserimento, non di un elenco, e il loro vocabolario è quello del
 * documento.
 */
interface VoceCatalogo {
  readonly label: string;
  readonly numeric?: true;
  readonly summable?: false;
  /**
   * ⭐ **Come si filtra**, quando la deduzione sbaglierebbe (`14` §0.2).
   *
   * ⛔ **La deduzione da sola manda tutto a `values`**, e su una colonna di
   * IDENTITÀ è la forma sbagliata: misurato il 31/08/2026 sui Fornitori, il
   * filtro di «Ragione sociale» era un menu con un valore per riga — si può solo
   * scegliere un nome intero fra tutti, mai scrivere «ros».
   *
   * ⭐ **Sta nel catalogo perché la risposta è del CONCETTO, non dell'elenco**:
   * un codice si cerca scrivendo dovunque compaia. Dichiararlo qui lo sistema
   * per tutti gli elenchi che lo usano, invece che elenco per elenco.
   */
  readonly filter?: TableColumnFilterKind;
  /** L'etichetta non si sovrascrive: stesso concetto, stessa parola ovunque. */
  readonly fisso?: true;
}

export const CATALOGO_COLONNE = {
  // ── Identità del record ───────────────────────────────────────────────────
  reference: { label: 'Riferimento', filter: 'text' },
  code: { label: 'Codice', filter: 'text', fisso: true },
  type: { label: 'Tipo', fisso: true },
  status: { label: 'Stato', fisso: true },
  source: { label: 'Origine', fisso: true },

  // ── Chi e dove ────────────────────────────────────────────────────────────
  /**
   * ⭐ **«Sede», e non si sovrascrive** (`14` §15). È la parola dell'interfaccia
   * italiana di Shopify, quindi l'operatore la ritrova identica dalle due parti.
   * «Magazzino» e «Negozio» erano i **due tipi** di sede: usarne uno come nome
   * della colonna dice che l'altro non ci finisce.
   */
  location: { label: 'Sede', fisso: true },
  /** Cliente su una vendita, Fornitore su un acquisto: due parole giuste. */
  counterparty: { label: 'Controparte' },
  customerName: { label: 'Cliente', fisso: true },
  supplier: { label: 'Fornitore', fisso: true },

  // ── Quando ────────────────────────────────────────────────────────────────
  /*
    ⭐ **Le date si filtrano con DUE CAMPI DATA**, non con due caselle numeriche
    e non con un menu di date formattate — che è dove le mandava la deduzione.
  */
  documentDate: { label: 'Data', filter: 'date' },
  createdAt: { label: 'Creato il', filter: 'date' },

  // ── Quanto ────────────────────────────────────────────────────────────────
  total: { label: 'Totale', numeric: true },
  lineCount: { label: 'Righe', numeric: true, fisso: true },
  onHand: { label: 'Giacenza', numeric: true, fisso: true },
  available: { label: 'Disponibile', numeric: true, fisso: true },
  committed: { label: 'Impegnata', numeric: true, fisso: true },
  incoming: { label: 'In arrivo', numeric: true, fisso: true },
  minThreshold: { label: 'Soglia min.', numeric: true, fisso: true },

  // ── Anagrafica ────────────────────────────────────────────────────────────
  sku: { label: 'SKU', filter: 'text' },
  articleCode: { label: 'Codice articolo', filter: 'text', fisso: true },
  category: { label: 'Categoria', fisso: true },
  vatNumber: { label: 'P. IVA', filter: 'text', fisso: true },
  email: { label: 'Email', filter: 'text', fisso: true },
  phone: { label: 'Telefono', filter: 'text', fisso: true },
  /*
    ⚠️ **La città resta un MENU**, e la differenza col resto della riga è quella
    che conta: le città in cui si hanno fornitori sono poche e si vogliono
    **vedere**. Un codice o una P. IVA no — sono identificativi, e di quelli si
    scrive un pezzo.
  */
  city: { label: 'Città', fisso: true },

  // ── Coda ──────────────────────────────────────────────────────────────────
  paymentMethod: { label: 'Pagamento' },
  ddt: { label: 'DDT', filter: 'text', fisso: true },
  notes: { label: 'Commento', filter: 'text', fisso: true },
} as const satisfies Record<string, VoceCatalogo>;

export type IdColonna = keyof typeof CATALOGO_COLONNE;

/** Gli id la cui etichetta è la stessa ovunque. */
export type IdColonnaFissa = {
  [K in IdColonna]: (typeof CATALOGO_COLONNE)[K] extends { readonly fisso: true } ? K : never;
}[IdColonna];

/** Gli id la cui etichetta ha un valore di serie che si può sovrascrivere. */
export type IdColonnaLibera = Exclude<IdColonna, IdColonnaFissa>;

type Resto = Omit<TableColumnDef, 'id' | 'label'>;

/**
 * Costruisce la colonna dell'elenco a partire dal catalogo.
 *
 * ```ts
 * colonna('location')                          // → { id: 'location', label: 'Sede' }
 * colonna('location', { defaultVisible: false })
 * colonna('counterparty', { label: 'Fornitore' })
 * colonna('location', { label: 'Magazzino' })   // ⛔ non compila
 * ```
 */
export function colonna(id: IdColonnaFissa, resto?: Resto): TableColumnDef;
export function colonna(id: IdColonnaLibera, resto?: Resto & { label?: string }): TableColumnDef;
export function colonna(id: IdColonna, resto: Resto & { label?: string } = {}): TableColumnDef {
  const voce: VoceCatalogo = CATALOGO_COLONNE[id];
  const { label, ...altro } = resto;
  return {
    id,
    label: label ?? voce.label,
    ...(voce.numeric ? { numeric: true } : {}),
    ...(voce.summable === false ? { summable: false } : {}),
    ...(voce.filter ? { filter: voce.filter } : {}),
    ...altro,
  };
}
