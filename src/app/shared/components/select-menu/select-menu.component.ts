import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { filterSelectMenuOptions } from '@shared/utils/select-menu-filter.util';

import type { SelectMenuOption } from './select-menu.model';

/**
 * Il respiro che il pannello tiene dal bordo del confine quando deve stringersi:
 * lo stesso passo di `--space-2`. In pixel perché qui si misura in pixel.
 */
const MARGINE_DAL_CONFINE_PX = 8;

/**
 * Menu a tendina custom (Polaris-like). Dumb: nessun service, solo input/output.
 * Sostituisce il <select> nativo dove serve controllo visivo sul pannello opzioni.
 */
@Component({
  selector: 'app-select-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'select-menu-host',
    '[class.select-menu-host--full]': 'fullWidth()',
    '[class.select-menu-host--fit]': 'fitContent()',
    '[class.select-menu-host--toolbar]': 'toolbarChip()',
    '[class.select-menu-host--match-input]': 'matchInputHeight()',
    '[class.select-menu-host--chip]': 'filterChip()',
    '[class.select-menu-host--icon]': 'iconOnly()',
    '[class.select-menu-host--open]': 'open()',
    '[class.select-menu-host--ribaltato]': 'ribaltato()',
    '[class.select-menu-host--stretto]': 'stretto()',
    '[class.select-menu-host--fixed]': 'panelFixed()',
    '[style.--select-menu-trigger-w.px]': 'larghezzaTrigger()',
    '(document:click)': 'onDocumentClick($event)',
    '(window:resize)': 'chiudiSeFisso()',
    '(document:keydown.escape)': 'close()',
  },
  templateUrl: './select-menu.component.html',
  styleUrl: './select-menu.component.scss',
})
export class SelectMenuComponent {
  private static nextInstanceId = 0;

  // REASON: ElementRef.nativeElement e' tipizzato any in Angular; il host e' sempre HTMLElement.
  private readonly hostElement: HTMLElement = inject(ElementRef<HTMLElement>)
    .nativeElement as HTMLElement;
  /** Serve a `afterNextRender` fuori dal contesto di iniezione (dentro un gestore). */
  private readonly injector = inject(Injector);
  protected readonly searchInputId = `select-menu-search-${++SelectMenuComponent.nextInstanceId}`;

  readonly options = input.required<readonly SelectMenuOption[]>();
  /** Valore selezionato; stringa vuota o null = opzione placeholder. */
  readonly value = input<string | null>(null);
  /** Se true, consente più valori (`values` / `valuesChange`). */
  readonly multiple = input<boolean>(false);
  /** Valori selezionati in modalità multipla. */
  readonly values = input<readonly string[]>([]);

  /*
    ⚠️ **Il trigger dice solo il NOME del filtro, mai la selezione.**

    Il predefinito mostra il valore, e su una barra filtri è la ragione per cui
    i controlli ballano: «Tutte» è largo un terzo di «Vendita al banco,
    Corrispettivo manuale», quindi a ogni spunta il filtro accanto si sposta.
    Su un gestionale che si usa con la coda dell'occhio è rumore continuo, e a
    barra chiusa quel dettaglio non serve a nessuno: chi vuole sapere cosa è
    selezionato apre il menu, dove nomi e spunte si leggono per intero.

    Con `labelOnly` il pulsante è largo quanto la sua etichetta e non cambia
    mai. Che il filtro stia restringendo qualcosa si vede dallo **stato
    premuto** — stesso testo, stessa larghezza, stesso padding — come i comandi
    di una barra strumenti desktop.
  */
  readonly labelOnly = input<boolean>(false);
  readonly ariaLabel = input.required<string>();
  /** Etichetta mostrata quando value e' null o vuoto. */
  readonly placeholder = input.required<string>();
  /** Classe PrimeIcons opzionale sul trigger (es. `pi-shop`). */
  readonly triggerIcon = input<string>();
  readonly compact = input<boolean>(false);
  /** Altezza allineata ai chip della topbar (location + sync + tema). */
  readonly toolbarChip = input<boolean>(false);
  /** Trigger e pannello a larghezza piena del contenitore (es. filtri mobile). */
  readonly fullWidth = input<boolean>(false);
  /**
   * Larghezza a contenuto: il trigger si dimensiona sull'opzione più larga
   * (via sizer invisibile), senza saltare al cambio di selezione e senza
   * occupare tutta la cella. Mai oltre il contenitore.
   */
  readonly fitContent = input<boolean>(false);
  /** Voce placeholder con valore vuoto (es. "Tutti"); disabilita per select obbligati. */
  readonly includeEmptyOption = input<boolean>(true);
  readonly matchInputHeight = input<boolean>(false);
  /**
   * Filtro inline a chip (restyle spec §Liste): quando un valore e' selezionato
   * il trigger prende la tinta accento e la chevron lascia il posto alla × che
   * azzera il filtro.
   */
  readonly filterChip = input<boolean>(false);
  /**
   * Etichetta mostrata dentro il chip prima del valore (es. «Categoria: Tutte»),
   * come nei mockup 1b/2b. Sostituisce la label esterna sopra il controllo.
   */
  readonly chipLabel = input<string>();
  readonly invalid = input<boolean>(false);
  readonly describedBy = input<string>();
  /** Campo ricerca sticky nel pannello (utile per liste lunghe, es. varianti). */
  readonly searchable = input<boolean>(false);
  readonly searchPlaceholder = input<string>('Cerca…');
  readonly searchAriaLabel = input<string>('Cerca nelle opzioni');
  /** Se false, la ricerca NON filtra le opzioni in locale (es. lookup server-side). */
  readonly filterOptionsLocally = input<boolean>(true);
  /**
   * ⭐ **Il testo con cui il pannello si RIAPRE.**
   *
   * ⛔ Senza, la ricerca si azzera a ogni chiusura — e va bene finché è solo un
   * modo per trovare una voce. Non va più bene da quando quel testo È un
   * filtro (`column-filter`): l'operatore scrive «ros», chiude, e l'elenco
   * resta ristretto mentre il campo che lo dice si è svuotato.
   */
  readonly searchValue = input<string>('');

  /**
   * ⭐ **Solo la freccia, senza casella** — la forma del filtro di colonna in
   * Danea, chiesta dal proprietario il 01/09/2026: «con questo sistema di
   * ricerca nei filtri, ha senso che compare un'altra casellina sotto
   * all'intestazione della colonna?».
   *
   * ⛔ **No, e costava una fascia su OGNI colonna**: una casella a tutta
   * larghezza sotto ogni titolo, per aprire una tendina che contiene già tutto.
   * Qui il trigger diventa un bersaglio quadrato accanto al titolo.
   *
   * ⚠️ **Il nome accessibile resta obbligatorio** (`ariaLabel`): senza
   * etichetta a schermo, è l'unica cosa che dice a cosa serve quella freccia.
   */
  readonly iconOnly = input<boolean>(false);

  /**
   * ⭐ **Il controllo è ACCESO**: con `iconOnly` è il solo segnale che dice che
   * quella colonna sta restringendo l'elenco — tolta la casella, senza questo
   * l'unico indizio sarebbe che le righe sono meno.
   */
  readonly highlighted = input<boolean>(false);
  /**
   * Detail sulla STESSA riga della label (opzioni compatte, es. colonna IVA):
   * il pannello si allarga a contenuto senza creare opzioni a doppia riga.
   */
  readonly inlineDetail = input<boolean>(false);
  /**
   * ⭐ **Il pannello ESCE dal contenitore che ritaglia** — 11/09/2026.
   *
   * ⛔ Dentro l’intestazione di una tabella il pannello è `absolute` nella
   * cella, e la regione di scorrimento della tabella (`overflow: auto`) lo
   * RITAGLIA quando le righe sono poche: misurato sul rapporto dell’import
   * prodotti (regione alta 60px, pannello coperto dalla barra sotto) e sulle
   * non allineate del pannello Shopify (tre righe: l’opzione «Errore di
   * lettura» esisteva e non era cliccabile). Sugli elenchi che riempiono la
   * finestra non si vedeva: la regione è sempre più alta del pannello.
   *
   * Con `panelFixed` il pannello è `position: fixed`, posizionato sul
   * rettangolo del trigger all’apertura: nessun `overflow` di antenato lo
   * ritaglia. Uno scorrimento fuori dal pannello lo chiude — la posizione
   * sarebbe altrimenti quella di un trigger che non è più lì.
   *
   * ⚠️ **Nasce spento**: lo accende il motore tabella sui filtri di colonna.
   * Un antenato con `transform` renderebbe il fisso relativo a lui, e nel
   * pannello laterale del telaio (un cassetto che si muove) non serve.
   */
  readonly panelFixed = input<boolean>(false);

  readonly valueChange = output<string | null>();
  readonly valuesChange = output<readonly string[]>();
  readonly searchChange = output<string>();

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  protected readonly open = signal(false);
  protected readonly searchQuery = signal('');

  /**
   * ⭐ **IL PANNELLO SI RIBALTA SE SBORDA DALLA FINESTRA** — proprietario,
   * 01/09/2026: «in questo caso, la tabella del filtro esce fuori pagina»,
   * aprendo il filtro della colonna Totale.
   *
   * ⛔ **La regola CSS che c'era copriva le ULTIME DUE colonne**, e la colonna
   * Totale è la terzultima: il difetto è tornato una colonna più a sinistra.
   * Contare le colonne è il criterio sbagliato — quello giusto è **quanto è
   * largo il pannello e quanto spazio resta**, che dipende dalla larghezza della
   * finestra e da quali colonne sono accese.
   *
   * ⚠️ **Si misura all'apertura, non si stima**: il pannello è `max-content`,
   * quindi la sua larghezza la conosce solo il browser dopo averlo reso.
   *
   * ⚠️ **Il ribaltamento è l'ultima risorsa, non la prima**: si applica solo se
   * a sinistra c'è più spazio che a destra. Su una finestra molto stretta il
   * pannello sborda comunque, e ribaltarlo lo farebbe uscire dall'altra parte.
   */
  protected readonly ribaltato = signal(false);
  /**
   * ⭐ **E QUANDO NON CI STA DA NESSUNA PARTE, SI STRINGE** — proprietario,
   * 14/09/2026, sull'anteprima al telefono (390px): la tendina delle sedi
   * misurava 352px da x=50 a x=402, oltre lo schermo, e tagliava i testi.
   *
   * ⛔ Il ribaltamento è «l'ultima risorsa» solo finché dall'altra parte c'è
   * spazio; su uno schermo stretto non ce n'è da nessuna delle due parti, e il
   * pannello — largo `max-content` fino al tetto — usciva e basta. Qui, misurato
   * all'apertura: se il pannello è più largo dello spazio fra i bordi del confine,
   * prende quello spazio (meno un respiro) e si allinea al bordo sinistro; se ci
   * sta nel confine ma non accanto al trigger, si spinge dentro fino al bordo
   * destro. Stretto, le etichette vanno a capo invece di finire in «…»: un testo
   * su due righe si legge, uno tagliato no. Sulla scrivania, dove il pannello
   * ci sta, non cambia niente.
   */
  protected readonly stretto = signal(false);
  /** La larghezza imposta al pannello stretto, in px; `null` = la sua. */
  protected readonly larghezzaMassima = signal<number | null>(null);
  /**
   * ⛔ **Il minimo del pannello FISSO non può essere «100%»**: per un elemento
   * `position: fixed` il 100% è la FINESTRA, non il trigger. Misurato il
   * 14/09/2026 sulla tabella delle sedi a 1280px: pannello largo 1280 da
   * x=748, tagliato dal bordo destro — e appena si misura lo spazio, un pannello
   * largo quanto la finestra «non ci sta da nessuna parte» e si stringerebbe a
   * tutta larghezza. La misura del trigger si dà al CSS all'apertura, e il
   * foglio la usa come minimo quando il contenitore non ne dichiara uno.
   */
  protected readonly larghezzaTrigger = signal<number | null>(null);
  /**
   * Coordinate del pannello decise all'apertura: sulla finestra se fisso
   * (`panelFixed`), relative al trigger se assoluto. `null` = quelle del CSS.
   */
  protected readonly fissoAlto = signal<number | null>(null);
  protected readonly fissoBasso = signal<number | null>(null);
  protected readonly fissoSinistra = signal<number | null>(null);
  protected readonly fissoDestra = signal<number | null>(null);
  private readonly chiudiSuScorrimento = (evento: Event): void => {
    // Lo scorrimento DENTRO il pannello (le voci, il calendario) non lo chiude.
    if (evento.target instanceof Node && this.hostElement.contains(evento.target)) {
      return;
    }
    this.close();
  };

  protected readonly visibleOptions = computed(() => {
    if (!this.searchable()) {
      return this.options();
    }
    if (!this.filterOptionsLocally()) {
      return this.options();
    }
    return filterSelectMenuOptions(this.options(), this.searchQuery());
  });

  protected readonly showSearchEmptyState = computed(
    () =>
      this.searchable() &&
      this.searchQuery().trim().length > 0 &&
      this.visibleOptions().length === 0,
  );

  protected readonly selectedOption = computed(() => {
    const current = this.value() ?? '';
    return this.options().find((option) => option.value === current) ?? null;
  });

  protected readonly selectedLabel = computed(() => {
    if (this.multiple()) {
      const selectedIds = this.values();
      if (selectedIds.length === 0) {
        return this.placeholder();
      }
      const labels = selectedIds.flatMap((id) => {
        const label = this.options().find((option) => option.value === id)?.label;
        return label ? [label] : [];
      });
      if (labels.length === 0) {
        return this.placeholder();
      }
      if (labels.length <= 2) {
        return labels.join(', ');
      }
      return `${labels.length} selezionati`;
    }
    const selected = this.selectedOption();
    return selected ? (selected.triggerLabel ?? selected.label) : this.placeholder();
  });

  /**
   * Testi che il trigger può mostrare (placeholder + triggerLabel/label di
   * ogni opzione): il sizer invisibile li impila per fissare la larghezza
   * del trigger sulla voce più larga.
   */
  protected readonly sizerLabels = computed(() => {
    if (!this.fitContent()) {
      return [] as readonly string[];
    }
    return [
      this.placeholder(),
      ...this.options().map((option) => option.triggerLabel ?? option.label),
    ];
  });

  protected readonly selectedSwatchCssColor = computed(() => {
    if (this.multiple()) {
      return this.values().length === 1
        ? this.options().find((option) => option.value === this.values()[0])?.swatchCssColor
        : undefined;
    }
    return this.selectedOption()?.swatchCssColor;
  });

  protected readonly isEmptySelected = computed(() => {
    if (this.multiple()) {
      return this.values().length === 0;
    }
    return (this.value() ?? '') === '';
  });

  /** Chip filtro attivo: modalita' chip + almeno un valore selezionato. */
  protected readonly chipActive = computed(() => this.filterChip() && !this.isEmptySelected());

  /** Azzera il filtro dalla × del chip, senza aprire il pannello. */
  protected clearFilter(event: MouseEvent): void {
    event.stopPropagation();
    if (this.multiple()) {
      this.valuesChange.emit([]);
    } else {
      this.valueChange.emit(null);
    }
    this.close();
  }

  protected isSelected(option: SelectMenuOption): boolean {
    if (this.multiple()) {
      return this.values().includes(option.value);
    }
    return (this.value() ?? '') === option.value;
  }

  /**
   * ⛔ Qui c'era `${label}, SKU ${detail}`: il prefisso era della PRIMA voce con
   *    un dettaglio (le varianti), ed è rimasto quando il dettaglio è diventato
   *    un'aliquota IVA, «Fornitore»/«Cliente» e — dal 14/09/2026 — la spiegazione
   *    di una scelta sulle sedi. Lo screen reader diceva «SKU 22% ordinaria».
   *    Il dettaglio si legge com'è: chi vuole la parola «SKU» la mette nel testo.
   */
  protected optionAriaLabel(option: SelectMenuOption): string {
    if (option.detail) {
      return `${option.label}, ${option.detail}`;
    }
    return option.label;
  }

  protected toggle(): void {
    const willOpen = !this.open();
    if (willOpen && this.searchable()) {
      // ⭐ Si riapre con quello che c'era: se il testo è un filtro, sparire
      //    all'apertura sarebbe dire il falso su come l'elenco è ristretto.
      this.searchQuery.set(this.searchValue());
      queueMicrotask(() => this.searchInput()?.nativeElement.focus());
    }
    if (!willOpen) {
      this.searchQuery.set(this.searchValue());
    }
    this.open.set(willOpen);
    if (willOpen) {
      this.larghezzaTrigger.set(this.hostElement.getBoundingClientRect().width);
      /*
        ⛔ **`queueMicrotask` NON basta, e la prima stesura lo usava.** Un
        microtask viene eseguito prima che Angular abbia reso il pannello:
        `querySelector` torna `null`, la funzione esce senza fare niente, e a
        schermo il pannello resta ancorato dalla parte sbagliata. Nessun errore
        — segnalato dal proprietario che continuava a vederlo uscire, con la
        correzione già scritta e già compilata.

        ⭐ `afterNextRender` è l'aggancio che garantisce il DOM dipinto, ed è
        anche il solo momento in cui `getBoundingClientRect` dice la verità su
        un pannello largo `max-content`.
      */
      afterNextRender(() => this.decidiIlLato(), { injector: this.injector });
      if (this.panelFixed()) {
        this.hostElement.ownerDocument.addEventListener('scroll', this.chiudiSuScorrimento, true);
      }
    } else {
      this.close();
    }
  }

  protected close(): void {
    this.open.set(false);
    this.ribaltato.set(false);
    this.stretto.set(false);
    this.larghezzaMassima.set(null);
    this.larghezzaTrigger.set(null);
    this.fissoAlto.set(null);
    this.fissoBasso.set(null);
    this.fissoSinistra.set(null);
    this.fissoDestra.set(null);
    this.hostElement.ownerDocument.removeEventListener('scroll', this.chiudiSuScorrimento, true);
    this.searchQuery.set(this.searchValue());
  }

  protected chiudiSeFisso(): void {
    if (this.panelFixed() && this.open()) {
      this.close();
    }
  }

  /**
   * Il pannello sborda a destra? Allora si ancora a destra del trigger.
   *
   * ⭐ **Il confine è il contenitore che SCORRE, non la finestra** — proprietario,
   * 01/09/2026: «in tabella non può riconoscere il confine e aprire dove ha
   * spazio?». Dentro un elenco il pannello può stare comodamente nella finestra
   * e sforare lo scrollport della tabella: lì non esce dallo schermo, allunga
   * il contenuto scorrevole e si fa raggiungere solo scorrendo di lato.
   *
   * ⚠️ **Si RIBALTA solo se dall'altra parte ci sta**: un pannello più largo
   * dello spazio disponibile in entrambe le direzioni esce comunque, e
   * ribaltarlo sposterebbe il difetto invece di toglierlo.
   */
  private decidiIlLato(): void {
    const pannello = this.hostElement.querySelector<HTMLElement>('.select-menu__panel');
    if (!pannello) {
      return;
    }
    const trigger = this.hostElement.getBoundingClientRect();
    const largo = pannello.getBoundingClientRect().width;
    const confine = this.confine();

    const staADestra = trigger.left + largo <= confine.destra;
    const staASinistra = trigger.right - largo >= confine.sinistra;
    const ribalta = !staADestra && staASinistra;
    this.ribaltato.set(ribalta);

    // Né a destra né a sinistra del trigger: si stringe allo spazio del confine
    // (con un respiro dai bordi) o, se ci sta, si spinge dentro dal lato destro.
    let sinistraDecisa: number | null = null;
    let larghezza: number | null = null;
    if (!staADestra && !staASinistra) {
      const bordoSinistro = confine.sinistra + MARGINE_DAL_CONFINE_PX;
      const bordoDestro = confine.destra - MARGINE_DAL_CONFINE_PX;
      const spazio = Math.max(0, bordoDestro - bordoSinistro);
      if (largo > spazio) {
        larghezza = spazio;
        sinistraDecisa = bordoSinistro;
      } else {
        sinistraDecisa = bordoDestro - largo;
      }
    }
    this.stretto.set(larghezza !== null);
    this.larghezzaMassima.set(larghezza);

    if (!this.panelFixed()) {
      // Assoluto: la coordinata è relativa al trigger, che è il suo contenitore.
      this.fissoSinistra.set(sinistraDecisa === null ? null : sinistraDecisa - trigger.left);
      this.fissoDestra.set(null);
      return;
    }

    // Fisso: le stesse coordinate dell’`absolute`, ma misurate sulla finestra —
    // il pannello si apre sotto il trigger, ancorato al lato deciso qui sopra.
    const finestra = this.hostElement.ownerDocument.defaultView;
    const larghezzaFinestra = finestra?.innerWidth ?? 0;
    const altezzaFinestra = finestra?.innerHeight ?? 0;
    // ⭐ E si apre SOPRA quando sotto non ci sta e sopra sì — la stessa
    //    regola del ribaltamento laterale. Un pannello sotto il bordo della
    //    finestra non si raggiunge: scorrere la pagina lo chiuderebbe.
    const alto = pannello.getBoundingClientRect().height;
    const staSotto = trigger.bottom + alto <= altezzaFinestra;
    const staSopra = trigger.top - alto >= 0;
    const sopra = !staSotto && staSopra;
    this.fissoAlto.set(sopra ? null : trigger.bottom);
    this.fissoBasso.set(sopra ? altezzaFinestra - trigger.top : null);
    this.fissoSinistra.set(sinistraDecisa ?? (ribalta ? null : trigger.left));
    this.fissoDestra.set(
      sinistraDecisa === null && ribalta ? larghezzaFinestra - trigger.right : null,
    );
  }

  /**
   * Il rettangolo entro cui il pannello deve stare: il primo antenato che
   * **ritaglia o scorre**, o in mancanza la finestra.
   *
   * ⚠️ **`overflow: visible` non conta**: un contenitore che non ritaglia lascia
   * uscire il pannello, quindi il confine da rispettare è quello di chi ritaglia
   * davvero — la barra strumenti, il pannello laterale, lo scrollport della
   * tabella.
   */
  private confine(): { readonly sinistra: number; readonly destra: number } {
    const finestra = this.hostElement.ownerDocument.defaultView;
    let nodo = this.hostElement.parentElement;

    // Un pannello fisso non è ritagliato da nessun antenato: il confine è la finestra.
    while (nodo && !this.panelFixed()) {
      const stile = finestra?.getComputedStyle(nodo);
      const scorre = stile ? /auto|scroll|hidden|clip/.test(stile.overflowX) : false;
      if (scorre) {
        const r = nodo.getBoundingClientRect();
        return { sinistra: r.left, destra: r.right };
      }
      nodo = nodo.parentElement;
    }

    return { sinistra: 0, destra: finestra?.innerWidth ?? 0 };
  }

  protected onSearchInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.searchQuery.set(target.value);
    /*
      ⚠️ **Si emette SEMPRE**, non solo quando il filtro è remoto.

      ⛔ Qui l'emissione era dentro `if (!filterOptionsLocally())`, cioè: chi
      filtra le opzioni in locale non sa che cosa è stato scritto. Va bene per
      una tendina; non va bene per il filtro di colonna, dove quel testo
      restringe anche le RIGHE — e chi ascolta non lo sapeva.

      ⚠️ Chi non ascolta l'output non nota niente: un `output` in più non è un
      comportamento in più.
    */
    this.searchChange.emit(target.value);
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  protected select(option: SelectMenuOption): void {
    if (this.multiple()) {
      if (!option.value) {
        this.valuesChange.emit([]);
        this.close();
        return;
      }
      const current = this.values();
      const next = current.includes(option.value)
        ? current.filter((entry) => entry !== option.value)
        : [...current, option.value];
      this.valuesChange.emit(next);
      return;
    }

    this.valueChange.emit(option.value || null);
    this.close();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!this.hostElement.contains(target)) {
      this.close();
    }
  }
}
