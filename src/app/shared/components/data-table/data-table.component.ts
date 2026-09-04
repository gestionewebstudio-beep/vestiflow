import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { ColumnFilterComponent } from '@shared/components/column-filter/column-filter.component';
import { SelectionCheckComponent } from '@shared/components/selection-check/selection-check.component';
import { TableColumnResizeDirective } from '@shared/directives/table-column-resize.directive';
import type { SelectionMode } from '@shared/models/list-selection.model';
import { redistributeColumnWidths } from '@shared/table-columns/column-width-distribution.util';
import { resolveColumnFilterKind } from '@shared/table-columns/table-column-filter.util';
import { TableColumnPreferenceService } from '@shared/table-columns/table-column-preference.service';
import { ColumnFilterStore } from '@shared/table-columns/column-filter.store';
import { countActiveColumnFilters } from '@shared/table-columns/column-filter.model';
import type { ColumnFilterValue } from '@shared/table-columns/column-filter.model';
import type {
  ResolvedTableColumn,
  TableColumnFilterKind,
  TableViewId,
} from '@shared/table-columns/table-column.model';
import { isAllSelected, isSomeSelected } from '@shared/utils/list-selection';

import { DataTableCellDirective } from './data-table-cell.directive';
import { DataTableRowActionsDirective } from './data-table-row-actions.directive';
import { DataTableRowCardDirective } from './data-table-row-card.directive';
import { ariaSortOf, nextSort, sortDirectionOf, sortRankOf } from './data-table.model';
import type {
  DataTableRowTone,
  DataTableSection,
  DataTableSort,
  DataTableTotals,
} from './data-table.model';

/** Riga selezionata o deselezionata dalla casella. */
export interface DataTableSelectionEvent<T> {
  readonly row: T;
  readonly selected: boolean;
}

/** Larghezza richiesta a mano per una colonna. */
export interface DataTableResizeEvent {
  readonly columnId: string;
  readonly widthPx: number;
}

/**
 * ⭐ Il **motore tabella dei riepiloghi** (`14` parte H).
 *
 * Rende colonne e **sezioni**; una tabella piatta è una sezione senza
 * intestazione e senza piede, quindi non esistono due modi di rendere il corpo.
 *
 * ⛔ **Non conosce nessun dominio.** Che cosa ci sia in una cella lo dice la
 * pagina, con `cellText` per il testo e un `ng-template appCell` dove la cella
 * non è testo. Il giorno in cui qui dentro compare il nome di un tipo
 * documento, il motore è diventato un componente di feature travestito.
 *
 * ⛔ **Non ordina e non impagina.** Gli elenchi sono paginati lato server:
 * ordinare le righe caricate ordinerebbe **una pagina**, dando un risultato che
 * sembra giusto e non lo è. Il motore emette `sortChange`; la pagina lo applica
 * alla query.
 *
 * ⚠️ **L'ordinamento non si conserva** (`14` §G1): alla riapertura si torna al
 * predefinito.
 *
 * ⭐ **Le larghezze invece SÌ, dal 01/09/2026** — deciso dal proprietario. Vanno
 * per utente e per vista sulla stessa strada di visibilità e aggancio
 * (`TableColumnPreferenceService`: localStorage più sincronizzazione col
 * server), e il motore le legge col proprio `viewId` — lo stesso pattern con
 * cui legge già i filtri di colonna. Senza `viewId` restano in memoria, come
 * prima.
 */
/**
 * Le larghezze di ripiego quando la colonna non ne dichiara una: vedi
 * `widthOf`. Sono in px come `defaultWidthPx`, che è il campo che
 * sostituiscono quando manca.
 *
 * ⭐ **Sono un punto di partenza, non una misura da tarare** — proprietario,
 * 01/09/2026: «basta dare una larghezza ipotizzata minima in base al tipo di
 * contenuto e poi l'operatore se la gestisce». Da quando la larghezza si
 * conserva, nessuno deve andare a misurare colonna per colonna in undici
 * modelli: la prima regolazione dell'operatore resta.
 *
 * ⛔ **Non si fondono con `minWidthPx`, che è un'altra cosa.** Questi sono
 * PESI (contano i rapporti fra colonne); il minimo è una misura in PIXEL RESI,
 * e vale solo durante il trascinamento. Confonderle è il difetto misurato il
 * 24/08/2026 su Arrivo merce — «Nome prodotto» trascinato a 886px saltava a
 * 803px al rilascio, vedi `line-column-widths.store`.
 */
const LARGHEZZA_NUMERICA = 92;
const LARGHEZZA_CODICE = 128;

/**
 * ⭐ **Anche il testo libero ha una quota**, da quando le larghezze sono
 * proporzioni: senza, la sua percentuale sarebbe zero e la colonna sparirebbe.
 *
 * ⚠️ È più larga delle altre due apposta — è il ripiego di nomi e descrizioni,
 * che sono la colonna che si legge.
 */
const LARGHEZZA_TESTO = 200;

/**
 * Il minimo di una colonna che non ne dichiara uno.
 *
 * ⚠️ È in **pixel resi**, non un peso: vale durante il trascinamento, ed è la
 * misura sotto cui una colonna non scende a schermo.
 */
const LARGHEZZA_MINIMA = 48;

@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.data-table-host--row-card]': 'hasRowCard()',
  },
  imports: [
    NgTemplateOutlet,
    ColumnFilterComponent,
    SelectionCheckComponent,
    TableColumnResizeDirective,
  ],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T> {
  readonly columns = input.required<readonly ResolvedTableColumn[]>();
  readonly sections = input.required<readonly DataTableSection<T>[]>();

  /** Identità della riga: serve al `track`, alla selezione e alle azioni. */
  readonly rowId = input.required<(row: T) => string>();

  /** Testo di una cella quando non c'è un template. */
  readonly cellText = input<(row: T, columnId: string) => string>(() => '');

  /** Nome accessibile della tabella. */
  readonly caption = input<string>('');

  // ── Selezione ─────────────────────────────────────────────────────────────
  readonly selectionMode = input<SelectionMode>('none');

  /**
   * Quando è vero il clic di riga seleziona invece di aprire: è la modalità
   * selezione della vista a card, dove non c'è una casella da toccare.
   */
  readonly rowClickSelects = input(false);

  /*
    ⭐ **Quali righe si possono scegliere.** Deciso dal proprietario il
    30/08/2026: «possiamo non permettere di eliminare i corrispettivi stabiliti
    che non vanno eliminati e li rendiamo semplicemente non cliccabili quando
    Seleziona è attivo».

    ⚠️ **Non è il permesso di APRIRE**, e i due non vanno confusi: una riga può
    essere consultabile e non eliminabile, o viceversa. Un ordine Shopify si apre
    e non si elimina; un documento annullato non si apre e va comunque esportato.

    ⭐ **Il default dice sì**, quindi gli elenchi che non hanno restrizioni non
    cambiano di una riga.
  */
  readonly rowSelectable = input<(row: T) => boolean>(() => true);
  readonly selectedIds = input<ReadonlySet<string>>(new Set<string>());
  /** Nome accessibile della casella di riga: senza, sarebbe «casella» N volte. */
  readonly selectionLabel = input<(row: T) => string>(() => 'Seleziona la riga');
  readonly selectAllLabel = input<string>('Seleziona tutte le righe della pagina');

  // ── Ordinamento ───────────────────────────────────────────────────────────
  /**
   * ⭐ **Le affordance compaiono solo se la pagina le accende.** Un elenco che
   * non sa ordinare non deve dichiarare `sortable: false` su ogni colonna:
   * lascia questo a `false` e le intestazioni restano quelle di prima.
   *
   * ⚠️ **Chi lo accende si assume una responsabilità**: l’insieme reso deve
   * essere l’INTERO risultato del filtro. Su un elenco paginato ordinerebbe una
   * pagina, e il risultato sembrerebbe giusto senza esserlo. Il registro
   * movimenti lo accende perché non pagina più; chi pagina, no.
   */
  readonly sortable = input<boolean>(false);
  /**
   * Le chiavi attive, **la primaria per prima**.
   *
   * ⭐ È un elenco e non una sola chiave perché premere una seconda colonna non
   * cancella la prima: la scavalca. Un elenco vuoto = ordine del server.
   */
  readonly sort = input<readonly DataTableSort[]>([]);

  /** Clic di riga: legato solo dove la riga porta da qualche parte. */
  readonly rowClickable = input<boolean>(false);

  /**
   * ⭐ Quali righe si aprono, quando non si aprono tutte.
   *
   * ⚠️ **Non è un dettaglio estetico.** Una riga che non porta da nessuna parte
   * non deve entrare nel giro del Tab né annunciarsi come apribile: chi naviga
   * da tastiera si fermerebbe su righe che non fanno niente. Nel Registro
   * Corrispettivi si aprono solo i corrispettivi manuali, e un test lo inchioda.
   */
  readonly rowClickableWhen = input<(row: T) => boolean>(() => true);
  readonly rowLabel = input<(row: T) => string>(() => 'Apri la riga');

  /**
   * ⭐ **Il TONO di una riga**, quando il suo tipo la distingue dalle altre.
   *
   * Un registro non ha solo righe: ha righe che tolgono. Un reso, una rettifica,
   * una nota di credito si leggono a colpo d'occhio perché la riga è segnata —
   * ed è una capacità del motore, non di una tabella sola: ogni elenco che
   * contenga movimenti in due versi ne ha bisogno.
   *
   * ⛔ **Non è una classe CSS libera**, ed è voluto: un `rowClass` che accetti
   * qualunque stringa lascia ogni elenco inventarsi la propria tinta, ed è
   * esattamente la divergenza che il motore comune esiste per togliere. I toni
   * sono quelli del vocabolario di stato (`regole-stile-ui` §2).
   *
   * `null` — la stragrande maggioranza delle righe — non aggiunge nulla.
   */
  readonly rowTone = input<(row: T) => DataTableRowTone | null>(() => null);

  /**
   * La riga da mettere in evidenza **adesso**: l'id di quella appena trovata,
   * o `null` — che è il caso normale.
   *
   * ⭐ **Nata per la pistola** (01/09/2026, dettaglio inventario): si scansiona
   * un articolo, la sua riga si accende per un momento e la pagina ci scorre
   * sopra. Chi conta in magazzino guarda il telefono con una mano sola, e senza
   * quel lampo non sa se ha letto la riga giusta.
   *
   * ⛔ **Non è un `rowTone`, e la distinzione è quella dichiarata lì sopra**: il
   * tono è una proprietà del DATO — questa riga è un reso, questa è annullata —
   * e resta finché resta il dato. Questo è uno stato **momentaneo
   * dell'interazione**, che nasce da un gesto e si spegne da sé. Confonderli
   * farebbe sembrare permanente un lampo, e viceversa.
   *
   * ⚠️ **Il motore non sa cos'è una pistola**: espone «questa riga adesso è
   * quella giusta». Trovare l'articolo, decidere quanto dura il lampo e far
   * scorrere la pagina resta di chi ha scansionato, che si aggancia alla riga
   * con `[data-row-id]` — l'identità che il motore scrive su ogni riga.
   */
  readonly highlightedRowId = input<string | null>(null);

  // ── Filtri di colonna (`14` §0.2) ─────────────────────────────────────────

  /**
   * ⭐ **La vista, e con essa i suoi filtri di colonna.**
   *
   * ⛔ **Era una terna di `input()`/`output()`** — controlli visibili, stato,
   * cambiamento — e avrebbe voluto dire cablarli a mano in dodici elenchi, con
   * la regola non ovvia che li governa (spegnere azzera) copiata dodici volte.
   *
   * ⭐ **La chiave è la stessa del selettore Colonne**, e non per comodità: i
   * filtri di un elenco SONO le sue colonne (`14` §0.2), quindi chi sa quali
   * colonne mostra sa anche come si filtrano. È il pattern di
   * `app-table-column-picker`, che da sempre prende un `viewId` e legge il
   * proprio store.
   *
   * ⚠️ Senza `viewId` la tabella non ha filtri di colonna — ed è giusto: le
   * griglie di riga dei documenti sono maschere di inserimento, non elenchi.
   */
  readonly viewId = input<TableViewId>();

  private readonly filterStore = inject(ColumnFilterStore);

  /*
    ⭐ **Il motore PUBBLICA le proprie colonne visibili**, e serve al telaio: sotto
    `lg` le intestazioni non esistono e i controlli diventano voci di pannello —
    ma il telaio non deve sapere niente di preferenze colonne per saperlo.

    ⚠️ **Un effetto, non un `computed`**: è una scrittura verso l'esterno, e
    riparte quando le colonne cambiano — cioè quando l'operatore ne accende o
    spegne una dal selettore Colonne.
  */
  constructor() {
    effect(() => {
      const vista = this.viewId();
      if (vista !== undefined) {
        this.filterStore.registraColonne(vista, this.columns());
      }
    });
  }

  /** I controlli sono a vista? Lo comanda il pulsante «Filtri» del telaio. */
  protected readonly filtersVisible = computed(() => {
    const vista = this.viewId();
    return vista === undefined ? false : this.filterStore.acceso(vista)();
  });

  protected readonly columnFilters = computed(() => {
    const vista = this.viewId();
    return vista === undefined ? {} : this.filterStore.stato(vista)();
  });

  /**
   * ⭐ **Zero righe, e la causa è un filtro di colonna.**
   *
   * ⚠️ **La condizione è doppia** e va tenuta tale: senza il controllo sui filtri
   * attivi, questa riga comparirebbe su ogni tabella momentaneamente vuota —
   * durante il caricamento, o su un elenco che non ha dati — dicendo una causa
   * che non è quella.
   */
  protected readonly nessunRisultatoPerFiltri = computed(
    () =>
      countActiveColumnFilters(this.columnFilters()) > 0 &&
      this.sections().every((sezione) => sezione.rows.length === 0),
  );

  protected onColumnFilter(columnId: string, value: ColumnFilterValue | null): void {
    const vista = this.viewId();
    if (vista !== undefined) {
      this.filterStore.imposta(vista, { columnId, value });
    }
  }

  readonly rowClick = output<T>();
  readonly selectionChange = output<DataTableSelectionEvent<T>>();
  readonly selectAllChange = output<boolean>();
  /** Le chiavi dopo la pressione; vuoto = ordinamento tolto del tutto. */
  readonly sortChange = output<readonly DataTableSort[]>();
  readonly columnResize = output<DataTableResizeEvent>();

  /**
   * ⏸ **Colonna in coda per il comando di riga**, acceso solo da chi ce l’ha.
   *
   * Esiste perché il menu per riga esiste ancora: `14` §C0.1 ha deciso che le
   * funzioni per singolo documento ne escano, ma finché la matrice azioni non le
   * ha ricollocate, toglierlo sarebbe togliere comandi che non hanno ancora una
   * casa. **È transitorio**: quando la matrice è applicata, questa colonna e il
   * suo template vanno rivalutati.
   *
   * ⚠️ Non è una colonna del MODELLO: non compare nel selettore colonne, non si
   * ridimensiona e non si ordina. È una fascia di comando, non un dato.
   */
  readonly rowActionsLabel = input<string>('');

  /*
    ⭐ **La riga totali, ed è resa DAL MOTORE** — non da un componente accanto.

    ⛔ **La strada ovvia era una fascia nello slot `[summary]` del telaio**, ed è
    quella sbagliata: la regola chiede che ogni somma stia **sotto la propria
    colonna**, e una fascia fuori dalla tabella dovrebbe rifarsi le larghezze da
    sola. Sarebbero due misure per la stessa cosa, e la seconda si disallineerebbe
    al primo trascinamento di una maniglia — che il motore tiene in memoria e
    nessun altro conosce.

    ⭐ Dentro la tabella l'incolonnamento è **gratuito e non si può sbagliare**: è
    la stessa `<table>`, con le stesse colonne.

    ⚠️ **Sta in un `tfoot` appiccicato in fondo alla vista**, non in coda alle
    righe: su un elenco lungo, in coda, si raggiungerebbe solo scorrendo fino in
    fondo — ed è il difetto che `regole-stile-ui` vieta per il riepilogo
    («lo renderebbe irraggiungibile su una finestra bassa»).

    ⛔ **Non sparisce mai** (`null` significa «questo elenco non ha totali», non
    «adesso no»): una fascia che compare e scompare sposta i comandi in verticale.
  */
  readonly totals = input<DataTableTotals | null>(null);

  private readonly cellTemplates = contentChildren(DataTableCellDirective);
  protected readonly rowActionsTemplate = contentChild(DataTableRowActionsDirective);
  protected readonly rowCardTemplate = contentChild(DataTableRowCardDirective);

  /**
   * ⭐ Una schermata ha una veste compatta PROGETTATA, invece del ripiego a
   * etichetta:valore del mixin condiviso.
   *
   * Accende la classe sull’host: sotto `lg` le celle vere passano alla ricetta
   * `.sr-only` e comanda la card. È una classe e non un `input` perchè la
   * risposta è già nel contenuto proiettato — chiederla due volte sarebbe un
   * comando che può contraddire il fatto.
   */
  protected readonly hasRowCard = computed(() => this.rowCardTemplate() !== undefined);

  /**
   * Le larghezze **durante** un trascinamento, in pixel resi.
   *
   * ⭐ Vivono qui e non nelle preferenze finché il mouse non si alza:
   * altrimenti ogni pixel di movimento scriverebbe su `localStorage` **e sul
   * server**.
   */
  private readonly bozza = signal<ReadonlyMap<string, number> | null>(null);

  /**
   * La conversione pesi → pixel resi, fissata all'INIZIO del trascinamento.
   *
   * ⚠️ Si fissa **una volta sola**: riconvertire a ogni movimento accumula
   * deriva. Al rilascio serve per tornare nella scala dei pesi, così il totale
   * salvato è quello di partenza e cambiano solo i rapporti.
   */
  private readonly scalaBozza = signal(1);

  /**
   * Larghezze richieste a mano quando la tabella non ha un `viewId`: il solo
   * Registro Corrispettivi. Lì non c'è una vista registrata su cui salvare, e
   * la regolazione resta del momento.
   */
  private readonly larghezzeInMemoria = signal<ReadonlyMap<string, number>>(new Map());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly injector = inject(Injector);

  /**
   * Le preferenze colonne, risolte **solo se questa tabella ha un `viewId`**.
   *
   * ⛔ **Non con `inject()` in campo, e la ragione è misurata.**
   * `TableColumnPreferenceService` dipende da `AuthService` — gli serve
   * l'utente e il tenant per la chiave di salvataggio — quindi iniettarlo qui
   * farebbe esplodere con `NG0201 AUTH_GATEWAY` **ogni prova che monta una
   * tabella**, comprese le quarantanove che con le larghezze non c'entrano
   * niente. Un motore di presentazione condiviso non deve trascinare
   * l'autenticazione dentro chi lo monta.
   *
   * ⚠️ Le tabelle senza `viewId` — oggi il solo Registro Corrispettivi — non lo
   * risolvono mai: per loro la larghezza resta in memoria, come prima.
   */
  private preferenze: TableColumnPreferenceService | null = null;

  private preferences(): TableColumnPreferenceService | null {
    if (!this.viewId()) {
      return null;
    }
    this.preferenze ??= this.injector.get(TableColumnPreferenceService);
    return this.preferenze;
  }

  protected readonly selectable = computed(() => this.selectionMode() !== 'none');

  /** Quante colonne occupa una riga a piena larghezza (intestazione di sezione). */
  protected readonly hasRowActions = computed(() => this.rowActionsLabel().length > 0);

  protected readonly totalColumns = computed(
    () => this.columns().length + (this.selectable() ? 1 : 0) + (this.hasRowActions() ? 1 : 0),
  );

  private readonly visibleRowIds = computed(() =>
    this.sections().flatMap((section) => section.rows.map((row) => this.rowId()(row))),
  );

  protected readonly allSelected = computed(() =>
    isAllSelected(this.visibleRowIds(), this.selectedIds()),
  );
  protected readonly someSelected = computed(() =>
    isSomeSelected(this.visibleRowIds(), this.selectedIds()),
  );

  /**
   * La forma di filtro di una colonna, o `null` se non si filtra.
   *
   * ⚠️ **Opt-out**: una colonna che non dichiara niente È filtrabile e la forma
   * si deduce — stessa disciplina di `sortable`, e per la stessa ragione.
   */
  protected filterKindOf(column: ResolvedTableColumn): TableColumnFilterKind | null {
    return resolveColumnFilterKind(column);
  }

  /**
   * ⭐ **Le scelte di un filtro `values`: i valori PRESENTI nelle righe.**
   *
   * ⛔ **NON si leggono dalle sezioni che il motore riceve**, ed è la trappola di
   * questo controllo: quelle righe sono già ristrette dai filtri attivi, quindi
   * scelto «Bozza» sparirebbe «Confermato» dalle scelte — il filtro si potrebbe
   * stringere ma mai allargare.
   *
   * ⭐ Le registra chi ha in mano le righe INTERE (`createColumnFilters`), che è
   * anche l'unico posto dove esistono.
   */
  protected filterOptionsOf(columnId: string): readonly string[] {
    const vista = this.viewId();
    return vista === undefined ? [] : this.filterStore.opzioniDi(vista, columnId);
  }

  protected templateFor(columnId: string): DataTableCellDirective | undefined {
    return this.cellTemplates().find((cell) => cell.appCell() === columnId);
  }

  /*
    ⭐ **Con `table-layout: fixed` una colonna senza larghezza si prende una
    parte uguale alle altre**, e «Stagione» diventerebbe larga quanto «Nome».
    Undici modelli colonne non ne dichiarano nemmeno una.

    ⛔ **La strada ovvia era misurarle a mano in undici file**, ed è quella
    sbagliata: sarebbero undici serie di numeri da tenere allineate, e la prima
    colonna nuova nascerebbe senza. Il modello dice già che TIPO è una colonna —
    numerica, codice, testo — e da lì si deduce quanto le serve.

    ⚠️ **Il ripiego è un MINIMO ragionevole, non una misura giusta**: chi ha una
    larghezza dichiarata la usa, e l'operatore la cambia trascinando.

    ⚠️ **Ora ogni colonna ne ha una**, testo libero compreso: da quando le
    larghezze sono proporzioni (`percentualeDi`), una colonna senza misura
    varrebbe zero per cento e sparirebbe.
  */
  protected widthOf(column: ResolvedTableColumn): number {
    /*
      La catena, dal più forte al più debole:

      ```text
      bozza di trascinamento   pixel resi, solo mentre il mouse è giù
      preferenza salvata       il peso scelto dall'operatore, per utente e vista
      defaultWidthPx           il peso dichiarato dal modello colonne
      ripiego per tipo         l'ipotesi, quando il modello non dice niente
      ```
    */
    const inCorso = this.bozza()?.get(column.id);
    if (inCorso !== undefined) {
      return inCorso;
    }
    const ripiego = column.defaultWidthPx ?? this.ripiegoPerTipo(column);
    const vista = this.viewId();
    if (!vista) {
      return this.larghezzeInMemoria().get(column.id) ?? ripiego;
    }
    return this.preferences()?.columnWidth(vista, column.id, ripiego) ?? ripiego;
  }

  private ripiegoPerTipo(column: ResolvedTableColumn): number {
    if (column.numeric) {
      return LARGHEZZA_NUMERICA;
    }
    if (column.display === 'code') {
      return LARGHEZZA_CODICE;
    }
    return LARGHEZZA_TESTO;
  }

  /** Sotto questa misura la colonna non scende, nemmeno trascinando. */
  protected minimoDi(column: ResolvedTableColumn): number {
    return column.minWidthPx ?? LARGHEZZA_MINIMA;
  }

  /*
    ⭐ **LE COLONNE SI ADATTANO AL CONTENITORE, NON LO SFONDANO** — proprietario,
    01/09/2026: «il contenitore non doveva permettere di scorrere con barra di
    scorrimento ma il contenuto, quindi larghezza colonne, adattarsi in base
    alla grandezza del contenitore».

    ⛔ **In px non si può.** Misurato in un browser vero, con le venticinque
    colonne dell'anagrafica fornitore (3.586px dichiarati) in un contenitore da
    1.200:

    ```text
    fixed + width 100% + px         3.587px   ⛔ scorre: le px sono un ordine
    fixed SENZA width               1.198px   ⛔ sta dentro, ma le proporzioni
                                                si perdono — «Nome» a 32px
    fixed + width 100% + PERCENTO   1.198px   ✅ sta dentro E le conserva
    ```

    ⭐ **Quindi la larghezza dichiarata diventa un PESO**, non una misura: la
    quota di ognuna è la sua parte sulla somma delle colonne visibili. Accendere
    una colonna stringe le altre in proporzione, spegnerla le allarga.

    ⚠️ **Il trascinamento continua a funzionare** e resta prioritario: `widths`
    tiene i px scelti dall'operatore, e da lì si ricalcola la quota. Cambia il
    significato del numero, non chi comanda.
  */
  protected percentualeDi(column: ResolvedTableColumn): number {
    const totale = this.columns().reduce((somma, col) => somma + this.widthOf(col), 0);
    return totale > 0 ? (this.widthOf(column) / totale) * 100 : 0;
  }

  protected ariaSort(columnId: string): 'ascending' | 'descending' | 'none' {
    return ariaSortOf(this.sort(), columnId);
  }

  protected isSorted(columnId: string): boolean {
    return sortDirectionOf(this.sort(), columnId) !== null;
  }

  protected sortDirection(columnId: string): string | null {
    return sortDirectionOf(this.sort(), columnId);
  }

  /** Il numero mostrato accanto alla freccia — solo se le chiavi sono più di una. */
  protected sortRank(columnId: string): number | null {
    if (this.sort().length < 2) {
      return null;
    }
    return sortRankOf(this.sort(), columnId);
  }

  /**
   * Il nome accessibile del pulsante di intestazione.
   *
   * ⚠️ Con più chiavi, `aria-sort` da solo non basta: lo porta la sola primaria
   * (ARIA ne raccomanda uno per volta), quindi è qui che chi ascolta scopre che
   * una colonna è la seconda chiave e in che verso.
   */
  protected sortLabel(column: ResolvedTableColumn): string {
    const verso = sortDirectionOf(this.sort(), column.id);
    if (!verso) {
      return `Ordina per ${column.label}`;
    }
    const parola = verso === 'asc' ? 'crescente' : 'decrescente';
    const posizione = this.sortRank(column.id);
    const quante = this.sort().length;
    return posizione === null
      ? `${column.label}: ordinamento ${parola}`
      : `${column.label}: ordinamento ${parola}, chiave ${posizione} di ${quante}`;
  }

  protected canSort(column: ResolvedTableColumn): boolean {
    return this.sortable() && column.sortable !== false;
  }

  protected onSort(column: ResolvedTableColumn): void {
    if (!this.canSort(column)) {
      return;
    }
    this.sortChange.emit(nextSort(this.sort(), column.id));
  }

  /*
    ⛔ **QUI LA COLONNA RIMBALZAVA, e non si arrivava mai alla misura chiesta.**
    Misurato il 01/09/2026. La maniglia era montata senza `[live]`: la direttiva
    scriveva `width` in px sulla cella durante il trascinamento, e al rilascio
    quel numero entrava fra le larghezze come **peso** — che `percentualeDi`
    ridivide per un totale nel frattempo cresciuto.

    ```text
    otto colonne in un contenitore da 1200px
    partenza                      A = 150px
    trascino a 300px        →     A = 212px    ⛔ chiedo +150, ottengo +62
    trascino ancora a 300   →     A = 212px    ⛔ stesso peso, stesso esito: stallo
    ```

    ⚠️ E la cascata lo confermava in un browser vero: durante il trascinamento
    vinceva il `width` in px reso dalla direttiva (402px), al rilascio tornava a
    vincere la percentuale (341px). Non falliva niente: si vedeva solo tirando.

    ⭐ **La cura esisteva già in casa**, per le righe documento dal 24/08: la
    maniglia in `[live]` non disegna niente da sola, e la ridistribuzione a somma
    costante di `redistributeColumnWidths` fa cedere spazio alle altre colonne —
    nei limiti dei loro minimi — invece di allargare la tabella.
  */
  protected onResizing(column: ResolvedTableColumn, widthPx: number): void {
    const prossime = this.ridistribuisci(column, widthPx);
    if (prossime) {
      this.bozza.set(prossime);
    }
  }

  /** Mouse rilasciato: la bozza diventa preferenza, in una scrittura sola. */
  protected onResize(column: ResolvedTableColumn, widthPx: number): void {
    const bozza = this.bozza();
    if (!bozza) {
      // Solo un clic sulla maniglia, senza trascinare: niente da salvare.
      return;
    }
    const finali = this.ridistribuisci(column, widthPx) ?? bozza;
    // ⭐ Si torna nella scala dei PESI: il totale salvato resta quello di
    // partenza e cambiano solo i rapporti, che è l'unica cosa che è cambiata.
    const scala = this.scalaBozza();
    this.bozza.set(null);
    this.scalaBozza.set(1);
    const larghezze: Record<string, number> = {};
    for (const [id, px] of finali) {
      larghezze[id] = Math.round(px / scala);
    }
    const vista = this.viewId();
    const preferenze = this.preferences();
    if (vista && preferenze) {
      preferenze.setColumnWidths(vista, larghezze);
    } else {
      this.larghezzeInMemoria.set(new Map(Object.entries(larghezze)));
    }
    this.columnResize.emit({ columnId: column.id, widthPx });
  }

  /**
   * Le nuove larghezze di tutte le colonne, con `column` portata a `widthPx`.
   *
   * ⚠️ Il conto si fa in **pixel resi**, non nei pesi: è l'unica scala in cui
   * il minimo per colonna significa qualcosa a schermo.
   *
   * ⚠️ **La scala si misura sulle celle rese, non sul contenitore.** Le colonne
   * di servizio — casella di selezione e azioni di riga — hanno una larghezza
   * in px propria e stanno fuori dalle quote: misurato in Chromium, con le
   * quote a 100% il browser stringe le colonne dati per far posto a loro (600px
   * di contenitore, tre colonne da 186 invece di 200). Prendere la larghezza del
   * contenitore sbaglierebbe di quei pixel, e la colonna partirebbe con uno
   * scatto.
   *
   * `null` quando non c'è niente da ridistribuire: tabella non ancora resa, o
   * una colonna sola — non ha con chi scambiare spazio.
   */
  private ridistribuisci(
    column: ResolvedTableColumn,
    widthPx: number,
  ): ReadonlyMap<string, number> | null {
    const colonne = this.columns();
    if (colonne.length < 2) {
      return null;
    }
    const avviata = this.bozza() !== null;
    if (!avviata) {
      const resa = this.larghezzaResaDelleColonne();
      const pesi = colonne.reduce((somma, col) => somma + this.widthOf(col), 0);
      if (resa <= 0 || pesi <= 0) {
        return null;
      }
      this.scalaBozza.set(resa / pesi);
    }
    // A bozza avviata le larghezze sono già pixel resi: riconvertirle a ogni
    // movimento accumulerebbe deriva.
    const scala = avviata ? 1 : this.scalaBozza();
    const base = colonne.map((col) => ({
      id: col.id,
      px: this.widthOf(col) * scala,
      minPx: this.minimoDi(col),
    }));
    return redistributeColumnWidths(base, column.id, widthPx);
  }

  /** Lo spazio che le colonne dati occupano davvero adesso, in pixel. */
  private larghezzaResaDelleColonne(): number {
    const celle = this.host.nativeElement.querySelectorAll('th.data-table__head-cell');
    let totale = 0;
    for (const cella of Array.from(celle)) {
      totale += cella.getBoundingClientRect().width;
    }
    return totale;
  }

  protected canClickRow(row: T): boolean {
    return this.rowClickable() && this.rowClickableWhen()(row);
  }

  /*
    ⭐ **In modalità selezione il clic di riga SELEZIONA, non apre** — deciso dal
    proprietario il 30/08/2026 per la vista a card: «in modalità seleziona non si
    apre la riga, pulsante spento tutto ritorna normale».

    ⛔ **Non è una scorciatoia in più: è la SOSTITUZIONE del gesto.** Un elenco in
    cui il tocco a volte apre e a volte seleziona, senza che nulla lo dichiari,
    è il difetto che questa modalità evita — per questo il pulsante che la accende
    resta acceso e visibile finché dura.

    ⚠️ **La selezione ignora `canClickRow`**: una riga che non si APRE — un
    documento annullato, una registrazione senza maschera — resta comunque
    selezionabile per stampa ed export. Sono due permessi diversi, e legarli
    toglierebbe dall'export proprio le righe che più spesso si vogliono estrarre.
  */
  protected onRowClick(row: T): void {
    if (this.rowClickSelects()) {
      if (!this.rowSelectable()(row)) {
        return;
      }
      const id = this.rowId()(row);
      this.selectionChange.emit({ row, selected: !this.selectedIds().has(id) });
      return;
    }
    if (this.canClickRow(row)) {
      this.rowClick.emit(row);
    }
  }

  /**
   * Il piede di sezione: l'etichetta occupa le colonne **prima** della prima che
   * porta un totale.
   *
   * ⛔ Derivato dal modello colonne, non aritmetica scritta a mano. Nei
   * Corrispettivi oggi è calcolato con due funzioni che dipendono dall'ordine
   * fisso delle colonne nel markup: qui l'ordine lo decide il selettore, e il
   * conto si rifà da solo.
   */
  /*
    ⭐ **«voci», non «righe» né «prodotti»**: è la parola che la regola usa, ed è
    la stessa su ogni elenco — chi passa da uno all'altro non deve reimparare
    come si chiama un conteggio.

    ⚠️ **Il numero cambia significato con la selezione**, non il sostantivo: «3
    voci» selezionate e «50 voci» filtrate si leggono uguale, e a dire quale dei
    due è lo stato della casella in testa.
  */
  /*
    ⭐ **Quale colonna fa da titolo alla card**, sotto `lg`.

    ⚠️ **La PRIMA che lo dichiara fra quelle VISIBILI**: se l'operatore spegne la
    colonna del nome, il titolo non può essere una cella che non c'è. In quel caso
    la card resta tutta a etichetta:valore, che è il comportamento onesto —
    inventare un titolo da un'altra colonna direbbe una cosa per un'altra.
  */
  protected readonly cardTitleId = computed(
    () => this.columns().find((column) => column.cardTitle)?.id ?? null,
  );

  protected readonly totalsCountLabel = computed(() => {
    const n = this.totals()?.count ?? 0;
    return `${n} ${n === 1 ? 'voce' : 'voci'}`;
  });

  protected footerLabelSpan(values: Readonly<Record<string, string>>): number {
    const prima = this.columns().findIndex((column) => values[column.id] !== undefined);
    const colonneDiTesta = prima < 0 ? this.columns().length : prima;
    return colonneDiTesta + (this.selectable() ? 1 : 0);
  }

  protected footerValue(
    values: Readonly<Record<string, string>>,
    column: ResolvedTableColumn,
  ): string | null {
    return values[column.id] ?? null;
  }

  /** Le colonne che il piede copre con un valore proprio. */
  protected footerColumns(
    values: Readonly<Record<string, string>>,
  ): readonly ResolvedTableColumn[] {
    const prima = this.columns().findIndex((column) => values[column.id] !== undefined);
    return prima < 0 ? [] : this.columns().slice(prima);
  }
}
