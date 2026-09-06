import { signal } from '@angular/core';
import type { ElementRef } from '@angular/core';

import { redistributeColumnWidths } from './column-width-distribution.util';
import type { TableColumnPreferenceService } from './table-column-preference.service';
import type { TableColumnDef, TableViewId } from './table-column.model';

/**
 * **Le larghezze della griglia articolo di un documento: quote, minimi,
 * ridistribuzione e preferenze — in un punto solo.**
 *
 * ⛔ **Qui c'erano DUE implementazioni identiche** (Arrivo merce e Ordine
 * cliente) e **cinque maschere a metà**, che le quote le calcolavano ma la
 * ridistribuzione no. Il risultato non era «un po' diverso»: sulle cinque a
 * metà l'intestazione comune monta la maniglia con `[live]="true"`, quindi la
 * direttiva NON disegna niente durante il trascinamento e aspetta che qualcuno
 * ascolti `resizing`. Nessuno ascoltava. Si trascinava **senza vedere nulla**,
 * e al rilascio la colonna saltava alla nuova misura riscalando tutte le
 * altre, perché cambiando la sua i pixel il totale cambia e ogni quota con lui.
 *
 * ⚠️ **Non è un sistema parallelo**: la matematica resta quella di
 * `column-width-distribution.util` (a somma costante, con clamp sui minimi),
 * già condivisa e già sotto test. Qui sopra ci sta ciò che le due copie si
 * ripetevano: da dove vengono i pixel, che cosa entra nel totale, quando si
 * scrive nelle preferenze.
 *
 * ⭐ **Il documento passa solo la propria configurazione**: il catalogo
 * colonne, la vista sotto cui salvare, e la domanda «questa colonna è accesa
 * adesso?». Nessun tipo documento entra da questa porta, e non deve.
 *
 * ## Le tre scale, e perché non si confondono
 *
 * | scala                     | dove vive                                    |
 * | ------------------------- | -------------------------------------------- |
 * | **pixel salvati**         | le preferenze. Sono PESI: contano i rapporti |
 * | **quote percentuali**     | il `[style.width]` della cella               |
 * | **pixel resi**            | solo durante il trascinamento                |
 *
 * I minimi per colonna significano qualcosa **solo nella terza**: erano proprio
 * i minimi ignorati a far comparire la barra orizzontale — allargando molto una
 * colonna, le altre finivano sotto la larghezza del loro contenuto, che
 * traboccava dalla cella.
 */
export interface LineColumnWidthsConfig {
  /**
   * Il catalogo colonne di QUESTO documento: l'unica fonte di chi esiste.
   *
   * ⛔ Le preferenze non lo sono: a una colonna che il documento non ha
   * rispondono «visibile», perché non l'hanno mai spenta.
   */
  readonly defs: readonly TableColumnDef[];
  /** La vista sotto cui le larghezze si salvano e si rileggono. */
  readonly viewId: TableViewId;
  readonly preferences: TableColumnPreferenceService;
  /** Quali colonne sono accese adesso. La decide il documento, non questo. */
  readonly isVisible: (columnId: string) => boolean;
  /** Il componente che ospita la tabella: serve a misurarne la larghezza resa. */
  readonly host: ElementRef<HTMLElement>;
  /** Il contenitore da misurare dentro l'host. */
  readonly wrapSelector?: string;
  /**
   * La colonna numero riga.
   *
   * ⚠️ **Entra nel totale ma non nella ridistribuzione**: occupa la sua quota
   * e non si ridimensiona. Lasciarla fuori dal totale farebbe sommare le altre
   * al 100% con lei in più, e la tabella traboccherebbe di quei pixel.
   */
  readonly indexColumnPx?: number;
  /** Larghezza di una colonna che non ne dichiara una. */
  readonly defaultWidthPx?: number;
  /** Minimo di una colonna che non ne dichiara uno. */
  readonly minWidthPx?: number;
  /**
   * Alias storici → id canonico. Arrivo merce e Ordine fornitore ne hanno;
   * gli altri no, e allora non si passa niente.
   */
  readonly normalizeId?: (columnId: string) => string;
}

const WRAP_SELECTOR = '.doc-form__table-wrap';
const INDEX_COLUMN_PX = 48;
const DEFAULT_WIDTH_PX = 96;
const MIN_WIDTH_PX = 48;

export class LineColumnWidths {
  /**
   * Le larghezze in corso di trascinamento.
   *
   * ⭐ Vivono qui e non nelle preferenze finché il mouse non si alza:
   * altrimenti ogni pixel di movimento scriverebbe su `localStorage` **e sul
   * server**.
   */
  private readonly draft = signal<ReadonlyMap<string, number> | null>(null);

  /**
   * La conversione pesi-salvati → pixel-resi decisa all'INIZIO del
   * trascinamento.
   *
   * ⛔ **Difetto che chiude, e c'era in ENTRAMBE le copie** (Arrivo merce e
   * Ordine cliente, misurato il 24/08/2026 dal test qui accanto). A
   * trascinamento avviato le colonne passano ai pixel resi, ma il numero riga
   * restava al suo peso fisso: la sua quota crollava — su una tabella da
   * 1000px, dal 7,4% al 4,9% — e **non tornava indietro al rilascio**, perché
   * le larghezze salvate erano ormai pixel resi. Ogni ridimensionamento
   * restringeva un altro po' la colonna del numero riga.
   *
   * ⭐ Tenendo la scala si chiude in due punti: il numero riga la segue
   * durante il trascinamento, e al salvataggio le larghezze **tornano nella
   * scala dei pesi** — così il totale salvato e' identico a quello di partenza
   * e cambiano solo i rapporti, che e' l'unica cosa che doveva cambiare.
   */
  private readonly draftScale = signal(1);

  constructor(private readonly config: LineColumnWidthsConfig) {}

  /**
   * Larghezza di colonna come QUOTA percentuale del totale visibile.
   *
   * ⛔ **Non pixel.** `.doc-form__table` è `inline-size: 100%` con
   * `table-layout: fixed`: con larghezze in px il browser le tratta come pesi
   * e le riscala per far stare la tabella nel contenitore. Ogni colonna
   * renderebbe più stretta di quanto dichiara, il minimo non proteggerebbe
   * niente, e le intestazioni si spezzerebbero dentro la parola.
   *
   * `'auto'` finché il totale non è positivo: dividere per zero darebbe `NaN%`,
   * che il browser scarta lasciando la colonna a larghezza automatica — solo,
   * senza dirlo.
   */
  width(columnId: string): string {
    return this.quota(this.px(columnId));
  }

  /** La quota della colonna numero riga (vedi `indexColumnPx`). */
  indexWidth(): string {
    return this.quota(this.indexPx());
  }

  /** Sotto questa misura la colonna non scende, nemmeno trascinando. */
  minWidth(columnId: string): number {
    return this.def(columnId)?.minWidthPx ?? this.config.minWidthPx ?? MIN_WIDTH_PX;
  }

  /**
   * Trascinamento IN CORSO: la colonna presa segue il cursore e le altre
   * cedono — o riprendono — spazio in proporzione, da entrambi i lati.
   *
   * La somma resta quella di partenza, così la tabella continua a stare
   * esattamente nel contenitore: è questo che impedisce a una maniglia di
   * ridimensionare indirettamente tutta la tabella.
   */
  onResizing(columnId: string, renderedWidthPx: number): void {
    const next = this.redistribute(columnId, renderedWidthPx);
    if (next) {
      this.draft.set(next);
    }
  }

  /** Mouse rilasciato: la bozza diventa preferenza, in una scrittura sola. */
  onResize(columnId: string, renderedWidthPx: number): void {
    const draft = this.draft();
    if (!draft) {
      // Solo un clic sull'impugnatura, senza trascinare: niente da salvare.
      return;
    }
    const next = this.redistribute(columnId, renderedWidthPx) ?? draft;
    // ⭐ Si torna nella scala dei PESI: cosi' il totale salvato e' quello di
    // partenza e cambiano solo i rapporti. Salvando i pixel resi, il peso
    // fisso del numero riga varrebbe ogni volta una frazione piu' piccola.
    const scale = this.draftScale();
    this.draft.set(null);
    this.draftScale.set(1);
    const widths: Record<string, number> = {};
    for (const [id, px] of next) {
      // ⛔ **Qui c'era `Math.max(..., this.minWidth(id))`, e rompeva il
      // trascinamento.** Il minimo e' una misura in PIXEL RESI; i pesi valgono
      // meno dei pixel ogni volta che la tabella e' piu' larga della somma dei
      // default. Una colonna ferma al proprio minimo reso ha quindi un peso
      // legittimamente PIU' BASSO di quel minimo, e il clamp lo rialzava —
      // gonfiando il denominatore e ricalcolando OGNI quota su un totale
      // diverso da quello su cui erano appena state mostrate.
      //
      // Misurato: Arrivo merce su 1650px, «Nome prodotto» trascinato a 886px
      // saltava a 803px al rilascio, e le altre tredici si riallargavano.
      // L'invariante a somma costante saltava esattamente nell'istante in cui
      // il risultato diventava definitivo.
      widths[id] = Math.round(px / scale);
    }
    this.config.preferences.setColumnWidths(this.config.viewId, widths);
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  private id(columnId: string): string {
    return this.config.normalizeId?.(columnId) ?? columnId;
  }

  private def(columnId: string): TableColumnDef | undefined {
    const id = this.id(columnId);
    return this.config.defs.find((def) => def.id === id);
  }

  /**
   * I pixel SALVATI di una colonna — o il default. Restano l'unità persistita.
   *
   * ⭐ Il minimo vale anche su una larghezza **già salvata**: senza, una
   * colonna stretta da un vecchio ridimensionamento resterebbe tale anche dopo
   * aver alzato il minimo, e il contenuto continuerebbe a stare stretto.
   *
   * ⚠️ È anche il punto da cui passa la REATTIVITÀ: `columnWidth` legge il
   * segnale di stato delle preferenze, quindi la quota si ricalcola da sé
   * quando l'utente accende una colonna o ne trascina un'altra.
   */
  private px(columnId: string): number {
    const id = this.id(columnId);
    const drafted = this.draft()?.get(id);
    if (drafted !== undefined) {
      return drafted;
    }
    const predefinita = this.def(id)?.defaultWidthPx ?? this.config.defaultWidthPx ?? DEFAULT_WIDTH_PX;
    const salvato = this.config.preferences.columnWidth(this.config.viewId, id, predefinita);
    // ⭐ **Il minimo vale sulla PREDEFINITA, non su una larghezza salvata.**
    //
    // Una predefinita e' scritta in pixel di progetto, quindi confrontarla col
    // minimo ha senso: protegge da una configurazione che dichiara una colonna
    // piu' stretta del proprio minimo.
    //
    // ⛔ Una larghezza SALVATA e' un peso, cioe' un rapporto, e sul rapporto il
    // minimo non e' esprimibile: dipende da quanto e' larga la tabella. Il
    // minimo lo garantisce gia' il trascinamento, che lavora in pixel resi ed
    // e' l'unico momento in cui «sessanta pixel» vuol dire qualcosa a schermo.
    // Applicarlo qui rialzava la colonna appena rilasciata e ne spostava tutte
    // le altre.
    return salvato === predefinita ? Math.max(salvato, this.minWidth(id)) : salvato;
  }

  /**
   * I pixel del numero riga, nella scala in cui stanno le altre colonne
   * adesso: peso salvato a riposo, pixel resi durante un trascinamento.
   */
  private indexPx(): number {
    return (this.config.indexColumnPx ?? INDEX_COLUMN_PX) * this.draftScale();
  }

  /** Somma delle sole colonne VISIBILI, più il numero riga. */
  private totalPx(): number {
    return this.config.defs.reduce(
      (total, def) => (this.config.isVisible(def.id) ? total + this.px(def.id) : total),
      this.indexPx(),
    );
  }

  private quota(px: number): string {
    const total = this.totalPx();
    return total > 0 ? `${((px / total) * 100).toFixed(4)}%` : 'auto';
  }

  /**
   * Le nuove larghezze di tutte le colonne visibili, con `columnId` portata a
   * `renderedWidthPx`.
   *
   * ⚠️ Il conto si fa in **pixel resi**, non nei pesi salvati: è l'unica scala
   * in cui i minimi per colonna significano qualcosa. La conversione va fatta
   * **una volta sola**, all'inizio del trascinamento — a bozza avviata le
   * larghezze sono già pixel resi, e riscalarle a ogni movimento accumulerebbe
   * deriva.
   *
   * `null` quando non c'è niente da ridistribuire: tabella non ancora resa, o
   * una colonna sola (non ha con chi scambiare spazio).
   */
  private redistribute(
    columnId: string,
    renderedWidthPx: number,
  ): ReadonlyMap<string, number> | null {
    const wrap = this.config.host.nativeElement.querySelector(
      this.config.wrapSelector ?? WRAP_SELECTOR,
    );
    const tableWidth = wrap instanceof HTMLElement ? wrap.clientWidth : 0;
    const visible = this.config.defs.filter((def) => this.config.isVisible(def.id));
    if (tableWidth <= 0 || visible.length < 2) {
      return null;
    }
    if (!this.draft()) {
      // Prima chiamata del trascinamento: si fissa la scala, e da qui in poi
      // le larghezze sono gia' pixel resi. Riconvertire a ogni movimento
      // accumulerebbe deriva.
      this.draftScale.set(tableWidth / this.totalPx());
    }
    const base = visible.map((def) => ({
      id: def.id,
      px: this.px(def.id) * (this.draft() ? 1 : this.draftScale()),
      minPx: this.minWidth(def.id),
    }));
    return redistributeColumnWidths(base, this.id(columnId), renderedWidthPx);
  }
}

/**
 * Il punto unico che una maschera documento chiama per le larghezze delle sue
 * righe articolo. Si crea come campo del componente:
 *
 * ```typescript
 * private readonly lineWidths = createLineColumnWidths({
 *   defs: GOODS_RECEIPT_LINE_COLUMNS,
 *   viewId: GOODS_RECEIPT_LINES_VIEW,
 *   preferences: this.columnPreferences,
 *   isVisible: (id) => this.isLineColumnVisible(id),
 *   host: this.host,
 * });
 * ```
 */
export function createLineColumnWidths(config: LineColumnWidthsConfig): LineColumnWidths {
  return new LineColumnWidths(config);
}
